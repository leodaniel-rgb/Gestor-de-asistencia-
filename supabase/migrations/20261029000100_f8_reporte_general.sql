-- =============================================================================
-- F8 · Notas de coordinación, exclusión de reportes y reporte general
-- - alumnos_coordinacion: nota privada del coordinador por alumno y la marca
--   "no contar en reportes" (p. ej. un profesor que usa el gimnasio). Tabla
--   aparte porque los entrenadores leen todas las columnas de alumnos.
-- - admin_nota_alumno(): única vía de escritura; queda en la bitácora con motivo.
-- - reporte_listas, reporte_gimnasio y reporte_asistencias_detalle ignoran a los
--   alumnos excluidos y devuelven cuántos se excluyeron. reporte_gimnasio suma
--   alumnos distintos por género (para el reporte general).
-- - respaldo_completo() incluye las notas (el respaldo no excluye a nadie).
-- - admin_historial() del alumno incluye los cambios de su nota.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1–F7 y 20261028000100_fix_historial_turnos.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tabla
-- -----------------------------------------------------------------------------
create table public.alumnos_coordinacion (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null unique references public.alumnos (id),
  nota text check (nota is null or char_length(nota) between 1 and 300),
  excluido_reportes boolean not null default false,
  actualizado_por uuid references public.perfiles (id) default auth.uid(),
  actualizado_en timestamptz not null default now(),
  -- Excluir siempre lleva una nota que explique por qué.
  check (not excluido_reportes or nota is not null)
);

create trigger alumnos_coordinacion_bitacora
  after insert or update or delete on public.alumnos_coordinacion
  for each row execute function privado.registrar_bitacora();

revoke all on public.alumnos_coordinacion from anon, authenticated;
-- Solo lectura; la escritura pasa por admin_nota_alumno (security definer).
grant select on public.alumnos_coordinacion to authenticated;

alter table public.alumnos_coordinacion enable row level security;

create policy alumnos_coordinacion_select on public.alumnos_coordinacion
  for select to authenticated
  using ((select privado.es_coordinador()));

-- -----------------------------------------------------------------------------
-- Escritura de la nota
-- Excluir exige nota (mín. 5 caracteres), que también es el motivo en la
-- bitácora. Volver a contar a un alumno excluido exige un motivo aparte.
-- -----------------------------------------------------------------------------
create function public.admin_nota_alumno(
  p_alumno uuid,
  p_nota text,
  p_excluir boolean,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(regexp_replace(btrim(coalesce(p_nota, '')), '\s+', ' ', 'g'), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_excluido boolean;
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación edita notas de alumnos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.alumnos where id = p_alumno) then
    raise exception 'El alumno no existe' using errcode = '22023';
  end if;
  if v_nota is not null and char_length(v_nota) > 300 then
    raise exception 'La nota admite máximo 300 caracteres' using errcode = '22023';
  end if;
  if p_excluir and (v_nota is null or char_length(v_nota) < 5) then
    raise exception 'Para no contarlo en reportes escribe una nota (mínimo 5 caracteres)' using errcode = '22023';
  end if;

  select ac.excluido_reportes into v_excluido
  from public.alumnos_coordinacion ac where ac.alumno_id = p_alumno;
  if coalesce(v_excluido, false) and not p_excluir and (v_motivo is null or char_length(v_motivo) < 5) then
    raise exception 'Escribe el motivo para volver a contarlo en reportes (mínimo 5 caracteres)' using errcode = '22023';
  end if;
  -- Sin nota previa y sin nada que guardar: no se crea una fila vacía.
  if v_excluido is null and v_nota is null and not p_excluir then
    return;
  end if;

  perform privado.iniciar_correccion(coalesce(v_motivo, v_nota, 'Nota de coordinación borrada'));

  insert into public.alumnos_coordinacion (alumno_id, nota, excluido_reportes)
  values (p_alumno, v_nota, p_excluir)
  on conflict (alumno_id) do update
    set nota = excluded.nota,
        excluido_reportes = excluded.excluido_reportes,
        actualizado_por = (select auth.uid()),
        actualizado_en = now()
    where (public.alumnos_coordinacion.nota, public.alumnos_coordinacion.excluido_reportes)
          is distinct from (excluded.nota, excluded.excluido_reportes);
end;
$$;

-- -----------------------------------------------------------------------------
-- ¿El alumno está excluido de los reportes? (usada solo dentro de los reportes)
-- -----------------------------------------------------------------------------
create function privado.alumno_excluido(p_alumno uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.alumnos_coordinacion ac
    where ac.alumno_id = p_alumno and ac.excluido_reportes
  );
$$;
revoke all on function privado.alumno_excluido(uuid) from public, anon;
grant execute on function privado.alumno_excluido(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Selecciones y talleres (misma firma y lógica que F6, sin excluidos)
-- -----------------------------------------------------------------------------
create or replace function public.reporte_listas(
  p_desde date,
  p_hasta date,
  p_disciplinas uuid[] default null,
  p_dias smallint[] default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación ve los reportes' using errcode = '42501';
  end if;
  perform privado.validar_rango_reporte(p_desde, p_hasta);

  with ses as (
    select s.id, s.fecha, s.hora_inicio, s.disciplina_id, d.nombre as disciplina
    from public.sesiones s
    join public.disciplinas d on d.id = s.disciplina_id
    where not s.anulada
      and s.fecha between p_desde and p_hasta
      and (p_disciplinas is null or s.disciplina_id = any (p_disciplinas))
      and (p_dias is null or extract(isodow from s.fecha)::smallint = any (p_dias))
  ),
  conteos as (
    select ses.id,
      count(*) filter (where a.estado = 'asistio' and al.genero = 'femenino') as af,
      count(*) filter (where a.estado = 'asistio' and al.genero = 'masculino') as am,
      count(*) filter (where a.estado = 'asistio' and al.genero = 'no_binario') as anb,
      count(*) filter (where a.estado = 'asistio' and al.genero is null) as asa,
      count(*) filter (where a.estado = 'falta' and al.genero = 'femenino') as ff,
      count(*) filter (where a.estado = 'falta' and al.genero = 'masculino') as fm,
      count(*) filter (where a.estado = 'falta' and al.genero = 'no_binario') as fnb,
      count(*) filter (where a.estado = 'falta' and al.genero is null) as fsa
    from ses
    join public.asistencias a on a.sesion_id = ses.id and a.alumno_id is not null
    join public.alumnos al on al.id = a.alumno_id
    where not privado.alumno_excluido(al.id)
    group by ses.id
  )
  select jsonb_build_object(
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ses.id,
        'fecha', ses.fecha,
        'hora', to_char(ses.hora_inicio, 'HH24:MI'),
        'disciplina_id', ses.disciplina_id,
        'disciplina', ses.disciplina,
        'asistio', jsonb_build_object('f', coalesce(c.af, 0), 'm', coalesce(c.am, 0), 'nb', coalesce(c.anb, 0), 'sa', coalesce(c.asa, 0)),
        'falta', jsonb_build_object('f', coalesce(c.ff, 0), 'm', coalesce(c.fm, 0), 'nb', coalesce(c.fnb, 0), 'sa', coalesce(c.fsa, 0))
      ) order by ses.fecha, ses.hora_inicio)
      from ses left join conteos c on c.id = ses.id
    ), '[]'::jsonb),
    'incidencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', ses.fecha, 'disciplina', ses.disciplina, 'categoria', o.nombre, 'descripcion', i.descripcion
      ) order by ses.fecha, ses.hora_inicio)
      from ses
      join public.incidencias i on i.sesion_id = ses.id
      join public.catalogo_opciones o on o.id = i.categoria_id
    ), '[]'::jsonb),
    'sin_clase', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', dsc.fecha, 'disciplina', d.nombre, 'motivo', o.nombre) order by dsc.fecha)
      from public.dias_sin_clase dsc
      join public.disciplinas d on d.id = dsc.disciplina_id
      left join public.catalogo_opciones o on o.id = dsc.motivo_id
      where not dsc.anulado
        and dsc.fecha between p_desde and p_hasta
        and (p_disciplinas is null or dsc.disciplina_id = any (p_disciplinas))
        and (p_dias is null or extract(isodow from dsc.fecha)::smallint = any (p_dias))
    ), '[]'::jsonb),
    'pendientes', (
      select count(*) from ses
      join public.asistencias a on a.sesion_id = ses.id
      join public.solicitudes so on so.id = a.solicitud_id
      where a.alumno_id is null and so.estado = 'pendiente'
    ),
    -- Alumnos excluidos que sí tienen asistencias en el periodo.
    'excluidos', (
      select count(distinct a.alumno_id) from ses
      join public.asistencias a on a.sesion_id = ses.id and a.alumno_id is not null
      where privado.alumno_excluido(a.alumno_id)
    )
  ) into v;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gimnasio (misma firma y lógica que F6, sin excluidos y con género)
-- -----------------------------------------------------------------------------
create or replace function public.reporte_gimnasio(
  p_desde date,
  p_hasta date,
  p_disciplinas uuid[] default null,
  p_dias smallint[] default null,
  p_incluir_corregidas boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación ve los reportes' using errcode = '42501';
  end if;
  perform privado.validar_rango_reporte(p_desde, p_hasta);

  with tur as (
    select t.* from public.turnos_gimnasio t
    where t.fecha between p_desde and p_hasta
      and (p_disciplinas is null or t.disciplina_id = any (p_disciplinas))
      and (p_dias is null or extract(isodow from t.fecha)::smallint = any (p_dias))
  ),
  todos as (
    select r.*, tur.fecha, tur.nombre as turno_nombre, tur.cerrado_en,
      privado.alumno_excluido(r.alumno_id) as excluido
    from public.registros_gimnasio r
    join tur on tur.id = r.turno_id
    where not r.anulado
  ),
  reg as (
    select * from todos where not excluido
  ),
  distintos as (
    select distinct al.id, al.genero
    from reg join public.alumnos al on al.id = reg.alumno_id
  )
  select jsonb_build_object(
    'turnos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tur.id, 'fecha', tur.fecha, 'nombre', tur.nombre,
        'abierto_en', tur.abierto_en, 'cerrado_en', tur.cerrado_en,
        'entradas', (select count(*) from reg where reg.turno_id = tur.id),
        'sin_salida', (select count(*) from reg where reg.turno_id = tur.id and reg.salida is null and tur.cerrado_en is not null)
      ) order by tur.abierto_en)
      from tur
    ), '[]'::jsonb),
    -- Entradas sin identidad: fecha, hora local y turno (para concurrencia).
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha', reg.fecha,
        'dia', extract(isodow from reg.fecha)::int,
        'hora', extract(hour from reg.entrada at time zone 'America/Mexico_City')::int,
        'turno', reg.turno_nombre
      ))
      from reg
    ), '[]'::jsonb),
    'alumnos_distintos', (select count(*) from distintos),
    -- Alumnos distintos por género (el kiosco no lo pide: muchos quedan sin asignar).
    'por_genero', (
      select jsonb_build_object(
        'f', count(*) filter (where genero = 'femenino'),
        'm', count(*) filter (where genero = 'masculino'),
        'nb', count(*) filter (where genero = 'no_binario'),
        'sa', count(*) filter (where genero is null)
      ) from distintos
    ),
    'sin_salida', (select count(*) from reg where salida is null and cerrado_en is not null),
    'promedio_minutos', (
      select round(avg(extract(epoch from (salida - entrada)) / 60)::numeric, 1)
      from reg where salida is not null and (p_incluir_corregidas or not salida_corregida)
    ),
    'top', coalesce((
      select jsonb_agg(x order by (x ->> 'visitas')::int desc, x ->> 'nombre')
      from (
        select jsonb_build_object('nombre', a.nombre, 'matricula', a.matricula, 'visitas', count(*)) as x
        from reg join public.alumnos a on a.id = reg.alumno_id
        group by a.id, a.nombre, a.matricula
        order by count(*) desc, a.nombre
        limit 3
      ) t
    ), '[]'::jsonb),
    'excluidos', (select count(distinct alumno_id) from todos where excluido)
  ) into v;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Detalle por alumno para el Excel (misma firma y lógica que F7, sin excluidos)
-- -----------------------------------------------------------------------------
create or replace function public.reporte_asistencias_detalle(
  p_desde date,
  p_hasta date,
  p_disciplinas uuid[] default null,
  p_dias smallint[] default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación ve los reportes' using errcode = '42501';
  end if;
  perform privado.validar_rango_reporte(p_desde, p_hasta);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'fecha', s.fecha,
      'hora', to_char(s.hora_inicio, 'HH24:MI'),
      'disciplina', d.nombre,
      'matricula', al.matricula,
      'nombre', al.nombre,
      'genero', al.genero,
      'estado', a.estado
    ) order by s.fecha, s.hora_inicio, d.nombre, al.nombre)
    from public.sesiones s
    join public.disciplinas d on d.id = s.disciplina_id
    join public.asistencias a on a.sesion_id = s.id and a.alumno_id is not null
    join public.alumnos al on al.id = a.alumno_id
    where not s.anulada
      and s.fecha between p_desde and p_hasta
      and (p_disciplinas is null or s.disciplina_id = any (p_disciplinas))
      and (p_dias is null or extract(isodow from s.fecha)::smallint = any (p_dias))
      and not privado.alumno_excluido(al.id)
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Respaldo completo: lo mismo que F7 más las notas de coordinación.
-- -----------------------------------------------------------------------------
create or replace function public.respaldo_completo()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación descarga respaldos' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generado_en', now(),
    'disciplinas', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre', d.nombre, 'tipo', d.tipo, 'dias_clase', d.dias_clase, 'activa', d.activa, 'creado_en', d.creado_en
      ) order by d.nombre) from public.disciplinas d), '[]'::jsonb),
    'entrenadores', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre', p.nombre, 'correo', p.correo, 'activo', p.activo,
        'disciplinas', (select string_agg(d.nombre, ', ' order by d.nombre)
                        from public.entrenador_disciplina ed join public.disciplinas d on d.id = ed.disciplina_id
                        where ed.entrenador_id = p.id)
      ) order by p.nombre) from public.perfiles p where p.rol = 'entrenador'), '[]'::jsonb),
    'alumnos', coalesce((select jsonb_agg(jsonb_build_object(
        'matricula', a.matricula, 'nombre', a.nombre, 'genero', a.genero, 'creado_en', a.creado_en
      ) order by a.nombre) from public.alumnos a), '[]'::jsonb),
    'notas_alumnos', coalesce((select jsonb_agg(jsonb_build_object(
        'matricula', a.matricula, 'nombre', a.nombre, 'nota', ac.nota,
        'excluido_reportes', ac.excluido_reportes, 'actualizado_en', ac.actualizado_en
      ) order by a.nombre)
      from public.alumnos_coordinacion ac
      join public.alumnos a on a.id = ac.alumno_id
      where ac.nota is not null or ac.excluido_reportes), '[]'::jsonb),
    'inscripciones', coalesce((select jsonb_agg(jsonb_build_object(
        'matricula', a.matricula, 'nombre', a.nombre, 'disciplina', d.nombre,
        'fecha_alta', i.fecha_alta, 'fecha_baja', i.fecha_baja
      ) order by d.nombre, a.nombre)
      from public.inscripciones i
      join public.alumnos a on a.id = i.alumno_id
      join public.disciplinas d on d.id = i.disciplina_id), '[]'::jsonb),
    'asistencias', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', s.fecha, 'hora', to_char(s.hora_inicio, 'HH24:MI'), 'disciplina', d.nombre,
        'matricula', coalesce(al.matricula, so.matricula), 'nombre', coalesce(al.nombre, so.nombre),
        'estado', a.estado,
        'sesion_anulada', s.anulada,
        'pendiente_de_aprobacion', a.alumno_id is null,
        'registro_tardio', s.registro_tardio,
        'capturada_por_coordinacion', s.capturada_por_coordinacion,
        'registrada_por', p.nombre
      ) order by s.fecha, s.hora_inicio, d.nombre)
      from public.asistencias a
      join public.sesiones s on s.id = a.sesion_id
      join public.disciplinas d on d.id = s.disciplina_id
      left join public.alumnos al on al.id = a.alumno_id
      left join public.solicitudes so on so.id = a.solicitud_id
      left join public.perfiles p on p.id = s.entrenador_id), '[]'::jsonb),
    'incidencias', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', s.fecha, 'disciplina', d.nombre, 'categoria', o.nombre, 'descripcion', i.descripcion,
        'sesion_anulada', s.anulada
      ) order by s.fecha)
      from public.incidencias i
      join public.sesiones s on s.id = i.sesion_id
      join public.disciplinas d on d.id = s.disciplina_id
      join public.catalogo_opciones o on o.id = i.categoria_id), '[]'::jsonb),
    'dias_sin_clase', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', x.fecha, 'disciplina', d.nombre, 'motivo', o.nombre, 'anulado', x.anulado
      ) order by x.fecha)
      from public.dias_sin_clase x
      join public.disciplinas d on d.id = x.disciplina_id
      left join public.catalogo_opciones o on o.id = x.motivo_id), '[]'::jsonb),
    'gimnasio', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', t.fecha, 'turno', t.nombre, 'matricula', a.matricula, 'nombre', a.nombre,
        'entrada', r.entrada, 'salida', r.salida, 'salida_corregida', r.salida_corregida, 'anulado', r.anulado
      ) order by r.entrada)
      from public.registros_gimnasio r
      join public.turnos_gimnasio t on t.id = r.turno_id
      join public.alumnos a on a.id = r.alumno_id), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(jsonb_build_object(
        'creado_en', s.creado_en, 'tipo', s.tipo, 'estado', s.estado, 'disciplina', d.nombre,
        'matricula', coalesce(s.matricula, al.matricula), 'nombre', coalesce(s.nombre, al.nombre),
        'motivo_rechazo', s.motivo_rechazo
      ) order by s.creado_en)
      from public.solicitudes s
      join public.disciplinas d on d.id = s.disciplina_id
      left join public.inscripciones i on i.id = s.inscripcion_id
      left join public.alumnos al on al.id = i.alumno_id), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Historial: el del alumno incluye los cambios de su nota de coordinación.
-- (Conserva el filtro del contador de búsquedas del fix 20261028000100.)
-- -----------------------------------------------------------------------------
create or replace function public.admin_historial(p_entidad text, p_id uuid)
returns table (
  ocurrido_en timestamptz,
  actor_nombre text,
  accion text,
  entidad text,
  antes jsonb,
  despues jsonb,
  motivo text
)
language sql
stable
set search_path = ''
as $$
  select b.ocurrido_en, p.nombre, b.accion, b.entidad, b.antes, b.despues, b.motivo
  from public.bitacora b
  left join public.perfiles p on p.id = b.actor
  where privado.es_coordinador()
    and (
      (b.entidad = p_entidad and b.entidad_id = p_id::text)
      or (p_entidad = 'sesiones' and b.entidad in ('asistencias', 'incidencias')
          and coalesce(b.despues ->> 'sesion_id', b.antes ->> 'sesion_id') = p_id::text)
      or (p_entidad = 'turnos_gimnasio' and b.entidad = 'registros_gimnasio'
          and coalesce(b.despues ->> 'turno_id', b.antes ->> 'turno_id') = p_id::text)
      or (p_entidad = 'alumnos' and b.entidad = 'alumnos_coordinacion'
          and coalesce(b.despues ->> 'alumno_id', b.antes ->> 'alumno_id') = p_id::text)
    )
    and not (
      b.entidad = 'turnos_gimnasio' and b.accion = 'update'
      and (b.antes - 'ventana_busquedas' - 'busquedas_en_ventana')
          is not distinct from (b.despues - 'ventana_busquedas' - 'busquedas_en_ventana')
    )
  order by b.ocurrido_en desc, b.id desc
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke all on function public.admin_nota_alumno(uuid, text, boolean, text) from public, anon;
revoke all on function public.reporte_listas(date, date, uuid[], smallint[]) from public, anon;
revoke all on function public.reporte_gimnasio(date, date, uuid[], smallint[], boolean) from public, anon;
revoke all on function public.reporte_asistencias_detalle(date, date, uuid[], smallint[]) from public, anon;
revoke all on function public.respaldo_completo() from public, anon;
revoke all on function public.admin_historial(text, uuid) from public, anon;

grant execute on function public.admin_nota_alumno(uuid, text, boolean, text) to authenticated;
grant execute on function public.reporte_listas(date, date, uuid[], smallint[]) to authenticated;
grant execute on function public.reporte_gimnasio(date, date, uuid[], smallint[], boolean) to authenticated;
grant execute on function public.reporte_asistencias_detalle(date, date, uuid[], smallint[]) to authenticated;
grant execute on function public.respaldo_completo() to authenticated;
grant execute on function public.admin_historial(text, uuid) to authenticated;

commit;

-- =============================================================================
-- F6 · Funciones de reporte para los dashboards (solo coordinación)
-- - Rango máximo de 3 meses (92 días).
-- - No cuentan: sesiones/registros anulados, días sin clase anulados, ni
--   asistencias de alumnos pendientes de aprobación (alumno_id nulo).
-- - Devuelven totales, no listas de alumnos (salvo el top 3 del gimnasio).
-- SECURITY INVOKER: RLS aplica; además exigen ser coordinador.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1–F5.
-- =============================================================================

begin;

create function privado.validar_rango_reporte(p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas no válido' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 92 then
    raise exception 'El rango máximo es de 3 meses' using errcode = '22023';
  end if;
end;
$$;
grant execute on function privado.validar_rango_reporte(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Selecciones y talleres
-- p_dias: días ISO (1 = lunes … 7 = domingo); null = todos.
-- -----------------------------------------------------------------------------
create function public.reporte_listas(
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
    )
  ) into v;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gimnasio
-- p_incluir_corregidas: si true, el tiempo promedio también usa salidas
-- puestas por la coordinación.
-- -----------------------------------------------------------------------------
create function public.reporte_gimnasio(
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
  reg as (
    select r.*, tur.fecha, tur.nombre as turno_nombre, tur.cerrado_en
    from public.registros_gimnasio r
    join tur on tur.id = r.turno_id
    where not r.anulado
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
    'alumnos_distintos', (select count(distinct alumno_id) from reg),
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
    ), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

revoke all on function public.reporte_listas(date, date, uuid[], smallint[]) from public, anon;
revoke all on function public.reporte_gimnasio(date, date, uuid[], smallint[], boolean) from public, anon;
grant execute on function public.reporte_listas(date, date, uuid[], smallint[]) to authenticated;
grant execute on function public.reporte_gimnasio(date, date, uuid[], smallint[], boolean) to authenticated;

commit;

-- =============================================================================
-- F5 · Administración y corrección de datos por la coordinación
-- - Motivo obligatorio en cada corrección (se guarda en la bitácora).
-- - Anular en lugar de borrar (sesiones, registros de gimnasio, días sin clase).
-- - Salidas corregidas en el gimnasio.
-- - Captura de sesiones por la coordinación.
-- Todas las correcciones pasan por funciones SECURITY DEFINER que exigen ser
-- coordinador y un motivo; el entrenador no puede tocar estas columnas.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1–F4.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Bitácora: motivo de la corrección
-- -----------------------------------------------------------------------------
alter table public.bitacora
  add column motivo text check (motivo is null or char_length(motivo) <= 300);

-- El motivo llega por una variable de la transacción ('vive.motivo') que
-- fijan las funciones de corrección. Si no hay, queda vacío.
create or replace function privado.registrar_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bitacora (actor, accion, entidad, entidad_id, antes, despues, motivo)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    nullif(current_setting('vive.motivo', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Columnas de anulación y corrección
-- -----------------------------------------------------------------------------
alter table public.sesiones
  add column anulada boolean not null default false,
  add column capturada_por_coordinacion boolean not null default false;

alter table public.registros_gimnasio
  add column anulado boolean not null default false,
  add column salida_corregida boolean not null default false;

alter table public.dias_sin_clase
  add column anulado boolean not null default false;

-- Una sesión anulada ya no la corrige el entrenador.
create or replace function privado.puede_corregir_sesion(p_sesion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sesiones s
    where s.id = p_sesion
      and not s.anulada
      and privado.es_entrenador_de(s.disciplina_id)
      and s.creado_en > now() - interval '24 hours'
  );
$$;

-- -----------------------------------------------------------------------------
-- Auxiliar: exige coordinador y motivo, y deja el motivo para la bitácora.
-- -----------------------------------------------------------------------------
create function privado.iniciar_correccion(p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación puede corregir datos' using errcode = '42501';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 5 then
    raise exception 'Escribe el motivo de la corrección (mínimo 5 caracteres)' using errcode = '22023';
  end if;
  perform set_config('vive.motivo', left(btrim(p_motivo), 300), true);
end;
$$;
revoke all on function privado.iniciar_correccion(text) from public, anon;
grant execute on function privado.iniciar_correccion(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Sesiones
-- -----------------------------------------------------------------------------
create function public.admin_corregir_sesion(
  p_sesion uuid,
  p_hora time,
  p_marcas jsonb,
  p_incidencias jsonb,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca jsonb;
begin
  perform privado.iniciar_correccion(p_motivo);
  if not exists (select 1 from public.sesiones where id = p_sesion and not anulada) then
    raise exception 'La sesión no existe o está anulada' using errcode = '22023';
  end if;

  update public.sesiones set hora_inicio = p_hora
  where id = p_sesion and hora_inicio is distinct from p_hora;

  for v_marca in select * from jsonb_array_elements(coalesce(p_marcas, '[]'::jsonb)) loop
    update public.asistencias
    set estado = (v_marca ->> 'estado')::public.estado_asistencia
    where id = (v_marca ->> 'id')::uuid and sesion_id = p_sesion
      and estado is distinct from (v_marca ->> 'estado')::public.estado_asistencia;
  end loop;

  -- Incidencias: se reemplazan solo si cambiaron.
  if (select coalesce(jsonb_agg(jsonb_build_object('c', categoria_id, 'd', coalesce(descripcion, '')) order by categoria_id, descripcion), '[]')
      from public.incidencias where sesion_id = p_sesion)
     is distinct from
     (select coalesce(jsonb_agg(jsonb_build_object('c', (x ->> 'categoria_id')::uuid, 'd', coalesce(nullif(btrim(x ->> 'descripcion'), ''), ''))
        order by (x ->> 'categoria_id')::uuid, nullif(btrim(x ->> 'descripcion'), '')), '[]')
      from jsonb_array_elements(coalesce(p_incidencias, '[]'::jsonb)) x) then
    delete from public.incidencias where sesion_id = p_sesion;
    insert into public.incidencias (sesion_id, categoria_id, descripcion)
    select p_sesion, (x ->> 'categoria_id')::uuid, nullif(btrim(x ->> 'descripcion'), '')
    from jsonb_array_elements(coalesce(p_incidencias, '[]'::jsonb)) x;
  end if;
end;
$$;

create function public.admin_anular_sesion(p_sesion uuid, p_anular boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.iniciar_correccion(p_motivo);
  update public.sesiones set anulada = p_anular where id = p_sesion and anulada <> p_anular;
  if not found then
    raise exception 'La sesión no existe o ya tenía ese estado' using errcode = '22023';
  end if;
end;
$$;

-- Captura por la coordinación (lista en papel, entrenador sin acceso, etc.).
-- Cualquier fecha pasada o de hoy; exige marcar a toda la lista vigente.
create function public.admin_capturar_sesion(
  p_disciplina uuid,
  p_fecha date,
  p_hora time,
  p_marcas jsonb,
  p_incidencias jsonb,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sesion uuid;
  v_esperados int;
  v_marcados int;
begin
  perform privado.iniciar_correccion(p_motivo);
  if p_fecha > privado.hoy_mx() then
    raise exception 'No se pueden capturar fechas futuras' using errcode = '22023';
  end if;
  if not exists (select 1 from public.disciplinas where id = p_disciplina and tipo = 'lista') then
    raise exception 'La disciplina no existe o no lleva lista' using errcode = '22023';
  end if;

  with esperados as (
    select i.alumno_id, null::uuid as solicitud_id
    from public.inscripciones i
    where i.disciplina_id = p_disciplina and i.fecha_baja is null
    union all
    select null, s.id from public.solicitudes s
    where s.disciplina_id = p_disciplina and s.tipo = 'alta' and s.estado = 'pendiente'
  ),
  marcas as (
    select (m ->> 'alumno_id')::uuid as alumno_id, (m ->> 'solicitud_id')::uuid as solicitud_id
    from jsonb_array_elements(p_marcas) m
  )
  select (select count(*) from esperados),
         (select count(*) from marcas m join esperados e
            on m.alumno_id is not distinct from e.alumno_id
           and m.solicitud_id is not distinct from e.solicitud_id)
  into v_esperados, v_marcados;

  if v_esperados = 0 or v_marcados <> v_esperados or jsonb_array_length(p_marcas) <> v_esperados then
    raise exception 'Faltan alumnos por marcar o hay marcas que no corresponden a la lista' using errcode = '22023';
  end if;

  insert into public.sesiones (disciplina_id, fecha, hora_inicio, entrenador_id, capturada_por_coordinacion)
  values (p_disciplina, p_fecha, p_hora, (select auth.uid()), true)
  returning id into v_sesion;

  insert into public.asistencias (sesion_id, alumno_id, solicitud_id, estado)
  select v_sesion, (m ->> 'alumno_id')::uuid, (m ->> 'solicitud_id')::uuid, (m ->> 'estado')::public.estado_asistencia
  from jsonb_array_elements(p_marcas) m;

  insert into public.incidencias (sesion_id, categoria_id, descripcion)
  select v_sesion, (x ->> 'categoria_id')::uuid, nullif(btrim(x ->> 'descripcion'), '')
  from jsonb_array_elements(coalesce(p_incidencias, '[]'::jsonb)) x;

  return v_sesion;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gimnasio
-- -----------------------------------------------------------------------------
create function public.admin_cerrar_turno(p_turno uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.iniciar_correccion(p_motivo);
  update public.turnos_gimnasio set cerrado_en = now(), cerrado_por = (select auth.uid())
  where id = p_turno and cerrado_en is null;
  if not found then
    raise exception 'El turno no existe o ya estaba cerrado' using errcode = '22023';
  end if;
end;
$$;

-- Pone la hora de salida a quien no la registró. Queda marcada como corregida.
create function public.admin_corregir_salida(p_registro uuid, p_salida timestamptz, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.registros_gimnasio%rowtype;
  v_turno public.turnos_gimnasio%rowtype;
begin
  perform privado.iniciar_correccion(p_motivo);
  select * into v from public.registros_gimnasio where id = p_registro;
  if not found then
    raise exception 'El registro no existe' using errcode = '22023';
  end if;
  select * into v_turno from public.turnos_gimnasio where id = v.turno_id;
  if v_turno.cerrado_en is null then
    raise exception 'Cierra el turno antes de corregir salidas' using errcode = '22023';
  end if;
  if p_salida < v.entrada or p_salida > now() then
    raise exception 'La salida debe ser posterior a la entrada y no futura' using errcode = '22023';
  end if;
  update public.registros_gimnasio set salida = p_salida, salida_corregida = true where id = p_registro;
end;
$$;

create function public.admin_anular_registro_gimnasio(p_registro uuid, p_anular boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.iniciar_correccion(p_motivo);
  update public.registros_gimnasio set anulado = p_anular where id = p_registro and anulado <> p_anular;
  if not found then
    raise exception 'El registro no existe o ya tenía ese estado' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Días sin clase
-- -----------------------------------------------------------------------------
create function public.admin_anular_sin_clase(p_id uuid, p_anular boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.iniciar_correccion(p_motivo);
  update public.dias_sin_clase set anulado = p_anular where id = p_id and anulado <> p_anular;
  if not found then
    raise exception 'El registro no existe o ya tenía ese estado' using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alumnos (corrección por la coordinación, con motivo)
-- -----------------------------------------------------------------------------
create function public.admin_actualizar_alumno(
  p_alumno uuid,
  p_matricula text,
  p_nombre text,
  p_genero public.genero,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.iniciar_correccion(p_motivo);
  update public.alumnos
  set matricula = p_matricula, nombre = regexp_replace(btrim(p_nombre), '\s+', ' ', 'g'), genero = p_genero
  where id = p_alumno
    and (matricula, nombre, genero) is distinct from (p_matricula, regexp_replace(btrim(p_nombre), '\s+', ' ', 'g'), p_genero);
end;
$$;

-- -----------------------------------------------------------------------------
-- Historial de un registro (solo coordinación; SECURITY INVOKER + RLS)
-- p_entidad: 'sesiones' (incluye sus asistencias e incidencias),
--            'turnos_gimnasio' (incluye sus registros), 'alumnos', 'dias_sin_clase'.
-- -----------------------------------------------------------------------------
create function public.admin_historial(p_entidad text, p_id uuid)
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
    )
  order by b.ocurrido_en desc, b.id desc
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke all on function public.admin_corregir_sesion(uuid, time, jsonb, jsonb, text) from public, anon;
revoke all on function public.admin_anular_sesion(uuid, boolean, text) from public, anon;
revoke all on function public.admin_capturar_sesion(uuid, date, time, jsonb, jsonb, text) from public, anon;
revoke all on function public.admin_cerrar_turno(uuid, text) from public, anon;
revoke all on function public.admin_corregir_salida(uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_anular_registro_gimnasio(uuid, boolean, text) from public, anon;
revoke all on function public.admin_anular_sin_clase(uuid, boolean, text) from public, anon;
revoke all on function public.admin_actualizar_alumno(uuid, text, text, public.genero, text) from public, anon;
revoke all on function public.admin_historial(text, uuid) from public, anon;

grant execute on function public.admin_corregir_sesion(uuid, time, jsonb, jsonb, text) to authenticated;
grant execute on function public.admin_anular_sesion(uuid, boolean, text) to authenticated;
grant execute on function public.admin_capturar_sesion(uuid, date, time, jsonb, jsonb, text) to authenticated;
grant execute on function public.admin_cerrar_turno(uuid, text) to authenticated;
grant execute on function public.admin_corregir_salida(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_anular_registro_gimnasio(uuid, boolean, text) to authenticated;
grant execute on function public.admin_anular_sin_clase(uuid, boolean, text) to authenticated;
grant execute on function public.admin_actualizar_alumno(uuid, text, text, public.genero, text) to authenticated;
grant execute on function public.admin_historial(text, uuid) to authenticated;

commit;

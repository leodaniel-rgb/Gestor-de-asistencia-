-- =============================================================================
-- F2b · Importación de listas y solicitudes (alta / baja) de entrenadores
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1 y F2a.
-- =============================================================================

begin;

create type public.tipo_solicitud as enum ('alta', 'baja');
create type public.estado_solicitud as enum ('pendiente', 'aprobada', 'rechazada');

-- -----------------------------------------------------------------------------
-- solicitudes: el entrenador propone, el coordinador resuelve. Nunca se borran.
-- -----------------------------------------------------------------------------
create table public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_solicitud not null,
  disciplina_id uuid not null references public.disciplinas (id),
  -- alta
  matricula text check (matricula ~ '^AL0[0-9]{7}$'),
  nombre text check (nombre is null or char_length(btrim(nombre)) between 2 and 120),
  genero public.genero,
  -- baja
  inscripcion_id uuid references public.inscripciones (id),
  nota text check (nota is null or char_length(nota) <= 300),
  -- resolución
  estado public.estado_solicitud not null default 'pendiente',
  motivo_rechazo text check (motivo_rechazo is null or char_length(btrim(motivo_rechazo)) between 3 and 300),
  alumno_id uuid references public.alumnos (id),
  solicitado_por uuid not null references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  resuelto_por uuid references public.perfiles (id),
  resuelto_en timestamptz,
  check (
    (tipo = 'alta' and matricula is not null and nombre is not null and inscripcion_id is null)
    or (tipo = 'baja' and inscripcion_id is not null and matricula is null)
  ),
  check ((estado = 'pendiente') = (resuelto_en is null)),
  check (estado <> 'rechazada' or motivo_rechazo is not null)
);

create unique index solicitudes_alta_pendiente_unica
  on public.solicitudes (disciplina_id, matricula)
  where estado = 'pendiente' and tipo = 'alta';
create unique index solicitudes_baja_pendiente_unica
  on public.solicitudes (inscripcion_id)
  where estado = 'pendiente' and tipo = 'baja';
create index solicitudes_estado_idx on public.solicitudes (estado, creado_en desc);

create trigger solicitudes_bitacora
  after insert or update or delete on public.solicitudes
  for each row execute function privado.registrar_bitacora();

-- ¿La inscripción está vigente y pertenece a esa disciplina?
create function privado.inscripcion_vigente_en(p_inscripcion uuid, p_disciplina uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.inscripciones i
    where i.id = p_inscripcion and i.disciplina_id = p_disciplina and i.fecha_baja is null
  );
$$;
revoke all on function privado.inscripcion_vigente_en(uuid, uuid) from public, anon;
grant execute on function privado.inscripcion_vigente_en(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Permisos y RLS
-- -----------------------------------------------------------------------------
revoke all on public.solicitudes from anon, authenticated;
grant select on public.solicitudes to authenticated;
grant insert (tipo, disciplina_id, matricula, nombre, genero, inscripcion_id, nota)
  on public.solicitudes to authenticated;
grant update (estado, motivo_rechazo, alumno_id, resuelto_por, resuelto_en)
  on public.solicitudes to authenticated;

alter table public.solicitudes enable row level security;

create policy solicitudes_select on public.solicitudes
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.es_entrenador_de(disciplina_id));

-- El entrenador solicita para sus disciplinas, a su nombre y siempre pendiente.
create policy solicitudes_insert on public.solicitudes
  for insert to authenticated
  with check (
    privado.es_entrenador_de(disciplina_id)
    and solicitado_por = (select auth.uid())
    and estado = 'pendiente'
    and (tipo = 'alta' or privado.inscripcion_vigente_en(inscripcion_id, disciplina_id))
  );

-- Solo el coordinador resuelve (a través de las funciones de abajo).
create policy solicitudes_update on public.solicitudes
  for update to authenticated
  using ((select privado.es_coordinador()) and estado = 'pendiente')
  with check ((select privado.es_coordinador()));

-- -----------------------------------------------------------------------------
-- Funciones RPC. SECURITY INVOKER: corren con los permisos del coordinador,
-- así que RLS y bitácora aplican igual que en cualquier otra petición.
-- Cada llamada es una sola transacción: todo o nada.
-- -----------------------------------------------------------------------------

-- Importa una lista a una disciplina.
-- p_filas: [{ "matricula": "AL0…", "nombre": "…", "genero": "femenino"|null,
--             "actualizar_nombre": true|false }]
create function public.importar_alumnos(p_disciplina uuid, p_filas jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_fila jsonb;
  v_alumno public.alumnos%rowtype;
  v_matricula text;
  v_nombre text;
  v_genero public.genero;
  v_creados int := 0;
  v_actualizados int := 0;
  v_inscritos int := 0;
  v_ya_inscritos int := 0;
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación puede importar listas' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay filas para importar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 300 then
    raise exception 'Máximo 300 filas por importación' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.disciplinas d
    where d.id = p_disciplina and d.tipo = 'lista' and d.activa
  ) then
    raise exception 'La disciplina no existe, está inactiva o no lleva lista' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_matricula := v_fila ->> 'matricula';
    v_nombre := btrim(v_fila ->> 'nombre');
    v_genero := nullif(v_fila ->> 'genero', '')::public.genero;

    select * into v_alumno from public.alumnos a where a.matricula = v_matricula;

    if not found then
      insert into public.alumnos (matricula, nombre, genero)
      values (v_matricula, v_nombre, v_genero)
      returning * into v_alumno;
      v_creados := v_creados + 1;
    else
      if coalesce((v_fila ->> 'actualizar_nombre')::boolean, false)
         and v_nombre is distinct from v_alumno.nombre then
        update public.alumnos set nombre = v_nombre where id = v_alumno.id;
        v_actualizados := v_actualizados + 1;
      end if;
      -- El género solo se completa si estaba vacío; nunca se sobrescribe.
      if v_genero is not null and v_alumno.genero is null then
        update public.alumnos set genero = v_genero where id = v_alumno.id;
      end if;
    end if;

    if exists (
      select 1 from public.inscripciones i
      where i.alumno_id = v_alumno.id and i.disciplina_id = p_disciplina and i.fecha_baja is null
    ) then
      v_ya_inscritos := v_ya_inscritos + 1;
    else
      insert into public.inscripciones (alumno_id, disciplina_id)
      values (v_alumno.id, p_disciplina);
      v_inscritos := v_inscritos + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'creados', v_creados,
    'actualizados', v_actualizados,
    'inscritos', v_inscritos,
    'ya_inscritos', v_ya_inscritos
  );
end;
$$;

create function public.aprobar_solicitud(p_solicitud uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sol public.solicitudes%rowtype;
  v_alumno_id uuid;
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación puede aprobar' using errcode = '42501';
  end if;

  select * into v_sol from public.solicitudes s where s.id = p_solicitud for update;
  if not found or v_sol.estado <> 'pendiente' then
    raise exception 'La solicitud no existe o ya fue resuelta' using errcode = '22023';
  end if;

  if v_sol.tipo = 'alta' then
    select a.id into v_alumno_id from public.alumnos a where a.matricula = v_sol.matricula;
    if v_alumno_id is null then
      insert into public.alumnos (matricula, nombre, genero)
      values (v_sol.matricula, v_sol.nombre, v_sol.genero)
      returning id into v_alumno_id;
    end if;
    if not exists (
      select 1 from public.inscripciones i
      where i.alumno_id = v_alumno_id and i.disciplina_id = v_sol.disciplina_id and i.fecha_baja is null
    ) then
      insert into public.inscripciones (alumno_id, disciplina_id)
      values (v_alumno_id, v_sol.disciplina_id);
    end if;
  else
    update public.inscripciones
    set fecha_baja = privado.hoy_mx()
    where id = v_sol.inscripcion_id and fecha_baja is null;
    select i.alumno_id into v_alumno_id from public.inscripciones i where i.id = v_sol.inscripcion_id;
  end if;

  update public.solicitudes
  set estado = 'aprobada', alumno_id = v_alumno_id,
      resuelto_por = (select auth.uid()), resuelto_en = now()
  where id = p_solicitud;
end;
$$;

create function public.rechazar_solicitud(p_solicitud uuid, p_motivo text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación puede rechazar' using errcode = '42501';
  end if;

  update public.solicitudes
  set estado = 'rechazada', motivo_rechazo = btrim(p_motivo),
      resuelto_por = (select auth.uid()), resuelto_en = now()
  where id = p_solicitud and estado = 'pendiente';

  if not found then
    raise exception 'La solicitud no existe o ya fue resuelta' using errcode = '22023';
  end if;
end;
$$;

-- Postgres da EXECUTE a PUBLIC por defecto: se restringe a authenticated.
revoke all on function public.importar_alumnos(uuid, jsonb) from public, anon;
revoke all on function public.aprobar_solicitud(uuid) from public, anon;
revoke all on function public.rechazar_solicitud(uuid, text) from public, anon;
grant execute on function public.importar_alumnos(uuid, jsonb) to authenticated;
grant execute on function public.aprobar_solicitud(uuid) to authenticated;
grant execute on function public.rechazar_solicitud(uuid, text) to authenticated;

commit;

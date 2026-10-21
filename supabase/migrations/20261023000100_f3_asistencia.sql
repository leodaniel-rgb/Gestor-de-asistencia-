-- =============================================================================
-- F3 · Captura de asistencia (disciplinas con lista)
-- Catálogos (motivos sin clase, categorías de incidencia), sesiones,
-- asistencias, incidencias y días sin clase.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1, F2a, F2b.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Catálogos administrables por el coordinador (máximo 6 opciones activas)
-- -----------------------------------------------------------------------------
create type public.tipo_catalogo as enum ('motivo_sin_clase', 'categoria_incidencia');

create table public.catalogo_opciones (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_catalogo not null,
  nombre text not null check (char_length(btrim(nombre)) between 2 and 40),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index catalogo_opciones_nombre_unico
  on public.catalogo_opciones (tipo, lower(btrim(nombre)));

create function privado.limitar_opciones_activas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activa and (
    select count(*) from public.catalogo_opciones o
    where o.tipo = new.tipo and o.activa and o.id <> new.id
  ) >= 6 then
    raise exception 'Máximo 6 opciones activas por catálogo' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger catalogo_opciones_limite
  before insert or update of activa, tipo on public.catalogo_opciones
  for each row execute function privado.limitar_opciones_activas();

insert into public.catalogo_opciones (tipo, nombre) values
  ('motivo_sin_clase', 'Clima'),
  ('motivo_sin_clase', 'Evento institucional'),
  ('motivo_sin_clase', 'Entrenador ausente'),
  ('motivo_sin_clase', 'Otro'),
  ('categoria_incidencia', 'Lesión'),
  ('categoria_incidencia', 'Conducta'),
  ('categoria_incidencia', 'Instalaciones'),
  ('categoria_incidencia', 'Otro');

-- -----------------------------------------------------------------------------
-- sesiones: un pase de lista. Puede haber varias por día (varios horarios).
-- Solo se registran hasta 3 días atrás; registro_tardio lo calcula la base.
-- -----------------------------------------------------------------------------
create table public.sesiones (
  id uuid primary key default gen_random_uuid(),
  disciplina_id uuid not null references public.disciplinas (id),
  fecha date not null,
  hora_inicio time not null,
  entrenador_id uuid not null references public.perfiles (id) default auth.uid(),
  registro_tardio boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz
);
create index sesiones_disciplina_fecha_idx on public.sesiones (disciplina_id, fecha desc);

create function privado.preparar_sesion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.registro_tardio := new.fecha < privado.hoy_mx();
  else
    new.actualizado_en := now();
  end if;
  return new;
end;
$$;

create trigger sesiones_preparar
  before insert or update on public.sesiones
  for each row execute function privado.preparar_sesion();

-- -----------------------------------------------------------------------------
-- asistencias: una marca por alumno (o por solicitud de alta pendiente).
-- Al aprobar la solicitud, alumno_id se completa; si se rechaza, la marca se
-- conserva pero no cuenta en reportes (los reportes usan alumno_id).
-- -----------------------------------------------------------------------------
create type public.estado_asistencia as enum ('asistio', 'falta');

create table public.asistencias (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.sesiones (id),
  alumno_id uuid references public.alumnos (id),
  solicitud_id uuid references public.solicitudes (id),
  estado public.estado_asistencia not null,
  check (alumno_id is not null or solicitud_id is not null)
);
create unique index asistencias_alumno_unica
  on public.asistencias (sesion_id, alumno_id) where alumno_id is not null;
create unique index asistencias_solicitud_unica
  on public.asistencias (sesion_id, solicitud_id) where solicitud_id is not null;
create index asistencias_alumno_idx on public.asistencias (alumno_id);

-- -----------------------------------------------------------------------------
-- incidencias de una sesión
-- -----------------------------------------------------------------------------
create table public.incidencias (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.sesiones (id),
  categoria_id uuid not null references public.catalogo_opciones (id),
  descripcion text check (descripcion is null or char_length(descripcion) <= 500)
);
create index incidencias_sesion_idx on public.incidencias (sesion_id);

-- -----------------------------------------------------------------------------
-- dias_sin_clase: solo existe si el entrenador respondió "No hubo clase".
-- -----------------------------------------------------------------------------
create table public.dias_sin_clase (
  id uuid primary key default gen_random_uuid(),
  disciplina_id uuid not null references public.disciplinas (id),
  fecha date not null,
  motivo_id uuid references public.catalogo_opciones (id),
  registrado_por uuid not null references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (disciplina_id, fecha)
);

-- -----------------------------------------------------------------------------
-- Funciones de autorización
-- -----------------------------------------------------------------------------
-- ¿Fecha dentro de la ventana de captura (hoy y hasta 3 días atrás)?
create function privado.fecha_capturable(p_fecha date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_fecha between privado.hoy_mx() - 3 and privado.hoy_mx();
$$;

-- ¿El usuario puede corregir esta sesión? (entrenador de la disciplina, 24 h)
create function privado.puede_corregir_sesion(p_sesion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sesiones s
    where s.id = p_sesion
      and privado.es_entrenador_de(s.disciplina_id)
      and s.creado_en > now() - interval '24 hours'
  );
$$;

-- ¿El usuario ve esta sesión? (coordinador, o entrenador de la disciplina)
create function privado.ve_sesion(p_sesion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.es_coordinador() or exists (
    select 1 from public.sesiones s
    where s.id = p_sesion and privado.es_entrenador_de(s.disciplina_id)
  );
$$;

-- ¿La marca corresponde a un alumno vigente (o a una solicitud de alta) de la
-- disciplina de esa sesión? Evita marcas de alumnos ajenos.
create function privado.marca_valida(p_sesion uuid, p_alumno uuid, p_solicitud uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sesiones s
    where s.id = p_sesion
      and (
        (p_alumno is not null and exists (
          select 1 from public.inscripciones i
          where i.alumno_id = p_alumno and i.disciplina_id = s.disciplina_id and i.fecha_baja is null
        ))
        or (p_alumno is null and exists (
          select 1 from public.solicitudes so
          where so.id = p_solicitud and so.disciplina_id = s.disciplina_id and so.tipo = 'alta'
        ))
      )
  );
$$;

-- ¿La opción existe, está activa y es del catálogo correcto?
create function privado.opcion_valida(p_opcion uuid, p_tipo public.tipo_catalogo)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.catalogo_opciones o
    where o.id = p_opcion and o.tipo = p_tipo and o.activa
  );
$$;

grant execute on function privado.fecha_capturable(date) to authenticated;
revoke all on function privado.marca_valida(uuid, uuid, uuid) from public, anon;
revoke all on function privado.opcion_valida(uuid, public.tipo_catalogo) from public, anon;
grant execute on function privado.marca_valida(uuid, uuid, uuid) to authenticated;
grant execute on function privado.opcion_valida(uuid, public.tipo_catalogo) to authenticated;
revoke all on function privado.puede_corregir_sesion(uuid) from public, anon;
revoke all on function privado.ve_sesion(uuid) from public, anon;
grant execute on function privado.puede_corregir_sesion(uuid) to authenticated;
grant execute on function privado.ve_sesion(uuid) to authenticated;

-- Solo la coordinación puede ligar una marca a un alumno distinto
-- (lo hace aprobar_solicitud). El entrenador solo cambia asistio/falta.
create function privado.proteger_asistencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.alumno_id is distinct from old.alumno_id
      or new.solicitud_id is distinct from old.solicitud_id
      or new.sesion_id is distinct from old.sesion_id)
     and current_user = 'authenticated'
     and not privado.es_coordinador() then
    raise exception 'Solo la coordinación puede reasignar una asistencia' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger asistencias_proteger
  before update on public.asistencias
  for each row execute function privado.proteger_asistencia();

-- -----------------------------------------------------------------------------
-- Bitácora
-- -----------------------------------------------------------------------------
create trigger catalogo_opciones_bitacora
  after insert or update or delete on public.catalogo_opciones
  for each row execute function privado.registrar_bitacora();
create trigger sesiones_bitacora
  after insert or update or delete on public.sesiones
  for each row execute function privado.registrar_bitacora();
create trigger asistencias_bitacora
  after insert or update or delete on public.asistencias
  for each row execute function privado.registrar_bitacora();
create trigger incidencias_bitacora
  after insert or update or delete on public.incidencias
  for each row execute function privado.registrar_bitacora();
create trigger dias_sin_clase_bitacora
  after insert or update or delete on public.dias_sin_clase
  for each row execute function privado.registrar_bitacora();

-- -----------------------------------------------------------------------------
-- Permisos explícitos
-- -----------------------------------------------------------------------------
revoke all on public.catalogo_opciones, public.sesiones, public.asistencias,
              public.incidencias, public.dias_sin_clase from anon, authenticated;

grant select on public.catalogo_opciones to authenticated;
grant insert (tipo, nombre) on public.catalogo_opciones to authenticated;
grant update (nombre, activa) on public.catalogo_opciones to authenticated;

grant select on public.sesiones to authenticated;
grant insert (disciplina_id, fecha, hora_inicio) on public.sesiones to authenticated;
grant update (hora_inicio) on public.sesiones to authenticated;

grant select on public.asistencias to authenticated;
grant insert (sesion_id, alumno_id, solicitud_id, estado) on public.asistencias to authenticated;
grant update (estado, alumno_id) on public.asistencias to authenticated;

grant select, delete on public.incidencias to authenticated;
grant insert (sesion_id, categoria_id, descripcion) on public.incidencias to authenticated;

grant select on public.dias_sin_clase to authenticated;
grant insert (disciplina_id, fecha, motivo_id) on public.dias_sin_clase to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.catalogo_opciones enable row level security;
alter table public.sesiones enable row level security;
alter table public.asistencias enable row level security;
alter table public.incidencias enable row level security;
alter table public.dias_sin_clase enable row level security;

-- Catálogos: todos los usuarios habilitados leen; solo el coordinador edita.
create policy catalogo_select on public.catalogo_opciones
  for select to authenticated using ((select privado.usuario_habilitado()));
create policy catalogo_insert on public.catalogo_opciones
  for insert to authenticated with check ((select privado.es_coordinador()));
create policy catalogo_update on public.catalogo_opciones
  for update to authenticated
  using ((select privado.es_coordinador())) with check ((select privado.es_coordinador()));

-- Sesiones
create policy sesiones_select on public.sesiones
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.es_entrenador_de(disciplina_id));
create policy sesiones_insert on public.sesiones
  for insert to authenticated
  with check (
    privado.es_entrenador_de(disciplina_id)
    and entrenador_id = (select auth.uid())
    and privado.fecha_capturable(fecha)
    and exists (
      select 1 from public.disciplinas d
      where d.id = disciplina_id and d.tipo = 'lista' and d.activa
    )
  );
create policy sesiones_update on public.sesiones
  for update to authenticated
  using (privado.puede_corregir_sesion(id) or (select privado.es_coordinador()))
  with check (privado.puede_corregir_sesion(id) or (select privado.es_coordinador()));

-- Asistencias: se crean al registrar la sesión (ventana de 24 h)
create policy asistencias_select on public.asistencias
  for select to authenticated using (privado.ve_sesion(sesion_id));
create policy asistencias_insert on public.asistencias
  for insert to authenticated
  with check (
    privado.puede_corregir_sesion(sesion_id)
    and privado.marca_valida(sesion_id, alumno_id, solicitud_id)
  );
create policy asistencias_update on public.asistencias
  for update to authenticated
  using (privado.puede_corregir_sesion(sesion_id) or (select privado.es_coordinador()))
  with check (privado.puede_corregir_sesion(sesion_id) or (select privado.es_coordinador()));

-- Incidencias: se agregan y quitan dentro de la ventana de 24 h
create policy incidencias_select on public.incidencias
  for select to authenticated using (privado.ve_sesion(sesion_id));
create policy incidencias_insert on public.incidencias
  for insert to authenticated
  with check (
    privado.puede_corregir_sesion(sesion_id)
    and privado.opcion_valida(categoria_id, 'categoria_incidencia')
  );
create policy incidencias_delete on public.incidencias
  for delete to authenticated using (privado.puede_corregir_sesion(sesion_id));

-- Días sin clase
create policy sin_clase_select on public.dias_sin_clase
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.es_entrenador_de(disciplina_id));
create policy sin_clase_insert on public.dias_sin_clase
  for insert to authenticated
  with check (
    privado.es_entrenador_de(disciplina_id)
    and registrado_por = (select auth.uid())
    and privado.fecha_capturable(fecha)
    and (motivo_id is null or privado.opcion_valida(motivo_id, 'motivo_sin_clase'))
  );

-- -----------------------------------------------------------------------------
-- RPC: registrar una sesión completa (todo o nada). SECURITY INVOKER.
-- p_marcas: [{ "alumno_id": uuid } | { "solicitud_id": uuid }, "estado": "asistio"|"falta"]
-- p_incidencias: [{ "categoria_id": uuid, "descripcion": "…" }]
-- Exige marcar a TODOS los alumnos vigentes y solicitudes de alta pendientes.
-- -----------------------------------------------------------------------------
create function public.registrar_sesion(
  p_disciplina uuid,
  p_fecha date,
  p_hora time,
  p_marcas jsonb,
  p_incidencias jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_sesion uuid;
  v_esperados int;
  v_marcados int;
begin
  if not privado.es_entrenador_de(p_disciplina) then
    raise exception 'No eres entrenador de esta disciplina' using errcode = '42501';
  end if;

  -- Validar que las marcas cubran exactamente la lista vigente.
  with esperados as (
    select i.alumno_id as alumno_id, null::uuid as solicitud_id
    from public.inscripciones i
    where i.disciplina_id = p_disciplina and i.fecha_baja is null
    union all
    select null, s.id
    from public.solicitudes s
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

  if v_esperados = 0 then
    raise exception 'La disciplina no tiene alumnos en la lista' using errcode = '22023';
  end if;
  if v_marcados <> v_esperados or jsonb_array_length(p_marcas) <> v_esperados then
    raise exception 'Faltan alumnos por marcar o hay marcas que no corresponden a la lista'
      using errcode = '22023';
  end if;

  insert into public.sesiones (disciplina_id, fecha, hora_inicio)
  values (p_disciplina, p_fecha, p_hora)
  returning id into v_sesion;

  insert into public.asistencias (sesion_id, alumno_id, solicitud_id, estado)
  select v_sesion, (m ->> 'alumno_id')::uuid, (m ->> 'solicitud_id')::uuid,
         (m ->> 'estado')::public.estado_asistencia
  from jsonb_array_elements(p_marcas) m;

  insert into public.incidencias (sesion_id, categoria_id, descripcion)
  select v_sesion, (x ->> 'categoria_id')::uuid, nullif(btrim(x ->> 'descripcion'), '')
  from jsonb_array_elements(coalesce(p_incidencias, '[]'::jsonb)) x;

  return v_sesion;
end;
$$;

-- RPC: corregir una sesión dentro de las 24 h (o el coordinador).
-- Cambia hora, estados de marcas existentes y reemplaza las incidencias.
create function public.corregir_sesion(
  p_sesion uuid,
  p_hora time,
  p_marcas jsonb,
  p_incidencias jsonb default '[]'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_marca jsonb;
begin
  if not privado.puede_corregir_sesion(p_sesion) then
    raise exception 'La sesión ya no se puede corregir (24 h)' using errcode = '42501';
  end if;

  update public.sesiones set hora_inicio = p_hora where id = p_sesion;

  for v_marca in select * from jsonb_array_elements(p_marcas) loop
    update public.asistencias
    set estado = (v_marca ->> 'estado')::public.estado_asistencia
    where id = (v_marca ->> 'id')::uuid and sesion_id = p_sesion
      and estado is distinct from (v_marca ->> 'estado')::public.estado_asistencia;
  end loop;

  delete from public.incidencias where sesion_id = p_sesion;
  insert into public.incidencias (sesion_id, categoria_id, descripcion)
  select p_sesion, (x ->> 'categoria_id')::uuid, nullif(btrim(x ->> 'descripcion'), '')
  from jsonb_array_elements(coalesce(p_incidencias, '[]'::jsonb)) x;
end;
$$;

revoke all on function public.registrar_sesion(uuid, date, time, jsonb, jsonb) from public, anon;
revoke all on function public.corregir_sesion(uuid, time, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_sesion(uuid, date, time, jsonb, jsonb) to authenticated;
grant execute on function public.corregir_sesion(uuid, time, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- aprobar_solicitud: ahora también pasa las asistencias "pendientes" al alumno.
-- -----------------------------------------------------------------------------
create or replace function public.aprobar_solicitud(p_solicitud uuid)
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

    -- Asistencias registradas mientras estaba pendiente: ahora cuentan.
    -- Si en esa sesión el alumno ya tenía su propia marca, se respeta esa.
    update public.asistencias a
    set alumno_id = v_alumno_id
    where a.solicitud_id = p_solicitud
      and a.alumno_id is null
      and not exists (
        select 1 from public.asistencias b
        where b.sesion_id = a.sesion_id and b.alumno_id = v_alumno_id
      );
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

commit;

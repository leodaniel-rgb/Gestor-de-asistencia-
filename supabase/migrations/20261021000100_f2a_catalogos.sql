-- =============================================================================
-- F2a · Disciplinas, asignación de entrenadores, alumnos e inscripciones
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: 20261019000100_f1_auth_roles.sql
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.tipo_disciplina as enum ('lista', 'acceso_libre');
create type public.genero as enum ('femenino', 'masculino', 'no_binario');

-- Fecha "de hoy" en San Luis Potosí (la base de datos vive en UTC).
create function privado.hoy_mx()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;
grant execute on function privado.hoy_mx() to authenticated;

-- -----------------------------------------------------------------------------
-- disciplinas
-- dias_clase: días habituales (ISO: 1 = lunes … 7 = domingo). Opcional.
-- Solo sirve para el recordatorio (F3); no impide registrar otros días.
-- -----------------------------------------------------------------------------
create table public.disciplinas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  tipo public.tipo_disciplina not null default 'lista',
  dias_clase smallint[] not null default '{}'
    check (dias_clase <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles (id) default auth.uid()
);
create unique index disciplinas_nombre_unico on public.disciplinas (lower(btrim(nombre)));

-- -----------------------------------------------------------------------------
-- entrenador_disciplina (muchos a muchos). Quitar una asignación borra la fila:
-- queda en bitácora y no afecta registros de asistencia (que guardan su autor).
-- -----------------------------------------------------------------------------
create table public.entrenador_disciplina (
  id uuid primary key default gen_random_uuid(),
  entrenador_id uuid not null references public.perfiles (id),
  disciplina_id uuid not null references public.disciplinas (id),
  asignado_en timestamptz not null default now(),
  unique (entrenador_id, disciplina_id)
);
create index entrenador_disciplina_disciplina_idx on public.entrenador_disciplina (disciplina_id);

-- -----------------------------------------------------------------------------
-- alumnos: uno por matrícula, aunque esté en varias disciplinas.
-- genero puede quedar vacío (gimnasio o importaciones sin dato).
-- -----------------------------------------------------------------------------
create table public.alumnos (
  id uuid primary key default gen_random_uuid(),
  matricula text not null unique check (matricula ~ '^AL0[0-9]{7}$'),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  genero public.genero,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles (id) default auth.uid()
);

-- -----------------------------------------------------------------------------
-- inscripciones: la baja se registra con fecha; nunca se borra.
-- -----------------------------------------------------------------------------
create table public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos (id),
  disciplina_id uuid not null references public.disciplinas (id),
  fecha_alta date not null default privado.hoy_mx(),
  fecha_baja date,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  check (fecha_baja is null or fecha_baja >= fecha_alta)
);
-- Un alumno solo puede tener una inscripción vigente por disciplina.
create unique index inscripciones_vigente_unica
  on public.inscripciones (alumno_id, disciplina_id) where fecha_baja is null;
create index inscripciones_disciplina_idx on public.inscripciones (disciplina_id);

-- -----------------------------------------------------------------------------
-- Funciones de autorización
-- -----------------------------------------------------------------------------
create function privado.es_entrenador_de(p_disciplina uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entrenador_disciplina ed
    join public.perfiles p on p.id = ed.entrenador_id
    where ed.disciplina_id = p_disciplina
      and ed.entrenador_id = (select auth.uid())
      and p.rol = 'entrenador'
      and p.activo
      and not p.debe_cambiar_password
  );
$$;

create function privado.alumno_de_mis_disciplinas(p_alumno uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.inscripciones i
    where i.alumno_id = p_alumno
      and i.fecha_baja is null
      and privado.es_entrenador_de(i.disciplina_id)
  );
$$;

create function privado.es_entrenador_activo(p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = p_perfil and p.rol = 'entrenador' and p.activo
  );
$$;

revoke all on function privado.es_entrenador_de(uuid) from public, anon;
revoke all on function privado.alumno_de_mis_disciplinas(uuid) from public, anon;
revoke all on function privado.es_entrenador_activo(uuid) from public, anon;
grant execute on function privado.es_entrenador_de(uuid) to authenticated;
grant execute on function privado.alumno_de_mis_disciplinas(uuid) to authenticated;
grant execute on function privado.es_entrenador_activo(uuid) to authenticated;

-- La matrícula solo la corrige el coordinador (el entrenador solo nombre y género).
-- security invoker: necesita ver al usuario real que hace la petición.
create function privado.proteger_matricula()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.matricula is distinct from old.matricula
     and current_user = 'authenticated'
     and not privado.es_coordinador() then
    raise exception 'Solo la coordinación puede corregir la matrícula'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger alumnos_proteger_matricula
  before update on public.alumnos
  for each row execute function privado.proteger_matricula();

-- -----------------------------------------------------------------------------
-- Bitácora en todas las tablas nuevas
-- -----------------------------------------------------------------------------
create trigger disciplinas_bitacora
  after insert or update or delete on public.disciplinas
  for each row execute function privado.registrar_bitacora();
create trigger entrenador_disciplina_bitacora
  after insert or update or delete on public.entrenador_disciplina
  for each row execute function privado.registrar_bitacora();
create trigger alumnos_bitacora
  after insert or update or delete on public.alumnos
  for each row execute function privado.registrar_bitacora();
create trigger inscripciones_bitacora
  after insert or update or delete on public.inscripciones
  for each row execute function privado.registrar_bitacora();

-- -----------------------------------------------------------------------------
-- Permisos explícitos (los proyectos nuevos no otorgan nada por defecto)
-- Nada para anon ni para service_role.
-- -----------------------------------------------------------------------------
revoke all on public.disciplinas, public.entrenador_disciplina,
              public.alumnos, public.inscripciones from anon, authenticated;

grant select, insert on public.disciplinas to authenticated;
grant update (nombre, dias_clase, activa) on public.disciplinas to authenticated;

grant select, insert, delete on public.entrenador_disciplina to authenticated;

grant select, insert on public.alumnos to authenticated;
grant update (matricula, nombre, genero) on public.alumnos to authenticated;

grant select, insert on public.inscripciones to authenticated;
grant update (fecha_baja) on public.inscripciones to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.disciplinas enable row level security;
alter table public.entrenador_disciplina enable row level security;
alter table public.alumnos enable row level security;
alter table public.inscripciones enable row level security;

-- disciplinas: el coordinador administra; el entrenador ve las suyas.
create policy disciplinas_select on public.disciplinas
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.es_entrenador_de(id));
create policy disciplinas_insert on public.disciplinas
  for insert to authenticated
  with check ((select privado.es_coordinador()));
create policy disciplinas_update on public.disciplinas
  for update to authenticated
  using ((select privado.es_coordinador()))
  with check ((select privado.es_coordinador()));

-- entrenador_disciplina: el coordinador asigna; el entrenador ve sus filas.
create policy ed_select on public.entrenador_disciplina
  for select to authenticated
  using (
    (select privado.es_coordinador())
    or (entrenador_id = (select auth.uid()) and (select privado.usuario_habilitado()))
  );
create policy ed_insert on public.entrenador_disciplina
  for insert to authenticated
  with check ((select privado.es_coordinador()) and privado.es_entrenador_activo(entrenador_id));
create policy ed_delete on public.entrenador_disciplina
  for delete to authenticated
  using ((select privado.es_coordinador()));

-- alumnos: el coordinador ve y crea todos; el entrenador ve y corrige
-- (nombre y género) solo a los inscritos en sus disciplinas.
create policy alumnos_select on public.alumnos
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.alumno_de_mis_disciplinas(id));
create policy alumnos_insert on public.alumnos
  for insert to authenticated
  with check ((select privado.es_coordinador()));
create policy alumnos_update on public.alumnos
  for update to authenticated
  using ((select privado.es_coordinador()) or privado.alumno_de_mis_disciplinas(id))
  with check ((select privado.es_coordinador()) or privado.alumno_de_mis_disciplinas(id));

-- inscripciones: el coordinador administra; el entrenador ve las de sus disciplinas.
create policy inscripciones_select on public.inscripciones
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.es_entrenador_de(disciplina_id));
create policy inscripciones_insert on public.inscripciones
  for insert to authenticated
  with check ((select privado.es_coordinador()));
create policy inscripciones_update on public.inscripciones
  for update to authenticated
  using ((select privado.es_coordinador()))
  with check ((select privado.es_coordinador()));

commit;

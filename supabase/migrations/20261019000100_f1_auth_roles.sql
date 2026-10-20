-- =============================================================================
-- F1 · Cuentas, roles, bitácora y RLS
-- Aplicar en el SQL Editor de Supabase: primero en vive-dev, luego en vive-prod.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Esquema privado: funciones auxiliares de autorización.
-- No debe aparecer en Settings → Data API → Exposed schemas.
-- -----------------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.rol_usuario as enum ('coordinador', 'entrenador');

-- -----------------------------------------------------------------------------
-- perfiles: una fila por cuenta de Supabase Auth.
-- `on delete restrict`: una cuenta con perfil no se puede borrar de Auth.
-- Las cuentas solo se desactivan (activo = false), nunca se eliminan.
-- -----------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete restrict,
  correo text not null unique check (correo = lower(correo)),
  nombre text not null check (char_length(nombre) between 2 and 120),
  rol public.rol_usuario not null default 'entrenador',
  activo boolean not null default true,
  debe_cambiar_password boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles (id)
);

comment on table public.perfiles is
  'Cuentas del portal. Solo el coordinador crea y desactiva entrenadores; nunca se borran.';

-- Solo puede existir un coordinador.
create unique index perfiles_un_solo_coordinador
  on public.perfiles (rol) where rol = 'coordinador';

-- -----------------------------------------------------------------------------
-- bitacora: registro inmutable de cambios. Solo se escribe desde triggers.
-- actor = null significa una acción del servidor (por ejemplo, al completar
-- el cambio de contraseña).
-- -----------------------------------------------------------------------------
create table public.bitacora (
  id bigint generated always as identity primary key,
  ocurrido_en timestamptz not null default now(),
  actor uuid references public.perfiles (id),
  accion text not null,
  entidad text not null,
  entidad_id text,
  antes jsonb,
  despues jsonb
);

create index bitacora_entidad_idx on public.bitacora (entidad, entidad_id);
create index bitacora_ocurrido_en_idx on public.bitacora (ocurrido_en desc);

-- -----------------------------------------------------------------------------
-- Funciones de autorización (security definer, search_path vacío).
-- Leen perfiles sin pasar por RLS para evitar recursión en las políticas.
-- -----------------------------------------------------------------------------
create function privado.usuario_habilitado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and not p.debe_cambiar_password
  );
$$;

create function privado.es_coordinador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.rol = 'coordinador'
      and p.activo
      and not p.debe_cambiar_password
  );
$$;

revoke all on function privado.usuario_habilitado() from public, anon;
revoke all on function privado.es_coordinador() from public, anon;
grant execute on function privado.usuario_habilitado() to authenticated;
grant execute on function privado.es_coordinador() to authenticated;

-- -----------------------------------------------------------------------------
-- Trigger de bitácora
-- -----------------------------------------------------------------------------
create function privado.registrar_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bitacora (actor, accion, entidad, entidad_id, antes, despues)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function privado.registrar_bitacora() from public, anon, authenticated;

create trigger perfiles_bitacora
  after insert or update or delete on public.perfiles
  for each row execute function privado.registrar_bitacora();

-- -----------------------------------------------------------------------------
-- Permisos de tabla (además de RLS)
-- -----------------------------------------------------------------------------
revoke all on public.perfiles from anon, authenticated;
revoke all on public.bitacora from anon, authenticated;

grant select, insert on public.perfiles to authenticated;
-- Columnas editables: rol, correo, id y auditoría quedan fuera de alcance.
grant update (nombre, activo, debe_cambiar_password) on public.perfiles to authenticated;
grant select on public.bitacora to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.perfiles enable row level security;
alter table public.bitacora enable row level security;

-- Cada quien ve su propio perfil (incluso desactivado o con cambio pendiente,
-- para que el portal sepa qué mostrarle). El coordinador ve todos.
create policy perfiles_select
  on public.perfiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select privado.es_coordinador())
  );

-- El coordinador solo crea entrenadores, y a su propio nombre.
create policy perfiles_insert_coordinador
  on public.perfiles
  for insert
  to authenticated
  with check (
    (select privado.es_coordinador())
    and rol = 'entrenador'
    and creado_por = (select auth.uid())
  );

-- El coordinador solo modifica entrenadores (no a sí mismo).
create policy perfiles_update_coordinador
  on public.perfiles
  for update
  to authenticated
  using ((select privado.es_coordinador()) and rol = 'entrenador')
  with check ((select privado.es_coordinador()) and rol = 'entrenador');

-- Sin política de delete: nadie borra perfiles desde la API.

create policy bitacora_select_coordinador
  on public.bitacora
  for select
  to authenticated
  using ((select privado.es_coordinador()));

-- Sin políticas de insert/update/delete en bitácora: solo el trigger escribe.

commit;

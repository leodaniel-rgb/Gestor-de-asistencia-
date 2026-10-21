-- =============================================================================
-- F4 · Gimnasio en modo kiosco (disciplinas de acceso libre)
-- Turnos (abrir / cerrar) y registros de entrada y salida.
-- Toda escritura pasa por funciones que exigen un turno abierto por un
-- entrenador asignado al gimnasio.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1, F2a, F2b, F3.
-- =============================================================================

begin;

create type public.nombre_turno as enum ('manana', 'tarde');

-- -----------------------------------------------------------------------------
-- turnos_gimnasio: solo un turno abierto por gimnasio a la vez.
-- nombre es opcional ("solo hora" en horarios intermedios).
-- -----------------------------------------------------------------------------
create table public.turnos_gimnasio (
  id uuid primary key default gen_random_uuid(),
  disciplina_id uuid not null references public.disciplinas (id),
  fecha date not null default privado.hoy_mx(),
  nombre public.nombre_turno,
  abierto_por uuid not null references public.perfiles (id) default auth.uid(),
  abierto_en timestamptz not null default now(),
  cerrado_por uuid references public.perfiles (id),
  cerrado_en timestamptz,
  cierre_automatico boolean not null default false,
  -- Límite de búsquedas del kiosco (ventana de 1 minuto)
  ventana_busquedas timestamptz,
  busquedas_en_ventana int not null default 0,
  check (cerrado_en is null or cerrado_en >= abierto_en)
);
create unique index turnos_gimnasio_uno_abierto
  on public.turnos_gimnasio (disciplina_id) where cerrado_en is null;
create index turnos_gimnasio_fecha_idx on public.turnos_gimnasio (disciplina_id, fecha desc);

-- -----------------------------------------------------------------------------
-- registros_gimnasio: entrada y salida. Si el turno se cierra con salida vacía,
-- el registro queda "sin salida" (no se inventa la hora).
-- -----------------------------------------------------------------------------
create table public.registros_gimnasio (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos_gimnasio (id),
  alumno_id uuid not null references public.alumnos (id),
  entrada timestamptz not null default now(),
  salida timestamptz,
  check (salida is null or salida >= entrada)
);
create unique index registros_gimnasio_entrada_abierta
  on public.registros_gimnasio (turno_id, alumno_id) where salida is null;
create index registros_gimnasio_alumno_idx on public.registros_gimnasio (alumno_id);

create trigger turnos_gimnasio_bitacora
  after insert or update or delete on public.turnos_gimnasio
  for each row execute function privado.registrar_bitacora();
create trigger registros_gimnasio_bitacora
  after insert or update or delete on public.registros_gimnasio
  for each row execute function privado.registrar_bitacora();

-- -----------------------------------------------------------------------------
-- Lectura: coordinador o entrenadores del gimnasio. Escritura: solo funciones.
-- -----------------------------------------------------------------------------
revoke all on public.turnos_gimnasio, public.registros_gimnasio from anon, authenticated;
grant select on public.turnos_gimnasio, public.registros_gimnasio to authenticated;

alter table public.turnos_gimnasio enable row level security;
alter table public.registros_gimnasio enable row level security;

create policy turnos_select on public.turnos_gimnasio
  for select to authenticated
  using ((select privado.es_coordinador()) or privado.es_entrenador_de(disciplina_id));

create function privado.ve_turno(p_turno uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.es_coordinador() or exists (
    select 1 from public.turnos_gimnasio t
    where t.id = p_turno and privado.es_entrenador_de(t.disciplina_id)
  );
$$;
revoke all on function privado.ve_turno(uuid) from public, anon;
grant execute on function privado.ve_turno(uuid) to authenticated;

create policy registros_select on public.registros_gimnasio
  for select to authenticated using (privado.ve_turno(turno_id));

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------
-- "Daniel Eduardo Torres Rivera" → "Daniel T." (nombre + inicial del apellido
-- paterno, que es el penúltimo cuando hay 3 o más palabras).
create function privado.nombre_corto(p_nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  with partes as (select regexp_split_to_array(btrim(p_nombre), '\s+') as p)
  select case
    when array_length(p, 1) >= 3 then p[1] || ' ' || left(p[array_length(p, 1) - 1], 1) || '.'
    when array_length(p, 1) = 2 then p[1] || ' ' || left(p[2], 1) || '.'
    else p[1]
  end
  from partes;
$$;

-- Turno abierto de un gimnasio del que el usuario es entrenador; si no, error.
create function privado.turno_abierto_del_usuario(p_turno uuid)
returns public.turnos_gimnasio
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.turnos_gimnasio%rowtype;
begin
  select * into v from public.turnos_gimnasio t where t.id = p_turno;
  if not found or not privado.es_entrenador_de(v.disciplina_id) then
    raise exception 'Turno no válido' using errcode = '42501';
  end if;
  if v.cerrado_en is not null then
    raise exception 'El turno está cerrado' using errcode = '22023';
  end if;
  return v;
end;
$$;
revoke all on function privado.turno_abierto_del_usuario(uuid) from public, anon;
grant execute on function privado.turno_abierto_del_usuario(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPC (SECURITY DEFINER: el kiosco registra alumnos nuevos y entradas que el
-- entrenador no puede escribir directamente; cada función valida permisos).
-- -----------------------------------------------------------------------------

-- Abre un turno. Si había uno abierto (olvidado), lo cierra automáticamente.
create function public.abrir_turno(p_disciplina uuid, p_nombre public.nombre_turno default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno uuid;
begin
  if not privado.es_entrenador_de(p_disciplina) then
    raise exception 'No eres entrenador de este gimnasio' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.disciplinas d
    where d.id = p_disciplina and d.tipo = 'acceso_libre' and d.activa
  ) then
    raise exception 'La disciplina no es de acceso libre o está inactiva' using errcode = '22023';
  end if;

  update public.turnos_gimnasio
  set cerrado_en = now(), cierre_automatico = true
  where disciplina_id = p_disciplina and cerrado_en is null;

  insert into public.turnos_gimnasio (disciplina_id, nombre, abierto_por)
  values (p_disciplina, p_nombre, (select auth.uid()))
  returning id into v_turno;
  return v_turno;
end;
$$;

-- Cierra el turno. Las entradas sin salida quedan como "sin salida".
create function public.cerrar_turno(p_turno uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.turno_abierto_del_usuario(p_turno);
  update public.turnos_gimnasio
  set cerrado_en = now(), cerrado_por = (select auth.uid())
  where id = p_turno;
end;
$$;

-- Búsqueda del kiosco. Devuelve solo el nombre corto y qué toca registrar.
-- Máximo 30 búsquedas por minuto por turno.
create function public.kiosco_buscar(p_turno uuid, p_matricula text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_busquedas int;
  v_alumno public.alumnos%rowtype;
begin
  perform privado.turno_abierto_del_usuario(p_turno);

  update public.turnos_gimnasio
  set busquedas_en_ventana = case
        when ventana_busquedas is null or now() - ventana_busquedas > interval '1 minute' then 1
        else busquedas_en_ventana + 1 end,
      ventana_busquedas = case
        when ventana_busquedas is null or now() - ventana_busquedas > interval '1 minute' then now()
        else ventana_busquedas end
  where id = p_turno
  returning busquedas_en_ventana into v_busquedas;
  if v_busquedas > 30 then
    raise exception 'Demasiadas búsquedas; espera un minuto' using errcode = '54000';
  end if;

  if p_matricula !~ '^AL0[0-9]{7}$' then
    raise exception 'Matrícula no válida' using errcode = '22023';
  end if;

  select * into v_alumno from public.alumnos a where a.matricula = p_matricula;
  if not found then
    return jsonb_build_object('accion', 'nuevo');
  end if;

  return jsonb_build_object(
    'accion',
    case when exists (
      select 1 from public.registros_gimnasio r
      where r.turno_id = p_turno and r.alumno_id = v_alumno.id and r.salida is null
    ) then 'salida' else 'entrada' end,
    'nombre_corto', privado.nombre_corto(v_alumno.nombre)
  );
end;
$$;

-- Registra entrada o salida. p_accion debe coincidir con el estado actual
-- (evita registrar una salida si alguien más ya la registró).
-- Si el alumno no existe, p_nombre es obligatorio y se da de alta.
create function public.kiosco_registrar(
  p_turno uuid,
  p_matricula text,
  p_accion text,
  p_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alumno_id uuid;
  v_nombre text;
  v_abierta uuid;
begin
  perform privado.turno_abierto_del_usuario(p_turno);
  if p_matricula !~ '^AL0[0-9]{7}$' then
    raise exception 'Matrícula no válida' using errcode = '22023';
  end if;

  select a.id, a.nombre into v_alumno_id, v_nombre from public.alumnos a where a.matricula = p_matricula;

  if v_alumno_id is null then
    if p_accion <> 'entrada' or p_nombre is null or char_length(btrim(p_nombre)) not between 5 and 120 then
      raise exception 'Escribe tu nombre completo' using errcode = '22023';
    end if;
    v_nombre := regexp_replace(btrim(p_nombre), '\s+', ' ', 'g');
    insert into public.alumnos (matricula, nombre, creado_por)
    values (p_matricula, v_nombre, (select auth.uid()))
    returning id into v_alumno_id;
  end if;

  select r.id into v_abierta from public.registros_gimnasio r
  where r.turno_id = p_turno and r.alumno_id = v_alumno_id and r.salida is null;

  if p_accion = 'entrada' and v_abierta is null then
    insert into public.registros_gimnasio (turno_id, alumno_id) values (p_turno, v_alumno_id);
  elsif p_accion = 'salida' and v_abierta is not null then
    update public.registros_gimnasio set salida = now() where id = v_abierta;
  else
    raise exception 'El registro cambió; vuelve a escribir tu matrícula' using errcode = '22023';
  end if;

  return jsonb_build_object('accion', p_accion, 'nombre_corto', privado.nombre_corto(v_nombre));
end;
$$;

revoke all on function public.abrir_turno(uuid, public.nombre_turno) from public, anon;
revoke all on function public.cerrar_turno(uuid) from public, anon;
revoke all on function public.kiosco_buscar(uuid, text) from public, anon;
revoke all on function public.kiosco_registrar(uuid, text, text, text) from public, anon;
grant execute on function public.abrir_turno(uuid, public.nombre_turno) to authenticated;
grant execute on function public.cerrar_turno(uuid) to authenticated;
grant execute on function public.kiosco_buscar(uuid, text) to authenticated;
grant execute on function public.kiosco_registrar(uuid, text, text, text) to authenticated;

commit;

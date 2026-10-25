-- =============================================================================
-- Kiosco · Salida pendiente de un turno anterior
-- Si un alumno entró en un turno anterior del mismo gimnasio y del mismo día,
-- no marcó su salida y su entrada fue hace 3 horas o menos, el kiosco le
-- recuerda registrar la salida (igual que dentro del mismo turno). La salida se
-- guarda con la hora real en que la marca y cuenta para el tiempo promedio
-- (no es "salida corregida"). Si dice que está entrando, se registra una
-- entrada nueva y la anterior sigue "sin salida".
-- - privado.entrada_pendiente_anterior(): busca esa entrada.
-- - kiosco_buscar(): misma firma; nueva respuesta 'salida_anterior'.
-- - kiosco_registrar(): misma firma; nueva acción 'salida_anterior'.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1–F8.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Entrada sin salida de un turno anterior (mismo gimnasio, mismo día, ≤ 3 h).
-- Si hay varias, la más reciente.
-- -----------------------------------------------------------------------------
create function privado.entrada_pendiente_anterior(p_turno uuid, p_alumno uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.turnos_gimnasio actual
  join public.turnos_gimnasio t
    on t.disciplina_id = actual.disciplina_id and t.fecha = actual.fecha and t.id <> actual.id
  join public.registros_gimnasio r on r.turno_id = t.id
  where actual.id = p_turno
    and r.alumno_id = p_alumno
    and r.salida is null
    and not r.anulado
    and r.entrada >= now() - interval '3 hours'
  order by r.entrada desc
  limit 1;
$$;
revoke all on function privado.entrada_pendiente_anterior(uuid, uuid) from public, anon;
grant execute on function privado.entrada_pendiente_anterior(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Búsqueda del kiosco (misma lógica que F4 + salida pendiente anterior).
-- Devuelve solo el nombre corto y qué toca registrar. Máx. 30 búsquedas/minuto.
-- -----------------------------------------------------------------------------
create or replace function public.kiosco_buscar(p_turno uuid, p_matricula text)
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
    case
      when exists (
        select 1 from public.registros_gimnasio r
        where r.turno_id = p_turno and r.alumno_id = v_alumno.id and r.salida is null
      ) then 'salida'
      when privado.entrada_pendiente_anterior(p_turno, v_alumno.id) is not null then 'salida_anterior'
      else 'entrada'
    end,
    'nombre_corto', privado.nombre_corto(v_alumno.nombre)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro del kiosco (misma lógica que F4 + 'salida_anterior').
-- 'salida_anterior' vuelve a validar la regla: si ya no aplica (pasaron las
-- 3 horas o alguien más la registró), no se guarda nada.
-- -----------------------------------------------------------------------------
create or replace function public.kiosco_registrar(
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
  v_anterior uuid;
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
  elsif p_accion = 'salida_anterior' and v_abierta is null then
    v_anterior := privado.entrada_pendiente_anterior(p_turno, v_alumno_id);
    if v_anterior is null then
      raise exception 'El registro cambió; vuelve a escribir tu matrícula' using errcode = '22023';
    end if;
    update public.registros_gimnasio set salida = now() where id = v_anterior;
  else
    raise exception 'El registro cambió; vuelve a escribir tu matrícula' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'accion', case when p_accion = 'salida_anterior' then 'salida' else p_accion end,
    'nombre_corto', privado.nombre_corto(v_nombre)
  );
end;
$$;

revoke all on function public.kiosco_buscar(uuid, text) from public, anon;
revoke all on function public.kiosco_registrar(uuid, text, text, text) from public, anon;
grant execute on function public.kiosco_buscar(uuid, text) to authenticated;
grant execute on function public.kiosco_registrar(uuid, text, text, text) to authenticated;

commit;

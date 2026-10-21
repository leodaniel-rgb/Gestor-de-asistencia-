-- =============================================================================
-- Pruebas · F7 (ping, detalle por alumno, respaldo, registro de exportaciones)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'F7 respaldos: todas las pruebas pasaron'.
-- =============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid');

update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid', 'Futbol', 'entrenador', false);

insert into public.disciplinas (id, nombre) values ('00000000-0000-0000-0000-0000000000d1', 'Fútbol (rls)');
insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1');
insert into public.alumnos (id, matricula, nombre, genero) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000701', 'Alumna Respaldo', 'femenino');
insert into public.inscripciones (alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '16:00',
  '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"}]'::jsonb);

-- 1. El entrenador no saca respaldos, detalle ni registra exportaciones
do $$ begin
  perform public.respaldo_completo();
  raise exception 'Prueba 1 falló: el entrenador sacó un respaldo';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.reporte_asistencias_detalle(privado.hoy_mx() - 7, privado.hoy_mx());
  raise exception 'Prueba 1 falló: el entrenador vio el detalle por alumno';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.registrar_exportacion('respaldo');
  raise exception 'Prueba 1 falló: el entrenador registró una exportación';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  assert public.ultimo_respaldo() is null, 'Prueba 1 falló: el entrenador vio la fecha del último respaldo';
end $$;
reset role;

-- 2. Anónimo solo puede hacer ping --------------------------------------------
set local role anon;
do $$ begin
  assert public.ping() = 'ok', 'Prueba 2 falló: ping';
end $$;
do $$ begin
  perform public.respaldo_completo();
  raise exception 'Prueba 2 falló: anon sacó un respaldo';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Coordinador ----------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

-- 3. Detalle por alumno y respaldo completo
do $$ declare d jsonb; r jsonb; begin
  d := public.reporte_asistencias_detalle(privado.hoy_mx() - 7, privado.hoy_mx(),
    array['00000000-0000-0000-0000-0000000000d1']::uuid[]);
  assert jsonb_array_length(d) = 1 and d -> 0 ->> 'matricula' = 'AL00000701' and d -> 0 ->> 'estado' = 'asistio',
    'Prueba 3 falló: detalle ' || d::text;
  r := public.respaldo_completo();
  assert exists (select 1 from jsonb_array_elements(r -> 'asistencias') x where x ->> 'matricula' = 'AL00000701'),
    'Prueba 3 falló: el respaldo no incluye la asistencia';
  assert exists (select 1 from jsonb_array_elements(r -> 'alumnos') x where x ->> 'matricula' = 'AL00000701'),
    'Prueba 3 falló: el respaldo no incluye al alumno';
end $$;

-- 4. La exportación queda en la bitácora y actualiza el último respaldo
select public.registrar_exportacion('respaldo');
do $$ begin
  assert public.ultimo_respaldo() is not null, 'Prueba 4 falló: no hay último respaldo';
  assert exists (select 1 from public.bitacora where accion = 'exportar' and entidad = 'respaldo'
                 and actor = '00000000-0000-0000-0000-0000000000c1'), 'Prueba 4 falló: no quedó en bitácora';
end $$;
do $$ begin
  perform public.registrar_exportacion('lo-que-sea');
  raise exception 'Prueba 4 falló: se aceptó un tipo de exportación inválido';
exception when invalid_parameter_value then null;
end $$;
reset role;

select 'F7 respaldos: todas las pruebas pasaron' as resultado;

rollback;

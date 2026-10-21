-- =============================================================================
-- Pruebas de RLS · F4 (gimnasio: turnos y registros del kiosco)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'F4 RLS: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'gym1@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'gym2@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e3', 'futbol@rls-fixture.invalid');

update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'gym1@rls-fixture.invalid', 'Gym Mañana', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e2', 'gym2@rls-fixture.invalid', 'Gym Tarde', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e3', 'futbol@rls-fixture.invalid', 'Futbol', 'entrenador', false);

insert into public.disciplinas (id, nombre, tipo) values
  ('00000000-0000-0000-0000-0000000000d1', 'Gimnasio (rls)', 'acceso_libre'),
  ('00000000-0000-0000-0000-0000000000d2', 'Fútbol (rls)', 'lista');
insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d2');

insert into public.alumnos (id, matricula, nombre) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000301', 'Daniel Eduardo Torres Rivera');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- 0. Nombre corto -------------------------------------------------------------
do $$ begin
  assert privado.nombre_corto('Daniel Eduardo Torres Rivera') = 'Daniel T.', 'Prueba 0 falló: 4 palabras';
  assert privado.nombre_corto('Ana Pérez López') = 'Ana P.', 'Prueba 0 falló: 3 palabras';
  assert privado.nombre_corto('Luis Gómez') = 'Luis G.', 'Prueba 0 falló: 2 palabras';
end $$;

-- Entrenador de gimnasio (mañana) -------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;

-- 1. Abre turno
select set_config('prueba.turno', public.abrir_turno('00000000-0000-0000-0000-0000000000d1', 'manana')::text, true);

-- 2. Búsqueda: alumno existente → entrada con nombre corto; inexistente → nuevo
do $$ declare r jsonb; begin
  r := public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000301');
  assert r ->> 'accion' = 'entrada' and r ->> 'nombre_corto' = 'Daniel T.', 'Prueba 2 falló: ' || r::text;
  assert not (r ? 'nombre'), 'Prueba 2 falló: se expuso el nombre completo';
  r := public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000399');
  assert r ->> 'accion' = 'nuevo' and not (r ? 'nombre_corto'), 'Prueba 2 falló (nuevo): ' || r::text;
end $$;

-- 3. Entrada, luego la búsqueda ofrece salida, y la salida se registra
do $$ declare r jsonb; begin
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000301', 'entrada');
  r := public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000301');
  assert r ->> 'accion' = 'salida', 'Prueba 3 falló: no ofrece salida';
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000301', 'salida');
  assert (select count(*) from public.registros_gimnasio
          where turno_id = current_setting('prueba.turno')::uuid and salida is not null) = 1,
    'Prueba 3 falló: no se registró la salida';
end $$;

-- 4. No registra dos veces la misma acción (doble toque)
do $$ begin
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000301', 'salida');
  raise exception 'Prueba 4 falló: se registró una salida sin entrada abierta';
exception when invalid_parameter_value then null;
end $$;

-- 5. Alumno nuevo: exige nombre y se registra con su entrada
do $$ begin
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000302', 'entrada', 'Ana');
  raise exception 'Prueba 5 falló: se aceptó un nombre incompleto';
exception when invalid_parameter_value then null;
end $$;
do $$ declare r jsonb; begin
  r := public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000302', 'entrada', '  Ana   Pérez  López ');
  assert r ->> 'nombre_corto' = 'Ana P.', 'Prueba 5 falló: ' || r::text;
end $$;

-- 6. Rechaza matrículas sin normalizar
do $$ begin
  perform public.kiosco_buscar(current_setting('prueba.turno')::uuid, '07210101');
  raise exception 'Prueba 6 falló: se aceptó una matrícula sin AL';
exception when invalid_parameter_value then null;
end $$;

-- 7. Escritura directa prohibida (solo funciones)
do $$ begin
  insert into public.registros_gimnasio (turno_id, alumno_id)
  values (current_setting('prueba.turno')::uuid, '00000000-0000-0000-0000-0000000000a1');
  raise exception 'Prueba 7 falló: se insertó un registro directo';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.turnos_gimnasio set cerrado_en = now() where id = current_setting('prueba.turno')::uuid;
  raise exception 'Prueba 7 falló: se cerró un turno directo';
exception when insufficient_privilege then null;
end $$;

-- 8. Límite de 30 búsquedas por minuto
do $$ begin
  for i in 1..40 loop
    perform public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000301');
  end loop;
  raise exception 'Prueba 8 falló: no se aplicó el límite de búsquedas';
exception when program_limit_exceeded then null;
end $$;
reset role;

-- 9. El otro entrenador del gimnasio abre turno: el anterior se cierra solo ---
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select set_config('prueba.turno2', public.abrir_turno('00000000-0000-0000-0000-0000000000d1', null)::text, true);
do $$ begin
  assert (select cierre_automatico from public.turnos_gimnasio where id = current_setting('prueba.turno')::uuid),
    'Prueba 9 falló: el turno olvidado no se cerró automáticamente';
  assert (select count(*) from public.registros_gimnasio
          where turno_id = current_setting('prueba.turno')::uuid and salida is null) = 1,
    'Prueba 9 falló: la entrada abierta no quedó como "sin salida"';
end $$;

-- 10. En un turno cerrado ya no se registra
do $$ begin
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000301', 'entrada');
  raise exception 'Prueba 10 falló: se registró en un turno cerrado';
exception when invalid_parameter_value then null;
end $$;

-- 11. Cierra su turno
select public.cerrar_turno(current_setting('prueba.turno2')::uuid);
do $$ begin
  assert (select cerrado_por from public.turnos_gimnasio where id = current_setting('prueba.turno2')::uuid)
         = '00000000-0000-0000-0000-0000000000e2', 'Prueba 11 falló: no quedó quién cerró';
end $$;
reset role;

-- 12. Un entrenador de otra disciplina no ve ni opera el gimnasio ---------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.turnos_gimnasio) = 0, 'Prueba 12 falló: ve turnos ajenos';
  assert (select count(*) from public.registros_gimnasio) = 0, 'Prueba 12 falló: ve registros ajenos';
end $$;
do $$ begin
  perform public.abrir_turno('00000000-0000-0000-0000-0000000000d1');
  raise exception 'Prueba 12 falló: abrió un turno ajeno';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.abrir_turno('00000000-0000-0000-0000-0000000000d2');
  raise exception 'Prueba 12 falló: abrió turno en una disciplina con lista';
exception when invalid_parameter_value then null;
end $$;
reset role;

-- 13. El coordinador ve todo ---------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.registros_gimnasio
          where turno_id in (current_setting('prueba.turno')::uuid, current_setting('prueba.turno2')::uuid)) = 2,
    'Prueba 13 falló: el coordinador no ve los registros';
end $$;
reset role;

-- 14. Anónimo no ejecuta el kiosco --------------------------------------------
set local role anon;
do $$ begin
  perform public.kiosco_buscar(current_setting('prueba.turno2')::uuid, 'AL00000301');
  raise exception 'Prueba 14 falló: anon usó el kiosco';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F4 RLS: todas las pruebas pasaron' as resultado;

rollback;

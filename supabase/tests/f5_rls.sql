-- =============================================================================
-- Pruebas de RLS · F5 (correcciones de la coordinación con motivo)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'F5 RLS: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'gym@rls-fixture.invalid');

update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid', 'Futbol', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e2', 'gym@rls-fixture.invalid', 'Gym', 'entrenador', false);

insert into public.disciplinas (id, nombre, tipo) values
  ('00000000-0000-0000-0000-0000000000d1', 'Fútbol (rls)', 'lista'),
  ('00000000-0000-0000-0000-0000000000d2', 'Gimnasio (rls)', 'acceso_libre');
insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2');

insert into public.alumnos (id, matricula, nombre, genero) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000501', 'Alumna Uno', 'femenino'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000502', 'Alumno Dos', 'masculino');
insert into public.inscripciones (alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Entrenador registra una sesión y el gimnasio tiene un turno con registro ----
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select set_config('prueba.sesion', public.registrar_sesion(
  '00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '16:00',
  '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"falta"}]'::jsonb)::text, true);

-- 1. El entrenador no puede usar funciones de corrección ----------------------
do $$ begin
  perform public.admin_anular_sesion(current_setting('prueba.sesion')::uuid, true, 'Intento del entrenador');
  raise exception 'Prueba 1 falló: el entrenador anuló una sesión';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_actualizar_alumno('00000000-0000-0000-0000-0000000000a1', 'AL00000501', 'Otro', null, 'Intento del entrenador');
  raise exception 'Prueba 1 falló: el entrenador usó la corrección de alumnos';
exception when insufficient_privilege then null;
end $$;

-- 2. El entrenador no puede anular directamente (columna sin permiso) ---------
do $$ begin
  update public.sesiones set anulada = true where id = current_setting('prueba.sesion')::uuid;
  raise exception 'Prueba 2 falló: el entrenador anuló por update directo';
exception when insufficient_privilege then null;
end $$;

-- 3. El historial no muestra nada al entrenador --------------------------------
do $$ begin
  assert (select count(*) from public.admin_historial('sesiones', current_setting('prueba.sesion')::uuid)) = 0,
    'Prueba 3 falló: el entrenador vio el historial';
end $$;
reset role;

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select set_config('prueba.turno', public.abrir_turno('00000000-0000-0000-0000-0000000000d2', 'manana')::text, true);
select public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000501', 'entrada');
reset role;

-- Coordinador ----------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

-- 4. Sin motivo no hay corrección
do $$ begin
  perform public.admin_anular_sesion(current_setting('prueba.sesion')::uuid, true, 'no');
  raise exception 'Prueba 4 falló: se corrigió sin motivo suficiente';
exception when invalid_parameter_value then null;
end $$;

-- 5. Corrige una marca después de las 24 h, y el motivo queda en la bitácora
reset role; -- (como postgres) simular que la sesión se registró hace 3 días
update public.sesiones set creado_en = now() - interval '3 days' where id = current_setting('prueba.sesion')::uuid;
set local role authenticated;
select public.admin_corregir_sesion(
  current_setting('prueba.sesion')::uuid, '16:00',
  jsonb_build_array(jsonb_build_object(
    'id', (select id from public.asistencias where sesion_id = current_setting('prueba.sesion')::uuid
           and alumno_id = '00000000-0000-0000-0000-0000000000a2'),
    'estado', 'asistio')),
  '[]'::jsonb, 'El entrenador marcó falta por error');
do $$ begin
  assert (select count(*) from public.asistencias
          where sesion_id = current_setting('prueba.sesion')::uuid and estado = 'asistio') = 2,
    'Prueba 5 falló: no se aplicó la corrección';
  assert exists (
    select 1 from public.admin_historial('sesiones', current_setting('prueba.sesion')::uuid)
    where entidad = 'asistencias' and motivo = 'El entrenador marcó falta por error' and actor_nombre = 'Coordinación'
  ), 'Prueba 5 falló: el motivo no quedó en el historial';
end $$;

-- 6. Anula y restaura; la sesión anulada no se corrige
select public.admin_anular_sesion(current_setting('prueba.sesion')::uuid, true, 'Sesión duplicada');
do $$ begin
  perform public.admin_corregir_sesion(current_setting('prueba.sesion')::uuid, '17:00', '[]'::jsonb, '[]'::jsonb, 'Cambio de hora');
  raise exception 'Prueba 6 falló: se corrigió una sesión anulada';
exception when invalid_parameter_value then null;
end $$;
select public.admin_anular_sesion(current_setting('prueba.sesion')::uuid, false, 'Se anuló por error');
do $$ begin
  assert not (select anulada from public.sesiones where id = current_setting('prueba.sesion')::uuid),
    'Prueba 6 falló: no se restauró';
  assert exists (select 1 from public.sesiones where id = current_setting('prueba.sesion')::uuid),
    'Prueba 6 falló: la sesión desapareció';
end $$;

-- 7. Captura por la coordinación: fecha pasada sí, futura no, lista completa
do $$ declare v uuid; begin
  v := public.admin_capturar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 10, '09:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
      {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"asistio"}]'::jsonb,
    '[]'::jsonb, 'Lista en papel entregada por el entrenador');
  assert (select capturada_por_coordinacion and registro_tardio from public.sesiones where id = v),
    'Prueba 7 falló: no quedó marcada como capturada y tardía';
end $$;
do $$ begin
  perform public.admin_capturar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() + 1, '09:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
      {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"asistio"}]'::jsonb,
    '[]'::jsonb, 'Fecha futura');
  raise exception 'Prueba 7 falló: se capturó una fecha futura';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  perform public.admin_capturar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 1, '09:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"}]'::jsonb,
    '[]'::jsonb, 'Lista incompleta');
  raise exception 'Prueba 7 falló: se capturó una lista incompleta';
exception when invalid_parameter_value then null;
end $$;

-- 8. Gimnasio: no corrige salidas con el turno abierto; cierra y corrige
do $$ begin
  perform public.admin_corregir_salida(
    (select id from public.registros_gimnasio where turno_id = current_setting('prueba.turno')::uuid),
    now(), 'Olvidó registrar salida');
  raise exception 'Prueba 8 falló: se corrigió una salida con el turno abierto';
exception when invalid_parameter_value then null;
end $$;
select public.admin_cerrar_turno(current_setting('prueba.turno')::uuid, 'Turno olvidado abierto');
select public.admin_corregir_salida(
  (select id from public.registros_gimnasio where turno_id = current_setting('prueba.turno')::uuid),
  now(), 'Olvidó registrar salida');
do $$ begin
  assert (select salida_corregida from public.registros_gimnasio where turno_id = current_setting('prueba.turno')::uuid),
    'Prueba 8 falló: la salida no quedó marcada como corregida';
end $$;
do $$ begin
  perform public.admin_corregir_salida(
    (select id from public.registros_gimnasio where turno_id = current_setting('prueba.turno')::uuid),
    now() + interval '1 hour', 'Salida en el futuro');
  raise exception 'Prueba 8 falló: se aceptó una salida futura';
exception when invalid_parameter_value then null;
end $$;

-- 9. Anular registro de gimnasio y alumno corregido con motivo
select public.admin_anular_registro_gimnasio(
  (select id from public.registros_gimnasio where turno_id = current_setting('prueba.turno')::uuid),
  true, 'Registro de prueba');
select public.admin_actualizar_alumno('00000000-0000-0000-0000-0000000000a2', 'AL00000599', 'Alumno  Dos  Corregido', 'no_binario',
  'Matrícula mal capturada');
do $$ begin
  assert (select matricula || '|' || nombre from public.alumnos where id = '00000000-0000-0000-0000-0000000000a2')
         = 'AL00000599|Alumno Dos Corregido', 'Prueba 9 falló: alumno no corregido';
  assert exists (select 1 from public.admin_historial('alumnos', '00000000-0000-0000-0000-0000000000a2')
                 where motivo = 'Matrícula mal capturada'), 'Prueba 9 falló: sin motivo en historial';
end $$;

-- 10. Un cambio del entrenador (sin función de corrección) no lleva motivo.
-- En la app cada petición es su propia transacción; aquí se limpia la variable
-- para simularlo, porque todo el script corre en una sola transacción.
reset role;
select set_config('vive.motivo', '', true);
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
update public.alumnos set nombre = 'Alumna Uno Bis' where id = '00000000-0000-0000-0000-0000000000a1';
reset role;
do $$ begin
  assert (select motivo from public.bitacora where entidad = 'alumnos'
          and entidad_id = '00000000-0000-0000-0000-0000000000a1' order by id desc limit 1) is null,
    'Prueba 10 falló: un cambio del entrenador quedó con motivo ajeno';
end $$;

-- 11. Nadie borra la bitácora (sigue vigente) ----------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
do $$ begin
  delete from public.bitacora;
  raise exception 'Prueba 11 falló: se borró la bitácora';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F5 RLS: todas las pruebas pasaron' as resultado;

rollback;

-- =============================================================================
-- Pruebas de RLS · F3 (sesiones, asistencias, incidencias, días sin clase)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos.
-- Resultado esperado: 'F3 RLS: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'basquet@rls-fixture.invalid');

update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid', 'Entrenador Futbol', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e2', 'basquet@rls-fixture.invalid', 'Entrenador Basquet', 'entrenador', false);

insert into public.disciplinas (id, nombre) values
  ('00000000-0000-0000-0000-0000000000d1', 'Fútbol (rls)'),
  ('00000000-0000-0000-0000-0000000000d2', 'Básquetbol (rls)');
insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2');

insert into public.alumnos (id, matricula, nombre, genero) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000201', 'Alumna Uno', 'femenino'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000202', 'Alumno Dos', 'masculino'),
  ('00000000-0000-0000-0000-0000000000a3', 'AL00000203', 'Alumno Ajeno', 'masculino');
insert into public.inscripciones (alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d2');

-- Una solicitud de alta pendiente en fútbol (creada como postgres)
insert into public.solicitudes (id, tipo, disciplina_id, matricula, nombre, solicitado_por) values
  ('00000000-0000-0000-0000-0000000005a1', 'alta', '00000000-0000-0000-0000-0000000000d1',
   'AL00000204', 'Alumna Pendiente', '00000000-0000-0000-0000-0000000000e1');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Entrenador de fútbol --------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;

-- 1. Registra una sesión completa (2 alumnos + 1 pendiente) con una incidencia
-- El id de la sesión se guarda en una variable de la transacción (sin tablas temporales).
select set_config('prueba.sesion', public.registrar_sesion(
  '00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '16:00',
  '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"falta"},
    {"solicitud_id":"00000000-0000-0000-0000-0000000005a1","estado":"asistio"}]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'categoria_id', (select id from public.catalogo_opciones where tipo = 'categoria_incidencia' and nombre = 'Lesión'),
    'descripcion', 'Torcedura leve')))::text, true);
do $$ begin
  assert (select count(*) from public.asistencias where sesion_id = current_setting('prueba.sesion')::uuid) = 3,
    'Prueba 1 falló: no se guardaron las 3 marcas';
  assert not (select registro_tardio from public.sesiones where id = current_setting('prueba.sesion')::uuid),
    'Prueba 1 falló: una sesión de hoy quedó como tardía';
end $$;

-- 2. No guarda si falta alguien por marcar
do $$ begin
  perform public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '18:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"}]'::jsonb);
  raise exception 'Prueba 2 falló: se guardó una lista incompleta';
exception when invalid_parameter_value then null;
end $$;

-- 3. No acepta alumnos de otra disciplina
do $$ begin
  perform public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '18:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
      {"alumno_id":"00000000-0000-0000-0000-0000000000a3","estado":"asistio"},
      {"solicitud_id":"00000000-0000-0000-0000-0000000005a1","estado":"asistio"}]'::jsonb);
  raise exception 'Prueba 3 falló: se aceptó un alumno ajeno';
exception when invalid_parameter_value then null;
end $$;

-- 4. Ventana de captura: 3 días atrás sí (tardía), 4 días atrás no
do $$ declare v uuid; begin
  v := public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 3, '16:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
      {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"asistio"},
      {"solicitud_id":"00000000-0000-0000-0000-0000000005a1","estado":"falta"}]'::jsonb);
  assert (select registro_tardio from public.sesiones where id = v), 'Prueba 4 falló: no se marcó como tardía';
end $$;
do $$ begin
  perform public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 4, '16:00',
    '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
      {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"asistio"},
      {"solicitud_id":"00000000-0000-0000-0000-0000000005a1","estado":"falta"}]'::jsonb);
  raise exception 'Prueba 4 falló: se aceptó una fecha de hace 4 días';
exception when insufficient_privilege then null;
end $$;

-- 5. Corrige dentro de las 24 h
do $$ declare n int; begin
  perform public.corregir_sesion(current_setting('prueba.sesion')::uuid, '16:30',
    jsonb_build_array(jsonb_build_object(
      'id', (select id from public.asistencias where sesion_id = current_setting('prueba.sesion')::uuid
             and alumno_id = '00000000-0000-0000-0000-0000000000a2'),
      'estado', 'asistio')), '[]'::jsonb);
  select count(*) into n from public.asistencias
  where sesion_id = current_setting('prueba.sesion')::uuid and estado = 'asistio';
  assert n = 3, 'Prueba 5 falló: la corrección no se aplicó';
  assert (select count(*) from public.incidencias where sesion_id = current_setting('prueba.sesion')::uuid) = 0,
    'Prueba 5 falló: no se reemplazaron las incidencias';
end $$;

-- 6. No puede reasignar una marca a otro alumno ni tocar registro_tardio
do $$ begin
  update public.asistencias set alumno_id = '00000000-0000-0000-0000-0000000000a3'
  where sesion_id = current_setting('prueba.sesion')::uuid and alumno_id = '00000000-0000-0000-0000-0000000000a1';
  raise exception 'Prueba 6 falló: el entrenador reasignó una asistencia';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.sesiones set registro_tardio = true where id = current_setting('prueba.sesion')::uuid;
  raise exception 'Prueba 6 falló: el entrenador cambió registro_tardio';
exception when insufficient_privilege then null;
end $$;

-- 7. No inserta marcas de alumnos ajenos directamente
do $$ begin
  insert into public.asistencias (sesion_id, alumno_id, estado)
  values (current_setting('prueba.sesion')::uuid, '00000000-0000-0000-0000-0000000000a3', 'asistio');
  raise exception 'Prueba 7 falló: se insertó la marca de un alumno ajeno';
exception when insufficient_privilege then null;
end $$;

-- 8. "No hubo clase": una vez por día y solo con motivos del catálogo correcto
insert into public.dias_sin_clase (disciplina_id, fecha, motivo_id)
values ('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 1,
        (select id from public.catalogo_opciones where tipo = 'motivo_sin_clase' and nombre = 'Clima'));
do $$ begin
  insert into public.dias_sin_clase (disciplina_id, fecha) values ('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 1);
  raise exception 'Prueba 8 falló: se duplicó un día sin clase';
exception when unique_violation then null;
end $$;
do $$ begin
  insert into public.dias_sin_clase (disciplina_id, fecha, motivo_id)
  values ('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 2,
          (select id from public.catalogo_opciones where tipo = 'categoria_incidencia' limit 1));
  raise exception 'Prueba 8 falló: se aceptó una categoría de incidencia como motivo';
exception when insufficient_privilege then null;
end $$;

-- 9. El entrenador no edita catálogos ni borra registros
do $$ begin
  insert into public.catalogo_opciones (tipo, nombre) values ('motivo_sin_clase', 'Pirata');
  raise exception 'Prueba 9 falló: el entrenador agregó una opción';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from public.asistencias;
  raise exception 'Prueba 9 falló: se borraron asistencias';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from public.sesiones;
  raise exception 'Prueba 9 falló: se borraron sesiones';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 10. Pasadas 24 h ya no se corrige ------------------------------------------
update public.sesiones set creado_en = now() - interval '25 hours'
where id = current_setting('prueba.sesion')::uuid;
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  perform public.corregir_sesion(current_setting('prueba.sesion')::uuid, '17:00', '[]'::jsonb);
  raise exception 'Prueba 10 falló: se corrigió después de 24 h';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 11. Otro entrenador no ve ni registra en fútbol ------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.sesiones where disciplina_id = '00000000-0000-0000-0000-0000000000d1') = 0,
    'Prueba 11 falló: ve sesiones ajenas';
  assert (select count(*) from public.asistencias) = 0, 'Prueba 11 falló: ve asistencias ajenas';
end $$;
do $$ begin
  perform public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '16:00', '[]'::jsonb);
  raise exception 'Prueba 11 falló: registró en una disciplina ajena';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Coordinador ----------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

-- 12. Máximo 6 opciones activas por catálogo
insert into public.catalogo_opciones (tipo, nombre) values
  ('motivo_sin_clase', 'Vacaciones'), ('motivo_sin_clase', 'Mantenimiento');
do $$ begin
  insert into public.catalogo_opciones (tipo, nombre) values ('motivo_sin_clase', 'Séptima');
  raise exception 'Prueba 12 falló: se aceptó una séptima opción activa';
exception when check_violation then null;
end $$;
-- Desactivar una libera el lugar
update public.catalogo_opciones set activa = false where tipo = 'motivo_sin_clase' and nombre = 'Otro';
insert into public.catalogo_opciones (tipo, nombre) values ('motivo_sin_clase', 'Séptima');

-- 13. Al aprobar la solicitud, su asistencia pendiente pasa al alumno nuevo
select public.aprobar_solicitud('00000000-0000-0000-0000-0000000005a1');
do $$ begin
  assert (
    select count(*) from public.asistencias a join public.alumnos al on al.id = a.alumno_id
    where al.matricula = 'AL00000204' and a.solicitud_id = '00000000-0000-0000-0000-0000000005a1'
  ) = 2, 'Prueba 13 falló: las asistencias pendientes no pasaron al alumno aprobado';
end $$;
reset role;

-- 14. Anónimo no ve nada --------------------------------------------------------
set local role anon;
do $$ begin
  perform 1 from public.sesiones;
  raise exception 'Prueba 14 falló: anon leyó sesiones';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F3 RLS: todas las pruebas pasaron' as resultado;

rollback;

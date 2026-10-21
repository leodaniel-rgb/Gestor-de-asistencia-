-- =============================================================================
-- Pruebas de RLS · F2a (disciplinas, asignaciones, alumnos, inscripciones)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos.
-- Resultado esperado: 'F2a RLS: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'basquet@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e3', 'pendiente@rls-fixture.invalid');

-- Solo puede haber un coordinador: el de vive-dev (si existe) se degrada
-- temporalmente dentro de esta transacción, que termina en rollback.
update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid', 'Entrenador Futbol', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e2', 'basquet@rls-fixture.invalid', 'Entrenador Basquet', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e3', 'pendiente@rls-fixture.invalid', 'Entrenador Pendiente', 'entrenador', true);

insert into public.disciplinas (id, nombre, dias_clase) values
  ('00000000-0000-0000-0000-0000000000d1', 'Fútbol (prueba)', '{1,3}'),
  ('00000000-0000-0000-0000-0000000000d2', 'Básquetbol (prueba)', '{2}');

insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1');

insert into public.alumnos (id, matricula, nombre, genero) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000001', 'Alumno Uno', 'femenino'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000002', 'Alumno Dos', 'masculino');

insert into public.inscripciones (id, alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d2');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Anónimo no ve alumnos ----------------------------------------------------
set local role anon;
do $$ begin
  perform 1 from public.alumnos;
  raise exception 'Prueba 1 falló: anon pudo leer alumnos';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Entrenador de fútbol --------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;

-- 2. Solo ve su disciplina
do $$ begin
  assert (select count(*) from public.disciplinas) = 1, 'Prueba 2 falló: entrenador ve disciplinas ajenas';
end $$;

-- 3. Solo ve a sus alumnos y sus inscripciones
do $$ begin
  assert (select count(*) from public.alumnos) = 1, 'Prueba 3 falló: entrenador ve alumnos ajenos';
  assert (select count(*) from public.inscripciones) = 1, 'Prueba 3 falló: entrenador ve inscripciones ajenas';
end $$;

-- 4. Corrige nombre y género de su alumno
do $$ declare n int; begin
  update public.alumnos set nombre = 'Alumna Uno', genero = 'no_binario'
  where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'Prueba 4 falló: entrenador no pudo corregir a su alumno';
end $$;

-- 5. No modifica alumnos ajenos
do $$ declare n int; begin
  update public.alumnos set nombre = 'Hackeado' where id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  assert n = 0, 'Prueba 5 falló: entrenador modificó un alumno ajeno';
end $$;

-- 6. No corrige matrículas
do $$ begin
  update public.alumnos set matricula = 'AL09999999' where id = '00000000-0000-0000-0000-0000000000a1';
  raise exception 'Prueba 6 falló: entrenador cambió una matrícula';
exception when insufficient_privilege then null;
end $$;

-- 7. No crea disciplinas, alumnos ni inscripciones
do $$ begin
  insert into public.disciplinas (nombre) values ('Pirata');
  raise exception 'Prueba 7 falló: entrenador creó una disciplina';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.alumnos (matricula, nombre) values ('AL00000009', 'Pirata');
  raise exception 'Prueba 7 falló: entrenador creó un alumno';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.inscripciones (alumno_id, disciplina_id)
  values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1');
  raise exception 'Prueba 7 falló: entrenador inscribió a un alumno';
exception when insufficient_privilege then null;
end $$;

-- 8. No se quita ni se pone asignaciones
do $$ declare n int; begin
  delete from public.entrenador_disciplina;
  get diagnostics n = row_count;
  assert n = 0, 'Prueba 8 falló: entrenador borró asignaciones';
end $$;
reset role;

-- 9. Entrenador con cambio de contraseña pendiente no ve nada -----------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e3');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.disciplinas) = 0, 'Prueba 9 falló: cuenta pendiente ve disciplinas';
  assert (select count(*) from public.alumnos) = 0, 'Prueba 9 falló: cuenta pendiente ve alumnos';
end $$;
reset role;

-- Coordinador ---------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

-- 10. Crea disciplina, asigna, crea alumno e inscribe; queda en bitácora
do $$ begin
  insert into public.disciplinas (id, nombre, tipo) values
    ('00000000-0000-0000-0000-0000000000d3', 'Gimnasio (prueba)', 'acceso_libre');
  insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d3');
  insert into public.alumnos (id, matricula, nombre) values
    ('00000000-0000-0000-0000-0000000000a3', 'AL00000003', 'Alumno Tres');
  insert into public.inscripciones (id, alumno_id, disciplina_id) values
    ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d1');
  assert exists (
    select 1 from public.bitacora
    where entidad = 'inscripciones' and entidad_id = '00000000-0000-0000-0000-0000000000f3'
      and actor = '00000000-0000-0000-0000-0000000000c1'
  ), 'Prueba 10 falló: la inscripción no quedó en bitácora con el coordinador';
end $$;

-- 11. No duplica inscripciones vigentes
do $$ begin
  insert into public.inscripciones (alumno_id, disciplina_id) values
    ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d1');
  raise exception 'Prueba 11 falló: se duplicó una inscripción vigente';
exception when unique_violation then null;
end $$;

-- 12. Solo asigna entrenadores activos (no coordinadores)
do $$ begin
  insert into public.entrenador_disciplina (entrenador_id, disciplina_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1');
  raise exception 'Prueba 12 falló: se asignó al coordinador como entrenador';
exception when insufficient_privilege then null;
end $$;

-- 13. Formatos inválidos se rechazan en la base
do $$ begin
  insert into public.alumnos (matricula, nombre) values ('07210101', 'Sin prefijo');
  raise exception 'Prueba 13 falló: se aceptó una matrícula sin normalizar';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.disciplinas (nombre, dias_clase) values ('Días malos', '{8}');
  raise exception 'Prueba 13 falló: se aceptó un día inválido';
exception when check_violation then null;
end $$;

-- 14. Nadie borra disciplinas, alumnos ni inscripciones
do $$ begin
  delete from public.inscripciones;
  raise exception 'Prueba 14 falló: se borraron inscripciones';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from public.alumnos;
  raise exception 'Prueba 14 falló: se borraron alumnos';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from public.disciplinas;
  raise exception 'Prueba 14 falló: se borraron disciplinas';
exception when insufficient_privilege then null;
end $$;

-- 15. Baja de un alumno
do $$ declare n int; begin
  update public.inscripciones set fecha_baja = privado.hoy_mx()
  where id = '00000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  assert n = 1, 'Prueba 15 falló: el coordinador no pudo dar de baja';
end $$;
reset role;

-- 16. Tras la baja, el entrenador ya no ve a ese alumno -----------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  assert not exists (select 1 from public.alumnos where id = '00000000-0000-0000-0000-0000000000a1'),
    'Prueba 16 falló: el entrenador sigue viendo a un alumno dado de baja';
  -- Sí ve la inscripción histórica (para reportes de su disciplina)
  assert exists (select 1 from public.inscripciones where id = '00000000-0000-0000-0000-0000000000f1'),
    'Prueba 16 falló: el entrenador perdió el histórico de inscripciones';
end $$;
reset role;

select 'F2a RLS: todas las pruebas pasaron' as resultado;

rollback;

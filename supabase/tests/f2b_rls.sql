-- =============================================================================
-- Pruebas de RLS · F2b (importación y solicitudes)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos.
-- Resultado esperado: 'F2b RLS: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'basquet@rls-fixture.invalid');

-- Solo puede haber un coordinador: el de vive-dev se degrada dentro de esta transacción.
update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'futbol@rls-fixture.invalid', 'Entrenador Futbol', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e2', 'basquet@rls-fixture.invalid', 'Entrenador Basquet', 'entrenador', false);

insert into public.disciplinas (id, nombre, tipo) values
  ('00000000-0000-0000-0000-0000000000d1', 'Fútbol (rls)', 'lista'),
  ('00000000-0000-0000-0000-0000000000d2', 'Básquetbol (rls)', 'lista'),
  ('00000000-0000-0000-0000-0000000000d3', 'Gimnasio (rls)', 'acceso_libre');

insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2');

insert into public.alumnos (id, matricula, nombre) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000101', 'Alumno Uno'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000102', 'Alumno Dos');

insert into public.inscripciones (id, alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d2');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Entrenador de fútbol --------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;

-- 1. Sugiere un alta en su disciplina (sin elegir el id: no tiene permiso sobre esa columna)
insert into public.solicitudes (tipo, disciplina_id, matricula, nombre, genero) values
  ('alta', '00000000-0000-0000-0000-0000000000d1', 'AL00000103', 'Alumno Tres', 'femenino');

-- 2. No duplica una sugerencia pendiente
do $$ begin
  insert into public.solicitudes (tipo, disciplina_id, matricula, nombre)
  values ('alta', '00000000-0000-0000-0000-0000000000d1', 'AL00000103', 'Otra vez');
  raise exception 'Prueba 2 falló: se duplicó una sugerencia pendiente';
exception when unique_violation then null;
end $$;

-- 3. No sugiere en disciplinas ajenas
do $$ begin
  insert into public.solicitudes (tipo, disciplina_id, matricula, nombre)
  values ('alta', '00000000-0000-0000-0000-0000000000d2', 'AL00000104', 'Ajeno');
  raise exception 'Prueba 3 falló: sugirió en una disciplina ajena';
exception when insufficient_privilege then null;
end $$;

-- 4. Reporta la baja de su alumno, pero no la de un alumno ajeno
insert into public.solicitudes (tipo, disciplina_id, inscripcion_id, nota) values
  ('baja', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f1', 'Ya no asiste');
do $$ begin
  insert into public.solicitudes (tipo, disciplina_id, inscripcion_id)
  values ('baja', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f2');
  raise exception 'Prueba 4 falló: reportó la baja de un alumno ajeno';
exception when insufficient_privilege then null;
end $$;

-- 5. No puede aprobarse a sí mismo ni marcar como aprobada
do $$ begin
  perform public.aprobar_solicitud((select id from public.solicitudes where matricula = 'AL00000103'));
  raise exception 'Prueba 5 falló: el entrenador aprobó una solicitud';
exception when insufficient_privilege then null;
end $$;
do $$ declare n int; begin
  update public.solicitudes set estado = 'aprobada', resuelto_en = now()
  where matricula = 'AL00000103';
  get diagnostics n = row_count;
  assert n = 0, 'Prueba 5 falló: el entrenador cambió el estado de una solicitud';
end $$;

-- 6. No puede importar listas
do $$ begin
  perform public.importar_alumnos('00000000-0000-0000-0000-0000000000d1',
    '[{"matricula":"AL00000199","nombre":"Pirata"}]'::jsonb);
  raise exception 'Prueba 6 falló: el entrenador importó una lista';
exception when insufficient_privilege then null;
end $$;

-- 6b. No puede elegir el id ni el estado al crear una solicitud
do $$ begin
  insert into public.solicitudes (id, tipo, disciplina_id, matricula, nombre)
  values (gen_random_uuid(), 'alta', '00000000-0000-0000-0000-0000000000d1', 'AL00000108', 'Con id');
  raise exception 'Prueba 6b falló: el entrenador eligió el id';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.solicitudes (tipo, disciplina_id, matricula, nombre, estado)
  values ('alta', '00000000-0000-0000-0000-0000000000d1', 'AL00000109', 'Autoaprobada', 'aprobada');
  raise exception 'Prueba 6b falló: el entrenador creó una solicitud ya aprobada';
exception when insufficient_privilege then null;
end $$;

-- 7. Solo ve solicitudes de sus disciplinas
do $$ begin
  assert (select count(*) from public.solicitudes) = 2, 'Prueba 7 falló: ve solicitudes ajenas o no ve las suyas';
end $$;
reset role;

-- 7b. Asignar los id conocidos que usan las pruebas siguientes (como postgres)
update public.solicitudes set id = '00000000-0000-0000-0000-0000000005a1'
where matricula = 'AL00000103' and disciplina_id = '00000000-0000-0000-0000-0000000000d1';
update public.solicitudes set id = '00000000-0000-0000-0000-0000000005b1'
where inscripcion_id = '00000000-0000-0000-0000-0000000000f1';

-- 8. El otro entrenador no ve las solicitudes de fútbol ------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.solicitudes) = 0, 'Prueba 8 falló: ve solicitudes de otra disciplina';
end $$;
reset role;

-- Coordinador ----------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

-- 9. Aprueba el alta: crea alumno e inscripción
select public.aprobar_solicitud('00000000-0000-0000-0000-0000000005a1');
do $$ begin
  assert exists (
    select 1 from public.inscripciones i join public.alumnos a on a.id = i.alumno_id
    where a.matricula = 'AL00000103' and i.disciplina_id = '00000000-0000-0000-0000-0000000000d1'
      and i.fecha_baja is null
  ), 'Prueba 9 falló: el alta aprobada no inscribió al alumno';
  assert (select estado from public.solicitudes where id = '00000000-0000-0000-0000-0000000005a1') = 'aprobada',
    'Prueba 9 falló: la solicitud no quedó aprobada';
end $$;

-- 10. No se aprueba dos veces
do $$ begin
  perform public.aprobar_solicitud('00000000-0000-0000-0000-0000000005a1');
  raise exception 'Prueba 10 falló: se aprobó dos veces';
exception when invalid_parameter_value then null;
end $$;

-- 11. Rechazo exige motivo y queda registrado
do $$ begin
  perform public.rechazar_solicitud('00000000-0000-0000-0000-0000000005b1', '');
  raise exception 'Prueba 11 falló: se rechazó sin motivo';
exception when check_violation then null;
end $$;
select public.rechazar_solicitud('00000000-0000-0000-0000-0000000005b1', 'Sigue asistiendo');
do $$ begin
  assert (select fecha_baja from public.inscripciones where id = '00000000-0000-0000-0000-0000000000f1') is null,
    'Prueba 11 falló: una baja rechazada dio de baja al alumno';
end $$;

-- 12. Importación: crea, conserva el nombre existente y no duplica inscripciones
do $$ declare r jsonb; begin
  r := public.importar_alumnos('00000000-0000-0000-0000-0000000000d1', '[
    {"matricula":"AL00000101","nombre":"Nombre distinto","actualizar_nombre":false},
    {"matricula":"AL00000102","nombre":"Alumno Dos","genero":"masculino"},
    {"matricula":"AL00000105","nombre":"Alumno Cinco","genero":"no_binario"}
  ]'::jsonb);
  assert (r ->> 'creados')::int = 1, 'Prueba 12 falló: creados ' || r::text;
  assert (r ->> 'inscritos')::int = 2, 'Prueba 12 falló: inscritos ' || r::text;
  assert (r ->> 'ya_inscritos')::int = 1, 'Prueba 12 falló: ya_inscritos ' || r::text;
  assert (select nombre from public.alumnos where matricula = 'AL00000101') = 'Alumno Uno',
    'Prueba 12 falló: se sobrescribió un nombre sin autorización';
  assert (select genero from public.alumnos where matricula = 'AL00000102') = 'masculino',
    'Prueba 12 falló: no se completó un género vacío';
end $$;

-- 13. La importación es todo o nada
do $$ begin
  perform public.importar_alumnos('00000000-0000-0000-0000-0000000000d1', '[
    {"matricula":"AL00000106","nombre":"Válido"},
    {"matricula":"07210101","nombre":"Inválido"}
  ]'::jsonb);
  raise exception 'Prueba 13 falló: se aceptó una matrícula inválida';
exception when check_violation then null;
end $$;
do $$ begin
  assert not exists (select 1 from public.alumnos where matricula = 'AL00000106'),
    'Prueba 13 falló: la importación fallida dejó datos a medias';
end $$;

-- 14. No se importa a disciplinas de acceso libre
do $$ begin
  perform public.importar_alumnos('00000000-0000-0000-0000-0000000000d3',
    '[{"matricula":"AL00000107","nombre":"Gym"}]'::jsonb);
  raise exception 'Prueba 14 falló: se importó una lista al gimnasio';
exception when invalid_parameter_value then null;
end $$;

-- 15. Nadie borra solicitudes
do $$ begin
  delete from public.solicitudes;
  raise exception 'Prueba 15 falló: se borraron solicitudes';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 16. Anónimo no ejecuta las funciones ---------------------------------------
set local role anon;
do $$ begin
  perform public.importar_alumnos('00000000-0000-0000-0000-0000000000d1', '[]'::jsonb);
  raise exception 'Prueba 16 falló: anon ejecutó importar_alumnos';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F2b RLS: todas las pruebas pasaron' as resultado;

rollback;

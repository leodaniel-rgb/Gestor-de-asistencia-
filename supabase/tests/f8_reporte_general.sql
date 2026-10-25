-- =============================================================================
-- Pruebas · F8 (notas de coordinación, exclusión de reportes, género en gimnasio)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Requiere aplicadas: F1–F7, fix_historial_turnos y F8.
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'F8 reporte general: todas las pruebas pasaron'.
-- =============================================================================
begin;

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

-- a3 no tiene género: es el "profesor" que se excluirá.
insert into public.alumnos (id, matricula, nombre, genero) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000801', 'Alumna Uno', 'femenino'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000802', 'Alumno Dos', 'masculino'),
  ('00000000-0000-0000-0000-0000000000a3', 'AL00000803', 'Profesor Tres', null);
insert into public.inscripciones (alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d1');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Datos: una sesión con los tres y un turno de gimnasio con los tres ----------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select set_config('prueba.s1', public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '16:00',
  '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"falta"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a3","estado":"asistio"}]'::jsonb)::text, true);

-- 1. El entrenador no escribe notas ni las lee
do $$ begin
  perform public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', 'Es un profesor, no contar', true);
  raise exception 'Prueba 1 falló: el entrenador escribió una nota';
exception when insufficient_privilege then null;
end $$;
reset role;

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select set_config('prueba.t', public.abrir_turno('00000000-0000-0000-0000-0000000000d2', 'manana')::text, true);
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000801', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000802', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000803', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000801', 'salida');
select public.cerrar_turno(current_setting('prueba.t')::uuid);
reset role;

-- Coordinador ----------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

-- 2. Línea base: todos cuentan; el gimnasio da alumnos distintos por género
do $$ declare l jsonb; g jsonb; begin
  l := public.reporte_listas(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d1']::uuid[]);
  g := public.reporte_gimnasio(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d2']::uuid[]);
  assert (l -> 'sesiones' -> 0 -> 'asistio' ->> 'sa')::int = 1 and (l ->> 'excluidos')::int = 0,
    'Prueba 2 falló (listas): ' || l::text;
  assert (g ->> 'alumnos_distintos')::int = 3 and (g ->> 'sin_salida')::int = 2 and (g ->> 'excluidos')::int = 0,
    'Prueba 2 falló (gimnasio): ' || g::text;
  assert g -> 'por_genero' = '{"f": 1, "m": 1, "nb": 0, "sa": 1}'::jsonb,
    'Prueba 2 falló (género): ' || (g -> 'por_genero')::text;
  perform set_config('prueba.l0', (l -> 'sesiones')::text, true);
  perform set_config('prueba.g0', jsonb_build_object(
    'alumnos_distintos', g -> 'alumnos_distintos', 'sin_salida', g -> 'sin_salida',
    'por_genero', g -> 'por_genero', 'entradas', jsonb_array_length(g -> 'entradas'))::text, true);
end $$;

-- 3. Excluir exige nota; la nota tiene máximo 300 caracteres
do $$ begin
  perform public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', '', true);
  raise exception 'Prueba 3 falló: se excluyó sin nota';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  perform public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', repeat('x', 301), false);
  raise exception 'Prueba 3 falló: se aceptó una nota de 301 caracteres';
exception when invalid_parameter_value then null;
end $$;

-- 4. Nota sin excluir no cambia los reportes; luego se excluye
select public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a2', 'Llega tarde por transporte', false);
select public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', '  Es un   profesor, no contar ', true);
do $$ begin
  assert (select nota from public.alumnos_coordinacion where alumno_id = '00000000-0000-0000-0000-0000000000a3')
    = 'Es un profesor, no contar', 'Prueba 4 falló: la nota no se normalizó';
end $$;

-- 5. Listas: el excluido no cuenta y se informa
do $$ declare l jsonb; begin
  l := public.reporte_listas(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d1']::uuid[]);
  assert (l -> 'sesiones' -> 0 -> 'asistio' ->> 'sa')::int = 0
     and (l -> 'sesiones' -> 0 -> 'asistio' ->> 'f')::int = 1
     and (l -> 'sesiones' -> 0 -> 'falta' ->> 'm')::int = 1,
    'Prueba 5 falló: ' || l::text;
  assert (l ->> 'excluidos')::int = 1, 'Prueba 5 falló: excluidos ' || l::text;
end $$;

-- 6. Gimnasio: el excluido no cuenta en entradas, sin salida, género ni top
do $$ declare g jsonb; begin
  g := public.reporte_gimnasio(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d2']::uuid[]);
  assert jsonb_array_length(g -> 'entradas') = 2 and (g ->> 'alumnos_distintos')::int = 2
     and (g ->> 'sin_salida')::int = 1 and (g ->> 'excluidos')::int = 1,
    'Prueba 6 falló: ' || g::text;
  assert g -> 'por_genero' = '{"f": 1, "m": 1, "nb": 0, "sa": 0}'::jsonb, 'Prueba 6 falló (género): ' || g::text;
  assert not exists (select 1 from jsonb_array_elements(g -> 'top') x where x ->> 'matricula' = 'AL00000803'),
    'Prueba 6 falló: el excluido aparece en el top';
  assert (select sum((x ->> 'entradas')::int) from jsonb_array_elements(g -> 'turnos') x) = 2,
    'Prueba 6 falló: las entradas por turno cuentan al excluido';
end $$;

-- 7. El detalle del Excel no lo incluye; el respaldo sí (con su nota)
do $$ declare d jsonb; r jsonb; begin
  d := public.reporte_asistencias_detalle(privado.hoy_mx() - 7, privado.hoy_mx());
  assert not exists (select 1 from jsonb_array_elements(d) x where x ->> 'matricula' = 'AL00000803'),
    'Prueba 7 falló: el detalle incluye al excluido';
  r := public.respaldo_completo();
  assert exists (select 1 from jsonb_array_elements(r -> 'notas_alumnos') x
                 where x ->> 'matricula' = 'AL00000803' and (x ->> 'excluido_reportes')::boolean),
    'Prueba 7 falló: el respaldo no trae la nota';
  assert exists (select 1 from jsonb_array_elements(r -> 'gimnasio') x where x ->> 'matricula' = 'AL00000803'),
    'Prueba 7 falló: el respaldo excluyó registros';
end $$;

-- 8. Volver a contarlo exige motivo
do $$ begin
  perform public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', 'Es un profesor, no contar', false);
  raise exception 'Prueba 8 falló: se volvió a contar sin motivo';
exception when invalid_parameter_value then null;
end $$;
select public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', 'Es un profesor, no contar', false,
  'Era alumno de posgrado, sí cuenta');

-- 9. Tras restaurar, los reportes son idénticos a la línea base
do $$ declare l jsonb; g jsonb; begin
  l := public.reporte_listas(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d1']::uuid[]);
  g := public.reporte_gimnasio(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d2']::uuid[]);
  assert l -> 'sesiones' = current_setting('prueba.l0')::jsonb, 'Prueba 9 falló (listas): ' || l::text;
  assert jsonb_build_object(
    'alumnos_distintos', g -> 'alumnos_distintos', 'sin_salida', g -> 'sin_salida',
    'por_genero', g -> 'por_genero', 'entradas', jsonb_array_length(g -> 'entradas'))
    = current_setting('prueba.g0')::jsonb, 'Prueba 9 falló (gimnasio): ' || g::text;
end $$;

-- 10. Historial del alumno: los cambios de la nota, con su motivo
do $$ begin
  assert (select count(*) from public.admin_historial('alumnos', '00000000-0000-0000-0000-0000000000a3')
          where entidad = 'alumnos_coordinacion') = 2,
    'Prueba 10 falló: el historial no muestra los cambios de la nota';
  assert exists (select 1 from public.admin_historial('alumnos', '00000000-0000-0000-0000-0000000000a3')
                 where motivo = 'Era alumno de posgrado, sí cuenta'),
    'Prueba 10 falló: falta el motivo';
end $$;
reset role;

-- 11. El entrenador no ve las notas (pero sí a sus alumnos)
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.alumnos_coordinacion) = 0, 'Prueba 11 falló: el entrenador ve notas';
  assert (select count(*) from public.alumnos where id = '00000000-0000-0000-0000-0000000000a3') = 1,
    'Prueba 11 falló: el entrenador dejó de ver a su alumno';
end $$;
do $$ begin
  insert into public.alumnos_coordinacion (alumno_id, nota) values ('00000000-0000-0000-0000-0000000000a1', 'x');
  raise exception 'Prueba 11 falló: el entrenador insertó una nota';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 12. Anónimo no lee ni escribe notas
set local role anon;
do $$ begin
  perform 1 from public.alumnos_coordinacion;
  raise exception 'Prueba 12 falló: anon leyó notas';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.admin_nota_alumno('00000000-0000-0000-0000-0000000000a3', 'Es un profesor', true);
  raise exception 'Prueba 12 falló: anon ejecutó admin_nota_alumno';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F8 reporte general: todas las pruebas pasaron' as resultado;

rollback;

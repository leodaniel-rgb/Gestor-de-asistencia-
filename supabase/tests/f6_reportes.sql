-- =============================================================================
-- Pruebas · F6 (funciones de reporte)
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'F6 reportes: todas las pruebas pasaron'.
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

insert into public.alumnos (id, matricula, nombre, genero) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000601', 'Alumna Uno', 'femenino'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000602', 'Alumno Dos', 'masculino'),
  ('00000000-0000-0000-0000-0000000000a3', 'AL00000603', 'Alumne Tres', 'no_binario');
insert into public.inscripciones (alumno_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000d1');
insert into public.solicitudes (id, tipo, disciplina_id, matricula, nombre, solicitado_por) values
  ('00000000-0000-0000-0000-0000000005a1', 'alta', '00000000-0000-0000-0000-0000000000d1',
   'AL00000604', 'Pendiente', '00000000-0000-0000-0000-0000000000e1');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Datos: dos sesiones (una se anulará) y un turno de gimnasio ------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select set_config('prueba.s1', public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '16:00',
  '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a3","estado":"falta"},
    {"solicitud_id":"00000000-0000-0000-0000-0000000005a1","estado":"asistio"}]'::jsonb)::text, true);
select set_config('prueba.s2', public.registrar_sesion('00000000-0000-0000-0000-0000000000d1', privado.hoy_mx(), '18:00',
  '[{"alumno_id":"00000000-0000-0000-0000-0000000000a1","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a2","estado":"asistio"},
    {"alumno_id":"00000000-0000-0000-0000-0000000000a3","estado":"asistio"},
    {"solicitud_id":"00000000-0000-0000-0000-0000000005a1","estado":"asistio"}]'::jsonb)::text, true);

-- 1. El entrenador no ve reportes
do $$ begin
  perform public.reporte_listas(privado.hoy_mx() - 7, privado.hoy_mx());
  raise exception 'Prueba 1 falló: el entrenador vio un reporte';
exception when insufficient_privilege then null;
end $$;
reset role;

select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
select set_config('prueba.t', public.abrir_turno('00000000-0000-0000-0000-0000000000d2', 'manana')::text, true);
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000601', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000602', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t')::uuid, 'AL00000601', 'salida');
select public.cerrar_turno(current_setting('prueba.t')::uuid);
reset role;

-- Coordinador ----------------------------------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.admin_anular_sesion(current_setting('prueba.s2')::uuid, true, 'Sesión duplicada de prueba');

-- 2. Cuenta asistencias por género, excluye la sesión anulada y los pendientes
do $$ declare r jsonb; s jsonb; begin
  r := public.reporte_listas(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d1']::uuid[]);
  assert jsonb_array_length(r -> 'sesiones') = 1, 'Prueba 2 falló: no excluyó la sesión anulada ' || r::text;
  s := r -> 'sesiones' -> 0;
  assert (s -> 'asistio' ->> 'f')::int = 1 and (s -> 'asistio' ->> 'm')::int = 1 and (s -> 'asistio' ->> 'nb')::int = 0,
    'Prueba 2 falló: asistencias por género ' || s::text;
  assert (s -> 'falta' ->> 'nb')::int = 1, 'Prueba 2 falló: faltas ' || s::text;
  assert (r ->> 'pendientes')::int = 1, 'Prueba 2 falló: pendientes ' || r::text;
end $$;

-- 3. Filtro por día de la semana
do $$ declare r jsonb; begin
  r := public.reporte_listas(privado.hoy_mx() - 7, privado.hoy_mx(), null,
    array[(extract(isodow from privado.hoy_mx())::int % 7) + 1]::smallint[]);
  assert not exists (
    select 1 from jsonb_array_elements(r -> 'sesiones') x where x ->> 'id' = current_setting('prueba.s1')
  ), 'Prueba 3 falló: el filtro por día no excluyó la sesión de hoy';
end $$;

-- 4. Rango máximo de 3 meses
do $$ begin
  perform public.reporte_listas(privado.hoy_mx() - 120, privado.hoy_mx());
  raise exception 'Prueba 4 falló: se aceptó un rango de 4 meses';
exception when invalid_parameter_value then null;
end $$;

-- 5. Gimnasio: entradas, alumnos distintos, sin salida, top y tiempo promedio
do $$ declare r jsonb; begin
  r := public.reporte_gimnasio(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d2']::uuid[]);
  assert jsonb_array_length(r -> 'entradas') = 2, 'Prueba 5 falló: entradas ' || r::text;
  assert (r ->> 'alumnos_distintos')::int = 2, 'Prueba 5 falló: alumnos distintos';
  assert (r ->> 'sin_salida')::int = 1, 'Prueba 5 falló: sin salida';
  assert jsonb_array_length(r -> 'top') = 2, 'Prueba 5 falló: top';
  assert (r ->> 'promedio_minutos') is not null, 'Prueba 5 falló: promedio';
  assert not ((r -> 'entradas' -> 0) ? 'alumno_id'), 'Prueba 5 falló: las entradas exponen identidad';
end $$;

-- 6. Un registro anulado deja de contar
select public.admin_anular_registro_gimnasio(
  (select id from public.registros_gimnasio where turno_id = current_setting('prueba.t')::uuid and salida is null),
  true, 'Registro de prueba');
do $$ declare r jsonb; begin
  r := public.reporte_gimnasio(privado.hoy_mx() - 7, privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d2']::uuid[]);
  assert jsonb_array_length(r -> 'entradas') = 1 and (r ->> 'sin_salida')::int = 0,
    'Prueba 6 falló: el registro anulado sigue contando ' || r::text;
end $$;
reset role;

-- 7. Anónimo no ejecuta reportes ---------------------------------------------
set local role anon;
do $$ begin
  perform public.reporte_gimnasio(current_date - 7, current_date);
  raise exception 'Prueba 7 falló: anon ejecutó un reporte';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F6 reportes: todas las pruebas pasaron' as resultado;

rollback;

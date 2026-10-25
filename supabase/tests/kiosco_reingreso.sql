-- =============================================================================
-- Pruebas · Kiosco: salida pendiente de un turno anterior
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Requiere aplicadas: F1–F8 y 20261030000100_kiosco_salida_turno_anterior.
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'Kiosco reingreso: todas las pruebas pasaron'.
-- =============================================================================
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'gym@rls-fixture.invalid');

update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'gym@rls-fixture.invalid', 'Gym', 'entrenador', false);

insert into public.disciplinas (id, nombre, tipo) values
  ('00000000-0000-0000-0000-0000000000d1', 'Gimnasio (rls)', 'acceso_libre');
insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1');

insert into public.alumnos (id, matricula, nombre) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000901', 'Alumna Dos Horas'),
  ('00000000-0000-0000-0000-0000000000a2', 'AL00000902', 'Alumno Tres Horas'),
  ('00000000-0000-0000-0000-0000000000a3', 'AL00000903', 'Alumne Pasado Tiempo'),
  ('00000000-0000-0000-0000-0000000000a4', 'AL00000904', 'Alumna Regresa Entrar'),
  ('00000000-0000-0000-0000-0000000000a5', 'AL00000905', 'Alumno Ayer Mismo');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Turno de la mañana con cuatro entradas sin salida ----------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select set_config('prueba.t1', public.abrir_turno('00000000-0000-0000-0000-0000000000d1', 'manana')::text, true);
select public.kiosco_registrar(current_setting('prueba.t1')::uuid, 'AL00000901', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t1')::uuid, 'AL00000902', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t1')::uuid, 'AL00000903', 'entrada');
select public.kiosco_registrar(current_setting('prueba.t1')::uuid, 'AL00000904', 'entrada');
reset role;

-- Se ajustan las horas de entrada (now() es fijo dentro de la transacción).
update public.registros_gimnasio r set entrada = now() - case r.alumno_id
    when '00000000-0000-0000-0000-0000000000a1' then interval '2 hours'
    when '00000000-0000-0000-0000-0000000000a2' then interval '3 hours'
    when '00000000-0000-0000-0000-0000000000a3' then interval '3 hours 1 minute'
    else interval '1 hour' end
where r.turno_id = current_setting('prueba.t1')::uuid;

-- Turno de ayer con una entrada sin salida de hace 1 hora (otro día)
insert into public.turnos_gimnasio (id, disciplina_id, fecha, nombre, abierto_por, abierto_en, cerrado_en)
values ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000d1', privado.hoy_mx() - 1, 'tarde',
        '00000000-0000-0000-0000-0000000000e1', now() - interval '2 hours', now() - interval '30 minutes');
insert into public.registros_gimnasio (turno_id, alumno_id, entrada)
values ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000a5', now() - interval '1 hour');

-- Turno de la tarde: la mañana se cierra sola ---------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select set_config('prueba.t2', public.abrir_turno('00000000-0000-0000-0000-0000000000d1', 'tarde')::text, true);

-- 1. Entrada de hace 2 h y de 3 h exactas: recuerda la salida; > 3 h u otro día: entrada normal
do $$ begin
  assert public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000901') ->> 'accion' = 'salida_anterior',
    'Prueba 1 falló: no recordó la salida de hace 2 h';
  assert public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000902') ->> 'accion' = 'salida_anterior',
    'Prueba 1 falló: no recordó la salida de hace 3 h exactas';
  assert public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000903') ->> 'accion' = 'entrada',
    'Prueba 1 falló: recordó una salida de más de 3 h';
  assert public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000905') ->> 'accion' = 'entrada',
    'Prueba 1 falló: recordó una salida de otro día';
end $$;

-- 2. "Sí, registrar salida": cierra la entrada de la mañana con la hora real
do $$ declare r jsonb; begin
  r := public.kiosco_registrar(current_setting('prueba.t2')::uuid, 'AL00000901', 'salida_anterior');
  assert r ->> 'accion' = 'salida', 'Prueba 2 falló: respuesta ' || r::text;
end $$;
reset role;
do $$ begin
  assert (select salida = now() and not salida_corregida from public.registros_gimnasio
          where turno_id = current_setting('prueba.t1')::uuid
            and alumno_id = '00000000-0000-0000-0000-0000000000a1'),
    'Prueba 2 falló: la salida no quedó con la hora real o quedó como corregida';
  assert not exists (select 1 from public.registros_gimnasio
                     where turno_id = current_setting('prueba.t2')::uuid
                       and alumno_id = '00000000-0000-0000-0000-0000000000a1'),
    'Prueba 2 falló: se creó una entrada en la tarde';
end $$;

-- 3. "No, estoy entrando": entrada nueva; la de la mañana sigue sin salida
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select public.kiosco_registrar(current_setting('prueba.t2')::uuid, 'AL00000904', 'entrada');
do $$ begin
  -- 4. La entrada abierta del turno actual tiene prioridad
  assert public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000904') ->> 'accion' = 'salida',
    'Prueba 4 falló: no ofreció la salida del turno actual';
end $$;
reset role;
do $$ begin
  assert (select salida is null from public.registros_gimnasio
          where turno_id = current_setting('prueba.t1')::uuid
            and alumno_id = '00000000-0000-0000-0000-0000000000a4'),
    'Prueba 3 falló: la entrada de la mañana se modificó';
end $$;

-- 5. Fuera de la regla no se puede forzar la salida anterior
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  perform public.kiosco_registrar(current_setting('prueba.t2')::uuid, 'AL00000903', 'salida_anterior');
  raise exception 'Prueba 5 falló: se registró una salida de más de 3 h';
exception when invalid_parameter_value then null;
end $$;
-- Ni dos veces la misma salida
do $$ begin
  perform public.kiosco_registrar(current_setting('prueba.t2')::uuid, 'AL00000901', 'salida_anterior');
  raise exception 'Prueba 5 falló: se registró dos veces la misma salida';
exception when invalid_parameter_value then null;
end $$;
reset role;

-- 6. Un registro anulado no se recuerda
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.admin_anular_registro_gimnasio(
  (select id from public.registros_gimnasio
   where turno_id = current_setting('prueba.t1')::uuid and alumno_id = '00000000-0000-0000-0000-0000000000a2'),
  true, 'Registro duplicado de prueba');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  assert public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000902') ->> 'accion' = 'entrada',
    'Prueba 6 falló: recordó una entrada anulada';
end $$;
reset role;

-- 7. El tiempo promedio incluye la salida registrada desde la tarde (120 min)
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.reporte_gimnasio(privado.hoy_mx(), privado.hoy_mx(), array['00000000-0000-0000-0000-0000000000d1']::uuid[]);
  assert (r ->> 'promedio_minutos')::numeric = 120, 'Prueba 7 falló: ' || r::text;
end $$;
reset role;

-- 8. Anónimo no ejecuta el kiosco
set local role anon;
do $$ begin
  perform public.kiosco_buscar(current_setting('prueba.t2')::uuid, 'AL00000901');
  raise exception 'Prueba 8 falló: anon ejecutó kiosco_buscar';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'Kiosco reingreso: todas las pruebas pasaron' as resultado;

rollback;

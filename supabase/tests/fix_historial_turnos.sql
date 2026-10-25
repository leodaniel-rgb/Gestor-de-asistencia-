-- =============================================================================
-- Pruebas · Fix del historial de turnos de gimnasio
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Termina en ROLLBACK: no deja datos. No crea tablas.
-- Resultado esperado: 'Fix historial de turnos: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid'),
  ('00000000-0000-0000-0000-0000000000e1', 'gym1@rls-fixture.invalid');

update public.perfiles set rol = 'entrenador' where rol = 'coordinador';
insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@rls-fixture.invalid', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'gym1@rls-fixture.invalid', 'Gym Mañana', 'entrenador', false);

insert into public.disciplinas (id, nombre, tipo) values
  ('00000000-0000-0000-0000-0000000000d1', 'Gimnasio (rls)', 'acceso_libre');
insert into public.entrenador_disciplina (entrenador_id, disciplina_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1');

insert into public.alumnos (id, matricula, nombre) values
  ('00000000-0000-0000-0000-0000000000a1', 'AL00000301', 'Daniel Eduardo Torres Rivera');

create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Entrenador: abre turno, busca varias veces y registra entrada y salida -------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;

select set_config('prueba.turno', public.abrir_turno('00000000-0000-0000-0000-0000000000d1', 'manana')::text, true);

do $$ begin
  perform public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000301');
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000301', 'entrada');
  perform public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000301');
  perform public.kiosco_registrar(current_setting('prueba.turno')::uuid, 'AL00000301', 'salida');
  perform public.kiosco_buscar(current_setting('prueba.turno')::uuid, 'AL00000399');
end $$;

reset role;

-- 1. Las búsquedas no escriben en la bitácora del turno (solo el alta)
do $$ begin
  assert (select count(*) from public.bitacora
          where entidad = 'turnos_gimnasio' and entidad_id = current_setting('prueba.turno')) = 1,
    'Prueba 1 falló: las búsquedas del kiosco siguen registrando cambios del turno';
  assert (select busquedas_en_ventana from public.turnos_gimnasio
          where id = current_setting('prueba.turno')::uuid) = 3,
    'Prueba 1 falló: el límite de búsquedas dejó de contar';
end $$;

-- 2. Las entradas y salidas sí quedan en la bitácora
do $$ begin
  assert (select count(*) from public.bitacora
          where entidad = 'registros_gimnasio'
            and coalesce(despues ->> 'turno_id', antes ->> 'turno_id') = current_setting('prueba.turno')) = 2,
    'Prueba 2 falló: no se registraron la entrada y la salida';
end $$;

-- 3. Cerrar el turno sí se registra, con el entrenador como actor
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select public.cerrar_turno(current_setting('prueba.turno')::uuid);
reset role;

do $$ begin
  assert (select count(*) from public.bitacora
          where entidad = 'turnos_gimnasio' and entidad_id = current_setting('prueba.turno')
            and accion = 'update' and despues ->> 'cerrado_en' is not null
            and actor = '00000000-0000-0000-0000-0000000000e1') = 1,
    'Prueba 3 falló: el cierre del turno no quedó en la bitácora';
end $$;

-- 4. Entrada vieja que solo cambió el contador (como las anteriores al fix)
insert into public.bitacora (actor, accion, entidad, entidad_id, antes, despues)
select '00000000-0000-0000-0000-0000000000e1', 'update', 'turnos_gimnasio', t.id::text,
       to_jsonb(t) || '{"busquedas_en_ventana": 1}', to_jsonb(t) || '{"busquedas_en_ventana": 2}'
from public.turnos_gimnasio t
where t.id = current_setting('prueba.turno')::uuid;

-- Coordinación: el historial oculta esa entrada y muestra el resto
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

do $$ begin
  assert (select count(*) from public.admin_historial('turnos_gimnasio', current_setting('prueba.turno')::uuid)
          where entidad = 'turnos_gimnasio') = 2,
    'Prueba 4 falló: el historial no muestra solo el alta y el cierre del turno';
  assert (select count(*) from public.admin_historial('turnos_gimnasio', current_setting('prueba.turno')::uuid)
          where entidad = 'registros_gimnasio') = 2,
    'Prueba 4 falló: el historial perdió la entrada o la salida';
end $$;

-- 5. La entrada oculta no se borró
reset role;
do $$ begin
  assert (select count(*) from public.bitacora
          where entidad = 'turnos_gimnasio' and entidad_id = current_setting('prueba.turno')) = 3,
    'Prueba 5 falló: la entrada vieja se borró en lugar de ocultarse';
end $$;

-- 6. El entrenador no ve el historial
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.admin_historial('turnos_gimnasio', current_setting('prueba.turno')::uuid)) = 0,
    'Prueba 6 falló: un entrenador ve el historial';
end $$;
reset role;

select 'Fix historial de turnos: todas las pruebas pasaron' as resultado;

rollback;

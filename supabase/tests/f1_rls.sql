-- =============================================================================
-- Pruebas de RLS · F1
-- Ejecutar completo en el SQL Editor de vive-dev (NUNCA en vive-prod).
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Si alguna regla falla, el editor muestra el error con el número de prueba.
-- Si todo pasa, la última consulta devuelve 'F1 RLS: todas las pruebas pasaron'.
-- =============================================================================
begin;

-- Fixtures (como postgres, sin RLS) -------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@prueba.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'entrenador1@prueba.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'entrenador2@prueba.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'nuevo@prueba.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'otro@prueba.test');

insert into public.perfiles (id, correo, nombre, rol, debe_cambiar_password) values
  ('00000000-0000-0000-0000-0000000000c1', 'coord@prueba.test', 'Coordinación', 'coordinador', false),
  ('00000000-0000-0000-0000-0000000000e1', 'entrenador1@prueba.test', 'Entrenador Uno', 'entrenador', false),
  ('00000000-0000-0000-0000-0000000000e2', 'entrenador2@prueba.test', 'Entrenador Dos', 'entrenador', true);

-- Helper: actuar como un usuario autenticado
create function pg_temp.como(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- 1. Anónimo no ve perfiles ---------------------------------------------------
set local role anon;
do $$ begin
  perform 1 from public.perfiles;
  raise exception 'Prueba 1 falló: anon pudo leer perfiles';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 2. Entrenador ve solo su propio perfil --------------------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.perfiles) = 1, 'Prueba 2 falló: entrenador ve otros perfiles';
end $$;

-- 3. Entrenador no ve la bitácora ---------------------------------------------
do $$ begin
  assert (select count(*) from public.bitacora) = 0, 'Prueba 3 falló: entrenador ve la bitácora';
end $$;

-- 4. Entrenador no puede crear perfiles ---------------------------------------
do $$ begin
  insert into public.perfiles (id, correo, nombre, creado_por)
  values ('00000000-0000-0000-0000-0000000000e3', 'nuevo@prueba.test', 'Nuevo', '00000000-0000-0000-0000-0000000000e1');
  raise exception 'Prueba 4 falló: entrenador creó un perfil';
exception when insufficient_privilege then null;
end $$;

-- 5. Entrenador no puede reactivarse ni quitarse el cambio pendiente ----------
do $$ declare n int; begin
  update public.perfiles set nombre = 'Hackeado' where id = '00000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  assert n = 0, 'Prueba 5 falló: entrenador editó su perfil';
end $$;
reset role;

-- 6. Con cambio de contraseña pendiente no está habilitado --------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e2');
set local role authenticated;
do $$ begin
  assert not (select privado.usuario_habilitado()), 'Prueba 6 falló: usuario con cambio pendiente aparece habilitado';
end $$;
reset role;

-- 7. Coordinador ve todos los perfiles y la bitácora --------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
do $$ begin
  assert (select count(*) from public.perfiles) = 3, 'Prueba 7 falló: coordinador no ve todos los perfiles';
  assert (select count(*) from public.bitacora) >= 3, 'Prueba 7 falló: coordinador no ve la bitácora';
end $$;

-- 8. Coordinador crea un entrenador y queda en bitácora con su id -------------
insert into public.perfiles (id, correo, nombre, creado_por)
values ('00000000-0000-0000-0000-0000000000e3', 'nuevo@prueba.test', 'Nuevo', '00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert exists (
    select 1 from public.bitacora
    where entidad = 'perfiles' and entidad_id = '00000000-0000-0000-0000-0000000000e3'
      and accion = 'insert' and actor = '00000000-0000-0000-0000-0000000000c1'
  ), 'Prueba 8 falló: la creación no quedó en bitácora';
end $$;

-- 9. Coordinador no puede crear otro coordinador ------------------------------
do $$ begin
  insert into public.perfiles (id, correo, nombre, rol, creado_por)
  values ('00000000-0000-0000-0000-0000000000e4', 'otro@prueba.test', 'Otro', 'coordinador', '00000000-0000-0000-0000-0000000000c1');
  raise exception 'Prueba 9 falló: se creó un segundo coordinador';
exception when insufficient_privilege or unique_violation then null;
end $$;

-- 10. Coordinador desactiva a un entrenador -----------------------------------
do $$ declare n int; begin
  update public.perfiles set activo = false where id = '00000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count;
  assert n = 1, 'Prueba 10 falló: el coordinador no pudo desactivar';
end $$;

-- 11. Coordinador no puede desactivarse a sí mismo ----------------------------
do $$ declare n int; begin
  update public.perfiles set activo = false where id = '00000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  assert n = 0, 'Prueba 11 falló: el coordinador se desactivó a sí mismo';
end $$;

-- 12. Nadie cambia el rol (permiso de columna) --------------------------------
do $$ begin
  update public.perfiles set rol = 'coordinador' where id = '00000000-0000-0000-0000-0000000000e3';
  raise exception 'Prueba 12 falló: se pudo cambiar el rol';
exception when insufficient_privilege then null;
end $$;

-- 13. Nadie borra perfiles ----------------------------------------------------
do $$ begin
  delete from public.perfiles where id = '00000000-0000-0000-0000-0000000000e3';
  raise exception 'Prueba 13 falló: se pudo borrar un perfil';
exception when insufficient_privilege then null;
end $$;

-- 14. Nadie escribe ni borra la bitácora --------------------------------------
do $$ begin
  delete from public.bitacora;
  raise exception 'Prueba 14 falló: se pudo borrar la bitácora';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.bitacora (accion, entidad) values ('falsa', 'x');
  raise exception 'Prueba 14 falló: se pudo escribir en la bitácora';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 15. Entrenador desactivado deja de estar habilitado -------------------------
select pg_temp.como('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
do $$ begin
  assert not (select privado.usuario_habilitado()), 'Prueba 15 falló: entrenador desactivado sigue habilitado';
end $$;
reset role;

-- 16. Las funciones privadas no son accesibles para anon ----------------------
set local role anon;
do $$ begin
  perform privado.es_coordinador();
  raise exception 'Prueba 16 falló: anon ejecutó una función privada';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'F1 RLS: todas las pruebas pasaron' as resultado;

rollback;

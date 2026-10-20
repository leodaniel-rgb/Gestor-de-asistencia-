-- =============================================================================
-- F1 · Corrección: permisos explícitos para la llave secreta (service_role)
--
-- Desde el 30/05/2026 los proyectos nuevos de Supabase ya no otorgan permisos
-- automáticos sobre tablas nuevas de `public` a anon, authenticated ni
-- service_role (changelog de Supabase #45329). La migración anterior otorgó
-- permisos a `authenticated`, pero no a `service_role`. Por eso el servidor no
-- podía marcar el cambio de contraseña como completado (error 42501).
--
-- Se otorga solo lo mínimo que usa el servidor con la llave secreta:
-- leer `id` (para el WHERE) y actualizar `debe_cambiar_password`.
-- =============================================================================

begin;

grant select (id) on public.perfiles to service_role;
grant update (debe_cambiar_password) on public.perfiles to service_role;

commit;

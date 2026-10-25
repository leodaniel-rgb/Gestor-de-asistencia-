-- =============================================================================
-- Fix · Historial del turno de gimnasio sin "cambios" falsos
-- Cada búsqueda del kiosco actualiza el contador del límite (ventana_busquedas,
-- busquedas_en_ventana) en turnos_gimnasio. El trigger de bitácora registraba
-- cada una como "Entrenador cambió · Turno", sin cambios visibles.
-- - El trigger de UPDATE ya no registra cambios que solo tocan el contador.
-- - admin_historial oculta las entradas de ese tipo ya registradas (no se borran).
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1–F7.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Triggers de bitácora de turnos_gimnasio
-- Se separan porque la condición WHEN de un trigger de INSERT no puede usar OLD
-- ni la de DELETE puede usar NEW.
-- -----------------------------------------------------------------------------
drop trigger turnos_gimnasio_bitacora on public.turnos_gimnasio;

create trigger turnos_gimnasio_bitacora
  after insert or delete on public.turnos_gimnasio
  for each row execute function privado.registrar_bitacora();

create trigger turnos_gimnasio_bitacora_update
  after update on public.turnos_gimnasio
  for each row
  when (
    (to_jsonb(old) - 'ventana_busquedas' - 'busquedas_en_ventana')
    is distinct from (to_jsonb(new) - 'ventana_busquedas' - 'busquedas_en_ventana')
  )
  execute function privado.registrar_bitacora();

-- -----------------------------------------------------------------------------
-- admin_historial: misma firma y lógica que en F5, sin las entradas que solo
-- cambiaron el contador de búsquedas.
-- -----------------------------------------------------------------------------
create or replace function public.admin_historial(p_entidad text, p_id uuid)
returns table (
  ocurrido_en timestamptz,
  actor_nombre text,
  accion text,
  entidad text,
  antes jsonb,
  despues jsonb,
  motivo text
)
language sql
stable
set search_path = ''
as $$
  select b.ocurrido_en, p.nombre, b.accion, b.entidad, b.antes, b.despues, b.motivo
  from public.bitacora b
  left join public.perfiles p on p.id = b.actor
  where privado.es_coordinador()
    and (
      (b.entidad = p_entidad and b.entidad_id = p_id::text)
      or (p_entidad = 'sesiones' and b.entidad in ('asistencias', 'incidencias')
          and coalesce(b.despues ->> 'sesion_id', b.antes ->> 'sesion_id') = p_id::text)
      or (p_entidad = 'turnos_gimnasio' and b.entidad = 'registros_gimnasio'
          and coalesce(b.despues ->> 'turno_id', b.antes ->> 'turno_id') = p_id::text)
    )
    and not (
      b.entidad = 'turnos_gimnasio' and b.accion = 'update'
      and (b.antes - 'ventana_busquedas' - 'busquedas_en_ventana')
          is not distinct from (b.despues - 'ventana_busquedas' - 'busquedas_en_ventana')
    )
  order by b.ocurrido_en desc, b.id desc
  limit 200;
$$;

revoke all on function public.admin_historial(text, uuid) from public, anon;
grant execute on function public.admin_historial(text, uuid) to authenticated;

commit;

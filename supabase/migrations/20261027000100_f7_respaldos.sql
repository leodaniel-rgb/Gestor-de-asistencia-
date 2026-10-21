-- =============================================================================
-- F7 · Exportación, respaldos y continuidad
-- - ping(): respuesta mínima para el cron diario (evita la pausa del plan Free).
-- - reporte_asistencias_detalle(): una fila por alumno y sesión (Excel).
-- - respaldo_completo(): todos los datos operativos (Excel de respaldo).
-- - registrar_exportacion() / ultimo_respaldo(): quién y cuándo exporta.
-- Aplicar en el SQL Editor: primero vive-dev (+ pruebas), luego vive-prod.
-- Requiere: F1–F6.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Ping para el cron: no lee ninguna tabla. Es lo único que puede ejecutar anon.
-- -----------------------------------------------------------------------------
create function public.ping()
returns text
language sql
immutable
set search_path = ''
as $$ select 'ok'::text $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Detalle por alumno (para el Excel del reporte). Mismas reglas que reporte_listas.
-- -----------------------------------------------------------------------------
create function public.reporte_asistencias_detalle(
  p_desde date,
  p_hasta date,
  p_disciplinas uuid[] default null,
  p_dias smallint[] default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación ve los reportes' using errcode = '42501';
  end if;
  perform privado.validar_rango_reporte(p_desde, p_hasta);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'fecha', s.fecha,
      'hora', to_char(s.hora_inicio, 'HH24:MI'),
      'disciplina', d.nombre,
      'matricula', al.matricula,
      'nombre', al.nombre,
      'genero', al.genero,
      'estado', a.estado
    ) order by s.fecha, s.hora_inicio, d.nombre, al.nombre)
    from public.sesiones s
    join public.disciplinas d on d.id = s.disciplina_id
    join public.asistencias a on a.sesion_id = s.id and a.alumno_id is not null
    join public.alumnos al on al.id = a.alumno_id
    where not s.anulada
      and s.fecha between p_desde and p_hasta
      and (p_disciplinas is null or s.disciplina_id = any (p_disciplinas))
      and (p_dias is null or extract(isodow from s.fecha)::smallint = any (p_dias))
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Respaldo completo (sin límite de fechas). Incluye anulados y pendientes, con
-- su estado, porque es un respaldo, no un reporte.
-- -----------------------------------------------------------------------------
create function public.respaldo_completo()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación descarga respaldos' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generado_en', now(),
    'disciplinas', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre', d.nombre, 'tipo', d.tipo, 'dias_clase', d.dias_clase, 'activa', d.activa, 'creado_en', d.creado_en
      ) order by d.nombre) from public.disciplinas d), '[]'::jsonb),
    'entrenadores', coalesce((select jsonb_agg(jsonb_build_object(
        'nombre', p.nombre, 'correo', p.correo, 'activo', p.activo,
        'disciplinas', (select string_agg(d.nombre, ', ' order by d.nombre)
                        from public.entrenador_disciplina ed join public.disciplinas d on d.id = ed.disciplina_id
                        where ed.entrenador_id = p.id)
      ) order by p.nombre) from public.perfiles p where p.rol = 'entrenador'), '[]'::jsonb),
    'alumnos', coalesce((select jsonb_agg(jsonb_build_object(
        'matricula', a.matricula, 'nombre', a.nombre, 'genero', a.genero, 'creado_en', a.creado_en
      ) order by a.nombre) from public.alumnos a), '[]'::jsonb),
    'inscripciones', coalesce((select jsonb_agg(jsonb_build_object(
        'matricula', a.matricula, 'nombre', a.nombre, 'disciplina', d.nombre,
        'fecha_alta', i.fecha_alta, 'fecha_baja', i.fecha_baja
      ) order by d.nombre, a.nombre)
      from public.inscripciones i
      join public.alumnos a on a.id = i.alumno_id
      join public.disciplinas d on d.id = i.disciplina_id), '[]'::jsonb),
    'asistencias', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', s.fecha, 'hora', to_char(s.hora_inicio, 'HH24:MI'), 'disciplina', d.nombre,
        'matricula', coalesce(al.matricula, so.matricula), 'nombre', coalesce(al.nombre, so.nombre),
        'estado', a.estado,
        'sesion_anulada', s.anulada,
        'pendiente_de_aprobacion', a.alumno_id is null,
        'registro_tardio', s.registro_tardio,
        'capturada_por_coordinacion', s.capturada_por_coordinacion,
        'registrada_por', p.nombre
      ) order by s.fecha, s.hora_inicio, d.nombre)
      from public.asistencias a
      join public.sesiones s on s.id = a.sesion_id
      join public.disciplinas d on d.id = s.disciplina_id
      left join public.alumnos al on al.id = a.alumno_id
      left join public.solicitudes so on so.id = a.solicitud_id
      left join public.perfiles p on p.id = s.entrenador_id), '[]'::jsonb),
    'incidencias', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', s.fecha, 'disciplina', d.nombre, 'categoria', o.nombre, 'descripcion', i.descripcion,
        'sesion_anulada', s.anulada
      ) order by s.fecha)
      from public.incidencias i
      join public.sesiones s on s.id = i.sesion_id
      join public.disciplinas d on d.id = s.disciplina_id
      join public.catalogo_opciones o on o.id = i.categoria_id), '[]'::jsonb),
    'dias_sin_clase', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', x.fecha, 'disciplina', d.nombre, 'motivo', o.nombre, 'anulado', x.anulado
      ) order by x.fecha)
      from public.dias_sin_clase x
      join public.disciplinas d on d.id = x.disciplina_id
      left join public.catalogo_opciones o on o.id = x.motivo_id), '[]'::jsonb),
    'gimnasio', coalesce((select jsonb_agg(jsonb_build_object(
        'fecha', t.fecha, 'turno', t.nombre, 'matricula', a.matricula, 'nombre', a.nombre,
        'entrada', r.entrada, 'salida', r.salida, 'salida_corregida', r.salida_corregida, 'anulado', r.anulado
      ) order by r.entrada)
      from public.registros_gimnasio r
      join public.turnos_gimnasio t on t.id = r.turno_id
      join public.alumnos a on a.id = r.alumno_id), '[]'::jsonb),
    'solicitudes', coalesce((select jsonb_agg(jsonb_build_object(
        'creado_en', s.creado_en, 'tipo', s.tipo, 'estado', s.estado, 'disciplina', d.nombre,
        'matricula', coalesce(s.matricula, al.matricula), 'nombre', coalesce(s.nombre, al.nombre),
        'motivo_rechazo', s.motivo_rechazo
      ) order by s.creado_en)
      from public.solicitudes s
      join public.disciplinas d on d.id = s.disciplina_id
      left join public.inscripciones i on i.id = s.inscripcion_id
      left join public.alumnos al on al.id = i.alumno_id), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro de exportaciones en la bitácora (quién y cuándo saca datos).
-- -----------------------------------------------------------------------------
create function public.registrar_exportacion(p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.es_coordinador() then
    raise exception 'Solo la coordinación exporta datos' using errcode = '42501';
  end if;
  if p_tipo not in ('respaldo', 'reporte_listas', 'reporte_gimnasio') then
    raise exception 'Tipo de exportación no válido' using errcode = '22023';
  end if;
  insert into public.bitacora (actor, accion, entidad, entidad_id, despues)
  values ((select auth.uid()), 'exportar', p_tipo, null, jsonb_build_object('tipo', p_tipo));
end;
$$;

create function public.ultimo_respaldo()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(b.ocurrido_en) from public.bitacora b
  where privado.es_coordinador() and b.accion = 'exportar' and b.entidad = 'respaldo';
$$;

revoke all on function public.reporte_asistencias_detalle(date, date, uuid[], smallint[]) from public, anon;
revoke all on function public.respaldo_completo() from public, anon;
revoke all on function public.registrar_exportacion(text) from public, anon;
revoke all on function public.ultimo_respaldo() from public, anon;
grant execute on function public.reporte_asistencias_detalle(date, date, uuid[], smallint[]) to authenticated;
grant execute on function public.respaldo_completo() to authenticated;
grant execute on function public.registrar_exportacion(text) to authenticated;
grant execute on function public.ultimo_respaldo() to authenticated;

commit;

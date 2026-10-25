// Nota de coordinación de un alumno (tabla alumnos_coordinacion, solo coordinación).

type FilaNota = { nota: string | null; excluido_reportes: boolean };

/** PostgREST devuelve la relación 1 a 1 como objeto; se acepta también arreglo o nulo. */
export function leerNota(v: FilaNota | FilaNota[] | null | undefined): { nota: string | null; excluido: boolean } {
  const x = Array.isArray(v) ? v[0] : v;
  return { nota: x?.nota ?? null, excluido: x?.excluido_reportes ?? false };
}

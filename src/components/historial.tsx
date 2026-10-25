import "server-only";
import { formatearMomento } from "@/lib/catalogos";
import { crearClienteServidor } from "@/lib/supabase/server";

type Entrada = {
  ocurrido_en: string;
  actor_nombre: string | null;
  accion: "insert" | "update" | "delete";
  entidad: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
};

// Campos técnicos que no aportan al lector.
const OCULTOS = new Set([
  "id",
  "creado_en",
  "actualizado_en",
  "creado_por",
  "ventana_busquedas",
  "busquedas_en_ventana",
  "sesion_id",
  "turno_id",
  "alumno_id",
  "actualizado_por",
]);

const NOMBRE_ENTIDAD: Record<string, string> = {
  sesiones: "Sesión",
  asistencias: "Asistencia",
  incidencias: "Incidencia",
  turnos_gimnasio: "Turno",
  registros_gimnasio: "Registro",
  alumnos: "Alumno",
  dias_sin_clase: "Día sin clase",
  alumnos_coordinacion: "Nota de coordinación",
};

const VERBO = { insert: "creó", update: "cambió", delete: "quitó" } as const;

function valor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatearMomento(v);
  return String(v);
}

function cambios(e: Entrada): { campo: string; antes: string; despues: string }[] {
  const claves = new Set([...Object.keys(e.antes ?? {}), ...Object.keys(e.despues ?? {})]);
  return [...claves]
    .filter((k) => !OCULTOS.has(k) && JSON.stringify(e.antes?.[k]) !== JSON.stringify(e.despues?.[k]))
    .map((k) => ({ campo: k.replaceAll("_", " "), antes: valor(e.antes?.[k]), despues: valor(e.despues?.[k]) }));
}

/** Historial de cambios de un registro (solo coordinación). */
export async function Historial({
  entidad,
  id,
}: {
  entidad: "sesiones" | "turnos_gimnasio" | "alumnos" | "dias_sin_clase";
  id: string;
}) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("admin_historial", { p_entidad: entidad, p_id: id });
  if (error) return <p className="text-sm text-danger">No se pudo cargar el historial.</p>;
  const entradas = (data ?? []) as Entrada[];

  return (
    <details className="rounded-card bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
      <summary className="cursor-pointer text-[15px] font-medium text-fg">
        Historial de cambios <span className="text-fg-muted">({entradas.length})</span>
      </summary>
      <ol className="mt-3 flex flex-col divide-y divide-line">
        {entradas.map((e, i) => {
          const lista = e.accion === "update" ? cambios(e) : [];
          return (
            <li key={i} className="flex flex-col gap-1 py-3">
              <span className="text-sm text-fg">
                {e.actor_nombre ?? "Sistema"} {VERBO[e.accion]} · {NOMBRE_ENTIDAD[e.entidad] ?? e.entidad}
              </span>
              <span className="text-xs text-fg-faint">{formatearMomento(e.ocurrido_en)}</span>
              {e.motivo && <span className="text-[13px] text-info">Motivo: {e.motivo}</span>}
              {lista.length > 0 && (
                <ul className="text-[13px] text-fg-muted">
                  {lista.map((c) => (
                    <li key={c.campo}>
                      {c.campo}: <span className="line-through">{c.antes}</span> → <span className="text-fg-body">{c.despues}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

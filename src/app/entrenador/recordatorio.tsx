"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { marcarSinClase, type EstadoSinClase } from "./acciones-asistencia";

/**
 * "¿Hoy tuviste clase?" — destacado en los días habituales de la disciplina,
 * discreto los demás días. Si no se contesta, no se guarda nada.
 */
export function Recordatorio({
  disciplinaId,
  disciplinaNombre,
  destacado,
  motivos,
}: {
  disciplinaId: string;
  disciplinaNombre: string;
  destacado: boolean;
  motivos: { id: string; nombre: string }[];
}) {
  const [eligiendoMotivo, setEligiendoMotivo] = useState(false);
  const [estado, accion, pendiente] = useActionState<EstadoSinClase, FormData>(marcarSinClase, {});

  return (
    <div
      className={
        destacado
          ? "flex flex-col gap-3 rounded-control border border-accent/40 bg-accent/5 p-4"
          : "flex flex-col gap-3 border-t border-line pt-3"
      }
    >
      <div className="flex flex-col gap-1">
        <p className={destacado ? "text-[15px] font-medium text-fg" : "text-sm text-fg-body"}>
          ¿Hoy tuviste clase de {disciplinaNombre}?
        </p>
        {destacado && (
          <p className="text-[13px] text-fg-muted">
            Si la tuviste, te invitamos a registrarla; si no, la coordinación la tomará como que no hubo.
          </p>
        )}
      </div>

      {eligiendoMotivo ? (
        <form action={accion} className="flex flex-col gap-2">
          <input type="hidden" name="disciplina_id" value={disciplinaId} />
          <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
            Motivo (opcional)
            <select
              name="motivo_id"
              defaultValue=""
              className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-fg"
            >
              <option value="">Sin especificar</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Boton type="submit" disabled={pendiente} className="flex-1 sm:flex-none">
              {pendiente ? "Guardando…" : "Confirmar: no hubo clase"}
            </Boton>
            <Boton type="button" onClick={() => setEligiendoMotivo(false)}>
              Cancelar
            </Boton>
          </div>
          {estado.error && <Aviso>{estado.error}</Aviso>}
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/entrenador/disciplinas/${disciplinaId}/asistencia`}
            className={
              destacado
                ? "inline-flex h-11 flex-1 items-center justify-center rounded-control bg-accent px-4 text-sm font-medium text-on-accent hover:opacity-90 sm:flex-none"
                : "inline-flex h-10 items-center justify-center rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated"
            }
          >
            Sí, registrar asistencia
          </Link>
          <Boton
            type="button"
            onClick={() => setEligiendoMotivo(true)}
            className={destacado ? "h-11 flex-1 sm:flex-none" : ""}
          >
            No hubo clase
          </Boton>
        </div>
      )}
    </div>
  );
}

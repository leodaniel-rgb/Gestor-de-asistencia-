"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { aprobarSolicitud, rechazarSolicitud, type EstadoResolucion } from "./actions";

export function ResolverSolicitud({ id, textoAprobar }: { id: string; textoAprobar: string }) {
  const [rechazando, setRechazando] = useState(false);
  const [estadoA, aprobar, pendienteA] = useActionState<EstadoResolucion, FormData>(aprobarSolicitud, {});
  const [estadoR, rechazar, pendienteR] = useActionState<EstadoResolucion, FormData>(rechazarSolicitud, {});
  const error = estadoA.error ?? estadoR.error;

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {rechazando ? (
        <form action={rechazar} className="flex w-full flex-col gap-2 sm:w-80">
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
            Motivo del rechazo (lo verá el entrenador)
            <textarea
              name="motivo"
              required
              minLength={3}
              maxLength={300}
              rows={2}
              className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-muted"
            />
          </label>
          <div className="flex gap-2">
            <Boton type="submit" variante="peligro" disabled={pendienteR} className="h-9 px-3 text-[13px]">
              Rechazar
            </Boton>
            <Boton type="button" onClick={() => setRechazando(false)} className="h-9 px-3 text-[13px]">
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <form action={aprobar}>
            <input type="hidden" name="id" value={id} />
            <Boton type="submit" disabled={pendienteA} className="h-9 px-3 text-[13px]">
              {pendienteA ? "Aprobando…" : textoAprobar}
            </Boton>
          </form>
          <Boton type="button" variante="peligro" onClick={() => setRechazando(true)} className="h-9 px-3 text-[13px]">
            Rechazar
          </Boton>
        </div>
      )}
      {error && <Aviso>{error}</Aviso>}
    </div>
  );
}

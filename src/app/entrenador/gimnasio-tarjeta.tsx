"use client";

import { useActionState } from "react";
import { BotonConfirmar } from "@/components/boton-confirmar";
import { Aviso, Boton } from "@/components/ui";
import { DISPOSITIVOS, ETIQUETA_TURNO, type NombreTurno } from "@/lib/gimnasio";
import { abrirGimnasio, cerrarTurnoPortal, irAlKiosco, type EstadoGimnasio } from "./acciones-gimnasio";

const claseOpcion =
  "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-control border border-line px-3 text-sm text-fg-body has-checked:border-accent has-checked:bg-accent/10 has-checked:text-fg";

function ElegirDispositivo() {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[13px] text-fg-muted">¿En qué dispositivo estará el kiosco?</legend>
      <div className="flex gap-2">
        {DISPOSITIVOS.map((d, i) => (
          <label key={d.valor} className={claseOpcion}>
            <input type="radio" name="dispositivo" value={d.valor} defaultChecked={i === 1} className="sr-only" />
            {d.etiqueta}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AbrirGimnasio({ disciplinaId, sugerido }: { disciplinaId: string; sugerido: NombreTurno | null }) {
  const [estado, accion, pendiente] = useActionState<EstadoGimnasio, FormData>(abrirGimnasio, {});
  return (
    <form action={accion} className="flex flex-col gap-3 border-t border-line pt-3">
      <input type="hidden" name="disciplina_id" value={disciplinaId} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[13px] text-fg-muted">Turno (la hora de apertura se registra siempre)</legend>
        <div className="flex gap-2">
          {(["manana", "tarde", ""] as const).map((t) => (
            <label key={t || "hora"} className={claseOpcion}>
              <input type="radio" name="nombre" value={t} defaultChecked={(sugerido ?? "") === t} className="sr-only" />
              {t ? ETIQUETA_TURNO[t] : "Solo la hora"}
            </label>
          ))}
        </div>
      </fieldset>
      <ElegirDispositivo />
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={pendiente} className="h-12">
        {pendiente ? "Abriendo…" : "Abrir gimnasio"}
      </Boton>
    </form>
  );
}

export function TurnoAbierto({ turnoId }: { turnoId: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <form action={irAlKiosco} className="flex flex-col gap-3">
        <input type="hidden" name="turno_id" value={turnoId} />
        <ElegirDispositivo />
        <Boton type="submit" variante="primario" className="h-12">
          Ir al kiosco
        </Boton>
      </form>
      <BotonConfirmar
        accion={cerrarTurnoPortal}
        campos={{ turno_id: turnoId }}
        texto="Cerrar turno"
        textoConfirmar="Confirmar cierre"
      />
    </div>
  );
}

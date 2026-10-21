"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, Tarjeta } from "@/components/ui";
import { ETIQUETA_GENERO, GENEROS } from "@/lib/catalogos";
import { AYUDA_MATRICULA } from "@/lib/matricula";
import { sugerirAlta, type EstadoSugerencia } from "./actions";

export function SugerirAlumno({ disciplinaId }: { disciplinaId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState<EstadoSugerencia, FormData>(sugerirAlta, {});
  const v = estado.valores;

  if (!abierto) {
    return (
      <div className="flex flex-col gap-2">
        <Boton type="button" onClick={() => setAbierto(true)} className="w-fit">
          + Sugerir alumno nuevo
        </Boton>
        {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      </div>
    );
  }

  const error = estado.error ?? Object.values(estado.errores ?? {}).flat()[0];

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium text-fg">Sugerir alumno nuevo</h2>
        <button type="button" onClick={() => setAbierto(false)} className="text-[13px] text-fg-muted hover:text-fg">
          Cerrar
        </button>
      </div>
      <form key={JSON.stringify(estado)} action={accion} className="flex flex-col gap-4">
        <input type="hidden" name="disciplina_id" value={disciplinaId} />
        {estado.confirmarMatricula && <input type="hidden" name="confirmada" value={estado.confirmarMatricula} />}
        <Campo
          id="sugerir-matricula"
          name="matricula"
          etiqueta="Matrícula"
          inputMode="numeric"
          autoComplete="off"
          placeholder="07210101"
          required
          defaultValue={v?.matricula}
          className="font-mono"
        />
        <p className="-mt-2 text-xs text-fg-muted">{AYUDA_MATRICULA}</p>
        <Campo id="sugerir-nombre" name="nombre" etiqueta="Nombre completo" required defaultValue={v?.nombre} />
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          Género
          <select
            name="genero"
            defaultValue={v?.genero ?? ""}
            className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-fg"
          >
            <option value="">Sin asignar</option>
            {GENEROS.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GENERO[g]}
              </option>
            ))}
          </select>
        </label>
        {estado.confirmarMatricula && (
          <Aviso>¿La matrícula es {estado.confirmarMatricula}? Si es correcta, pulsa “Confirmar y enviar”.</Aviso>
        )}
        {error && <Aviso>{error}</Aviso>}
        {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
        <Boton type="submit" variante="primario" disabled={pendiente}>
          {pendiente ? "Enviando…" : estado.confirmarMatricula ? "Confirmar y enviar" : "Enviar sugerencia"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

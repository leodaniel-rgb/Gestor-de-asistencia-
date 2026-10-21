"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton } from "@/components/ui";

type Estado = { error?: string; ok?: string };

/**
 * Botón que, al pulsarlo, pide el motivo de la corrección antes de ejecutar
 * la acción. El motivo queda en la bitácora.
 */
export function AccionConMotivo({
  accion,
  campos,
  texto,
  textoConfirmar,
  peligro = false,
  children,
}: {
  accion: (previo: Estado, formData: FormData) => Promise<Estado>;
  campos: Record<string, string>;
  texto: string;
  textoConfirmar: string;
  peligro?: boolean;
  children?: React.ReactNode; // campos extra (p. ej. hora de salida)
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, ejecutar, pendiente] = useActionState<Estado, FormData>(async (previo, formData) => {
    const r = await accion(previo, formData);
    if (!r.error) setAbierto(false);
    return r;
  }, {});

  if (!abierto) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className={`h-9 w-fit rounded-control px-3 text-[13px] ${
            peligro ? "text-fg-muted hover:text-danger" : "text-fg-body hover:bg-elevated"
          }`}
        >
          {texto}
        </button>
        {estado.ok && <span className="text-xs text-success">{estado.ok}</span>}
      </div>
    );
  }

  return (
    <form action={ejecutar} className="flex w-full flex-col gap-2 rounded-control border border-line p-3 sm:max-w-md">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      {children}
      <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
        Motivo (queda en el historial)
        <textarea
          name="motivo"
          required
          minLength={5}
          maxLength={300}
          rows={2}
          autoFocus
          className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-muted"
        />
      </label>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <div className="flex gap-2">
        <Boton type="submit" variante={peligro ? "peligro" : "secundario"} disabled={pendiente} className="h-9 px-3 text-[13px]">
          {pendiente ? "Guardando…" : textoConfirmar}
        </Boton>
        <Boton type="button" onClick={() => setAbierto(false)} className="h-9 px-3 text-[13px]">
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

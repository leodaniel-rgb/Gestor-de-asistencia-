"use client";

import { useState } from "react";

/** Botón de dos pasos para acciones con consecuencias (baja, desactivar…). */
export function BotonConfirmar({
  accion,
  campos,
  texto,
  textoConfirmar,
}: {
  accion: (formData: FormData) => Promise<void>;
  campos: Record<string, string>;
  texto: string;
  textoConfirmar: string;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="h-9 rounded-control px-3 text-[13px] text-fg-muted hover:text-danger"
      >
        {texto}
      </button>
    );
  }

  return (
    <form action={accion} className="flex gap-1">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <button
        type="submit"
        className="h-9 rounded-control border border-danger/40 px-3 text-[13px] text-danger hover:bg-danger/10"
      >
        {textoConfirmar}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="h-9 rounded-control px-3 text-[13px] text-fg-muted hover:text-fg"
      >
        Cancelar
      </button>
    </form>
  );
}

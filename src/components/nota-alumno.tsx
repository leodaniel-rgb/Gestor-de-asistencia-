"use client";

import { useActionState, useState } from "react";
import { guardarNotaAlumno } from "@/app/coordinador/registros/acciones";
import { Aviso, Boton } from "@/components/ui";

type Estado = { error?: string; ok?: string };

/**
 * Nota privada de la coordinación sobre un alumno y la marca "No contar en
 * reportes" (solo se oculta de los reportes; sus registros se conservan).
 * Excluir pide una nota; volver a contarlo pide un motivo. Todo queda en el historial.
 */
export function NotaAlumno({
  alumnoId,
  nota,
  excluido,
  siempreAbierto = false,
}: {
  alumnoId: string;
  nota: string | null;
  excluido: boolean;
  siempreAbierto?: boolean;
}) {
  const [abierto, setAbierto] = useState(siempreAbierto);
  const [excluir, setExcluir] = useState(excluido);
  const [estado, ejecutar, pendiente] = useActionState<Estado, FormData>(async (previo, formData) => {
    const r = await guardarNotaAlumno(previo, formData);
    if (!r.error && !siempreAbierto) setAbierto(false);
    return r;
  }, {});
  const volverAContar = excluido && !excluir;

  if (!abierto) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="h-9 w-fit rounded-control px-3 text-[13px] text-fg-body hover:bg-elevated"
        >
          {nota ? "Editar nota" : "Nota"}
        </button>
        {estado.ok && <span className="text-xs text-success">{estado.ok}</span>}
      </div>
    );
  }

  return (
    <form action={ejecutar} className="flex w-full flex-col gap-2 rounded-control border border-line p-3 sm:max-w-md">
      <input type="hidden" name="id" value={alumnoId} />
      <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
        Nota de coordinación (solo la ve la coordinación)
        <textarea
          name="nota"
          defaultValue={nota ?? ""}
          maxLength={300}
          rows={2}
          placeholder="Ej.: es un profesor, no contar"
          autoFocus={!siempreAbierto}
          className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-fg-muted"
        />
      </label>
      <label className="flex items-center gap-2 text-[13px] text-fg-body">
        <input
          type="checkbox"
          name="excluir"
          checked={excluir}
          onChange={(e) => setExcluir(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        No contar en reportes (sus registros se conservan)
      </label>
      {volverAContar && (
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Motivo para volver a contarlo (queda en el historial)
          <textarea
            name="motivo"
            required
            minLength={5}
            maxLength={300}
            rows={2}
            className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-muted"
          />
        </label>
      )}
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {siempreAbierto && estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      <div className="flex gap-2">
        <Boton type="submit" disabled={pendiente} className="h-9 px-3 text-[13px]">
          {pendiente ? "Guardando…" : "Guardar nota"}
        </Boton>
        {!siempreAbierto && (
          <Boton type="button" onClick={() => setAbierto(false)} className="h-9 px-3 text-[13px]">
            Cancelar
          </Boton>
        )}
      </div>
    </form>
  );
}

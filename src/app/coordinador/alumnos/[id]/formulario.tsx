"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { ETIQUETA_GENERO, GENEROS, type Genero } from "@/lib/catalogos";
import { actualizarAlumnoAdmin, type EstadoAdmin } from "../../registros/acciones";

export function FormularioAlumno({
  alumno,
}: {
  alumno: { id: string; matricula: string; nombre: string; genero: Genero | null };
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAdmin, FormData>(actualizarAlumnoAdmin, {});
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={alumno.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="matricula" name="matricula" etiqueta="Matrícula" defaultValue={alumno.matricula} required className="font-mono" />
        <Campo id="nombre" name="nombre" etiqueta="Nombre completo" defaultValue={alumno.nombre} required />
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          Género
          <select
            name="genero"
            defaultValue={alumno.genero ?? ""}
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
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
        Motivo de la corrección (queda en el historial)
        <textarea
          name="motivo"
          required
          minLength={5}
          maxLength={300}
          rows={2}
          className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-muted"
        />
      </label>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      <Boton type="submit" disabled={pendiente} className="w-fit">
        {pendiente ? "Guardando…" : "Guardar corrección"}
      </Boton>
    </form>
  );
}

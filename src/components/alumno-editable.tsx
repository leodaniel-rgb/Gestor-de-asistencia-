"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton } from "@/components/ui";
import { actualizarAlumno, type EstadoAlumno } from "@/lib/alumnos/acciones";
import { ETIQUETA_GENERO, GENEROS, type Genero } from "@/lib/catalogos";

export type AlumnoFila = {
  id: string;
  matricula: string;
  nombre: string;
  genero: Genero | null;
};

const claseInput =
  "h-10 rounded-control border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-fg-muted";

/** Fila de alumno con edición en línea de nombre y género (y matrícula si `editarMatricula`). */
export function AlumnoEditable({
  alumno,
  editarMatricula = false,
  detalle,
  accionesExtra,
}: {
  alumno: AlumnoFila;
  editarMatricula?: boolean;
  detalle?: string;
  accionesExtra?: React.ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [estado, accion, pendiente] = useActionState<EstadoAlumno, FormData>(
    async (previo, formData) => {
      const r = await actualizarAlumno(previo, formData);
      if (r.ok) setEditando(false);
      return r;
    },
    {},
  );

  if (!editando) {
    return (
      <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <span className="text-[15px] text-fg">{alumno.nombre}</span>
          <span className="text-[13px] text-fg-muted">
            <span className="font-mono">{alumno.matricula}</span>
            {" · "}
            {alumno.genero ? ETIQUETA_GENERO[alumno.genero] : <span className="text-info">Género sin asignar</span>}
            {detalle && ` · ${detalle}`}
          </span>
        </div>
        <div className="flex gap-2">
          <Boton type="button" onClick={() => setEditando(true)} className="h-9 px-3 text-[13px]">
            Editar
          </Boton>
          {accionesExtra}
        </div>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-3 py-3">
      <input type="hidden" name="id" value={alumno.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        {editarMatricula && (
          <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
            Matrícula
            <input name="matricula" defaultValue={alumno.matricula} className={`${claseInput} font-mono`} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Nombre
          <input name="nombre" defaultValue={alumno.nombre} required className={claseInput} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Género
          <select name="genero" defaultValue={alumno.genero ?? ""} className={claseInput}>
            <option value="">Sin asignar</option>
            {GENEROS.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GENERO[g]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(estado.error || estado.errores) && (
        <Aviso>
          {estado.error ??
            estado.errores?.matricula?.[0] ??
            estado.errores?.nombre?.[0] ??
            estado.errores?.genero?.[0]}
        </Aviso>
      )}
      <div className="flex gap-2">
        <Boton type="submit" variante="primario" disabled={pendiente} className="h-9 px-3 text-[13px]">
          {pendiente ? "Guardando…" : "Guardar"}
        </Boton>
        <Boton type="button" onClick={() => setEditando(false)} className="h-9 px-3 text-[13px]">
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

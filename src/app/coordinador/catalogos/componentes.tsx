"use client";

import { useActionState } from "react";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { agregarOpcion, alternarOpcion, type EstadoCatalogo } from "./actions";

type Opcion = { id: string; nombre: string; activa: boolean };

function FilaOpcion({ opcion }: { opcion: Opcion }) {
  const [estado, accion, pendiente] = useActionState<EstadoCatalogo, FormData>(alternarOpcion, {});
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm ${opcion.activa ? "text-fg" : "text-fg-faint line-through"}`}>{opcion.nombre}</span>
        <form action={accion}>
          <input type="hidden" name="id" value={opcion.id} />
          <input type="hidden" name="activa" value={String(!opcion.activa)} />
          <button
            type="submit"
            disabled={pendiente}
            className="h-8 rounded-control px-3 text-[13px] text-fg-muted hover:bg-elevated hover:text-fg"
          >
            {opcion.activa ? "Quitar" : "Volver a activar"}
          </button>
        </form>
      </div>
      {estado.error && <Aviso>{estado.error}</Aviso>}
    </li>
  );
}

export function Catalogo({
  tipo,
  titulo,
  descripcion,
  opciones,
}: {
  tipo: "motivo_sin_clase" | "categoria_incidencia";
  titulo: string;
  descripcion: string;
  opciones: Opcion[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoCatalogo, FormData>(agregarOpcion, {});
  const activas = opciones.filter((o) => o.activa).length;

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-fg">
          {titulo} <span className="text-fg-muted">({activas} de 6)</span>
        </h2>
        <p className="text-[13px] text-fg-muted">{descripcion}</p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {opciones.map((o) => (
          <FilaOpcion key={o.id} opcion={o} />
        ))}
      </ul>
      {activas < 6 ? (
        <form key={estado.ok} action={accion} className="flex flex-wrap gap-2">
          <input type="hidden" name="tipo" value={tipo} />
          <input
            name="nombre"
            required
            minLength={2}
            maxLength={40}
            placeholder="Nueva opción"
            aria-label={`Nueva opción de ${titulo.toLowerCase()}`}
            className="h-10 min-w-48 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-fg-muted"
          />
          <Boton type="submit" disabled={pendiente}>
            Agregar
          </Boton>
        </form>
      ) : (
        <p className="text-[13px] text-fg-muted">Llegaste al máximo de 6. Quita una para agregar otra.</p>
      )}
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
    </Tarjeta>
  );
}

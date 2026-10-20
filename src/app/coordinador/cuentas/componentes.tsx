"use client";

import { useActionState, useState } from "react";
import { Aviso, Boton, Campo, Tarjeta } from "@/components/ui";
import {
  crearCuenta,
  desactivarCuenta,
  restablecerPassword,
  type EstadoCuenta,
} from "./actions";

function CredencialTemporal({ credencial }: { credencial: NonNullable<EstadoCuenta["credencial"]> }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-control border border-accent/40 bg-accent/5 p-4">
      <p className="text-sm text-fg">
        Contraseña temporal de <strong className="font-medium">{credencial.nombre}</strong>
      </p>
      <p className="text-[13px] text-fg-muted">{credencial.correo}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-badge bg-elevated px-3 py-2 font-mono text-base tracking-wider text-fg">
          {credencial.password}
        </code>
        <Boton
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(credencial.password);
            setCopiado(true);
          }}
        >
          {copiado ? "Copiada" : "Copiar"}
        </Boton>
      </div>
      <p className="text-[13px] text-fg-muted">
        Solo se muestra esta vez. Entrégala en persona; se pedirá cambiarla al primer inicio de sesión.
      </p>
    </div>
  );
}

export function FormularioNuevaCuenta() {
  const [estado, accion, pendiente] = useActionState<EstadoCuenta, FormData>(crearCuenta, {});

  return (
    <Tarjeta className="flex flex-col gap-4">
      <h2 className="text-base font-medium text-fg">Nueva cuenta de entrenador</h2>
      <form action={accion} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Campo id="nombre" name="nombre" etiqueta="Nombre completo" required error={estado.errores?.nombre?.[0]} />
        <Campo
          id="correo-nuevo"
          name="correo"
          type="email"
          etiqueta="Correo institucional"
          required
          error={estado.errores?.correo?.[0]}
        />
        <Boton type="submit" variante="primario" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear cuenta"}
        </Boton>
      </form>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      {estado.credencial && <CredencialTemporal credencial={estado.credencial} />}
    </Tarjeta>
  );
}

export function AccionesCuenta({ id, nombre }: { id: string; nombre: string }) {
  const [estadoReset, accionReset, pendienteReset] = useActionState<EstadoCuenta, FormData>(
    restablecerPassword,
    {},
  );
  const [estadoBaja, accionBaja, pendienteBaja] = useActionState<EstadoCuenta, FormData>(
    desactivarCuenta,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <form action={accionReset}>
          <input type="hidden" name="id" value={id} />
          <Boton type="submit" disabled={pendienteReset} className="h-8 px-3 text-[13px]">
            Restablecer contraseña
          </Boton>
        </form>
        {confirmando ? (
          <form action={accionBaja} className="flex gap-2">
            <input type="hidden" name="id" value={id} />
            <Boton type="submit" variante="peligro" disabled={pendienteBaja} className="h-8 px-3 text-[13px]">
              Confirmar: desactivar a {nombre}
            </Boton>
            <Boton type="button" onClick={() => setConfirmando(false)} className="h-8 px-3 text-[13px]">
              Cancelar
            </Boton>
          </form>
        ) : (
          <Boton type="button" variante="peligro" onClick={() => setConfirmando(true)} className="h-8 px-3 text-[13px]">
            Desactivar
          </Boton>
        )}
      </div>
      {(estadoReset.error || estadoBaja.error) && <Aviso>{estadoReset.error ?? estadoBaja.error}</Aviso>}
      {estadoReset.credencial && <CredencialTemporal credencial={estadoReset.credencial} />}
    </div>
  );
}

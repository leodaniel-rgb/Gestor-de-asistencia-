"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { cambiarPassword, type EstadoCambio } from "./actions";

export function FormularioCambio() {
  const [estado, accion, pendiente] = useActionState<EstadoCambio, FormData>(
    cambiarPassword,
    {},
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      <Campo
        id="password"
        name="password"
        type="password"
        etiqueta="Nueva contraseña"
        autoComplete="new-password"
        required
        minLength={10}
        error={estado.errores?.password?.[0]}
      />
      <Campo
        id="confirmacion"
        name="confirmacion"
        type="password"
        etiqueta="Confirmar contraseña"
        autoComplete="new-password"
        required
        error={estado.errores?.confirmacion?.[0]}
      />
      <p className="text-[13px] text-fg-muted">
        Mínimo 10 caracteres, con mayúsculas, minúsculas y números.
      </p>
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar contraseña"}
      </Boton>
    </form>
  );
}

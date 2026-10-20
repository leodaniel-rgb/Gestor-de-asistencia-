"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo } from "@/components/ui";
import { iniciarSesion, type EstadoLogin } from "./actions";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(
    iniciarSesion,
    {},
  );

  return (
    <form action={accion} className="flex flex-col gap-4">
      <Campo
        id="correo"
        name="correo"
        type="email"
        etiqueta="Correo institucional"
        autoComplete="username"
        required
        defaultValue={estado.correo}
      />
      <Campo
        id="password"
        name="password"
        type="password"
        etiqueta="Contraseña"
        autoComplete="current-password"
        required
      />
      {estado.error && <Aviso>{estado.error}</Aviso>}
      <Boton type="submit" variante="primario" disabled={pendiente}>
        {pendiente ? "Entrando…" : "Iniciar sesión"}
      </Boton>
    </form>
  );
}

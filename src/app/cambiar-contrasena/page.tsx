import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/auth/dal";
import { cerrarSesion } from "@/lib/auth/acciones";
import { FormularioCambio } from "./formulario";

export const metadata: Metadata = { title: "Cambiar contraseña" };

async function Contenido() {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/login");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">
          {usuario.debeCambiarPassword ? "Crea tu contraseña" : "Cambiar contraseña"}
        </h1>
        <p className="text-sm text-fg-muted">
          {usuario.debeCambiarPassword
            ? `Hola, ${usuario.nombre}. Antes de continuar, reemplaza la contraseña temporal por una que solo tú conozcas.`
            : "Elige una contraseña nueva."}
        </p>
      </div>
      <FormularioCambio />
      <form action={cerrarSesion}>
        <button type="submit" className="text-[13px] text-fg-muted underline-offset-4 hover:underline">
          Cerrar sesión
        </button>
      </form>
    </>
  );
}

export default function PaginaCambiarContrasena() {
  return (
    <div data-theme="light" className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
          <Contenido />
        </Suspense>
      </div>
    </div>
  );
}

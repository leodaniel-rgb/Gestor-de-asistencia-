import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { obtenerUsuario, rutaInicio } from "@/lib/auth/dal";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Iniciar sesión" };

// Si ya hay sesión válida, manda al usuario a su inicio.
async function RedirigirConSesion() {
  const usuario = await obtenerUsuario();
  if (usuario) redirect(rutaInicio(usuario));
  return null;
}

export default function PaginaLogin() {
  return (
    <div data-theme="light" className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
      <Suspense>
        <RedirigirConSesion />
      </Suspense>
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Image
          src="/brand/logo-tecmilenio-color.png"
          alt="Universidad Tecmilenio"
          width={1346}
          height={267}
          priority
          className="h-auto w-56"
        />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">
            Asistencia VIVE
          </h1>
          <p className="text-sm text-fg-muted">
            Acceso para coordinación y entrenadores.
          </p>
        </div>
        <FormularioLogin />
        <p className="text-[13px] text-fg-faint">
          ¿Olvidaste tu contraseña? Pide a la coordinación VIVE que la restablezca.
        </p>
      </div>
    </div>
  );
}

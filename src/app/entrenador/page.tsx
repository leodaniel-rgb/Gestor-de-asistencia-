import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { cerrarSesion } from "@/lib/auth/acciones";
import { Tarjeta } from "@/components/ui";

export const metadata: Metadata = { title: "Inicio" };

async function Bienvenida() {
  const usuario = await requerirUsuario("entrenador");
  return (
    <>
      <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">Hola, {usuario.nombre}</h1>
      <Tarjeta>
        <p className="text-sm text-fg-body">Aquí registrarás la asistencia de tus disciplinas.</p>
        <p className="mt-1 text-[13px] text-fg-muted">Disponible en la siguiente fase del portal.</p>
      </Tarjeta>
    </>
  );
}

export default function PaginaEntrenador() {
  return (
    <div data-theme="light" className="flex flex-1 flex-col bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/brand/simbolo-tecmilenio.png" alt="" width={24} height={24} />
            <span className="text-[15px] font-medium text-fg">Asistencia VIVE</span>
          </div>
          <form action={cerrarSesion}>
            <button type="submit" className="rounded-control px-3 py-2 text-[13px] text-fg-body hover:bg-elevated">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-10">
        <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
          <Bienvenida />
        </Suspense>
      </main>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { cerrarSesion } from "@/lib/auth/acciones";

// Tema claro: se usa en canchas y al sol, casi siempre desde el celular.
export default function LayoutEntrenador({ children }: LayoutProps<"/entrenador">) {
  return (
    <div data-theme="light" className="flex flex-1 flex-col bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3">
          <Link href="/entrenador" className="flex items-center gap-3">
            <Image src="/brand/simbolo-tecmilenio.png" alt="" width={24} height={24} />
            <span className="text-[15px] font-medium text-fg">Asistencia VIVE</span>
          </Link>
          <form action={cerrarSesion}>
            <button type="submit" className="rounded-control px-3 py-2 text-[13px] text-fg-body hover:bg-elevated">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-8">{children}</main>
    </div>
  );
}

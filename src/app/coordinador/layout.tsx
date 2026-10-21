import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { cerrarSesion } from "@/lib/auth/acciones";
import { crearClienteServidor } from "@/lib/supabase/server";

async function UsuarioActual() {
  const usuario = await requerirUsuario("coordinador");
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-[13px] text-fg-muted sm:inline">{usuario.nombre}</span>
      <form action={cerrarSesion}>
        <button type="submit" className="rounded-control px-3 py-2 text-[13px] text-fg-body hover:bg-elevated">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

async function ContadorSolicitudes() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { count } = await supabase
    .from("solicitudes")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  if (!count) return null;
  return (
    <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium text-on-accent" aria-label={`${count} pendientes`}>
      {count}
    </span>
  );
}

export default function LayoutCoordinador({ children }: LayoutProps<"/coordinador">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/coordinador/disciplinas" className="flex items-center gap-3">
              <Image src="/brand/simbolo-tecmilenio.png" alt="" width={24} height={24} />
              <span className="text-[15px] font-medium tracking-[-0.011em] text-fg">
                Asistencia VIVE
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-[13px]">
              <Link href="/coordinador/disciplinas" className="rounded-control px-3 py-2 text-fg-body hover:bg-elevated">
                Disciplinas
              </Link>
              <Link
                href="/coordinador/solicitudes"
                className="flex items-center gap-1.5 rounded-control px-3 py-2 text-fg-body hover:bg-elevated"
              >
                Solicitudes
                <Suspense>
                  <ContadorSolicitudes />
                </Suspense>
              </Link>
              <Link href="/coordinador/cuentas" className="rounded-control px-3 py-2 text-fg-body hover:bg-elevated">
                Cuentas
              </Link>
            </nav>
          </div>
          <Suspense>
            <UsuarioActual />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-10">{children}</main>
    </div>
  );
}

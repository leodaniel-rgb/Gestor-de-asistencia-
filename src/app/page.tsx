import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3">
          <Image
            src="/brand/simbolo-tecmilenio.png"
            alt=""
            width={28}
            height={28}
            priority
          />
          <span className="text-[15px] font-medium tracking-[-0.011em] text-fg">
            Asistencia VIVE
          </span>
          <span className="rounded-badge bg-white/5 px-1.5 font-mono text-xs text-fg-muted">
            SLP
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-6 px-4 py-24">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-muted">
          Universidad Tecmilenio · Campus San Luis Potosí
        </p>
        <h1 className="max-w-3xl text-5xl font-medium leading-none tracking-[-0.022em] text-fg sm:text-6xl">
          Gestor de asistencia VIVE
        </h1>
        <p className="max-w-xl text-base leading-normal text-fg-muted">
          Registro de asistencia de selecciones, talleres y gimnasio, con
          gráficas y reportes generados automáticamente.
        </p>
        <div className="mt-2 w-fit rounded-card bg-surface p-6 shadow-[inset_0_0_0_1px_var(--line)]">
          <p className="text-sm text-fg-body">Portal en construcción</p>
          <p className="mt-1 text-[13px] text-fg-faint">
            Fase 0 · configuración del proyecto
          </p>
        </div>
      </main>
    </div>
  );
}

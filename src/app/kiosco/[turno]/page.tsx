import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearHora } from "@/lib/catalogos";
import { ETIQUETA_TURNO, esDispositivo, type NombreTurno } from "@/lib/gimnasio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Kiosco } from "./kiosco";

export const metadata: Metadata = { title: "Gimnasio" };

async function Contenido({
  params,
  searchParams,
}: {
  params: Promise<{ turno: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirUsuario("entrenador");
  const turnoId = z.uuid().safeParse((await params).turno);
  if (!turnoId.success) notFound();
  const { dispositivo } = await searchParams;

  const supabase = await crearClienteServidor();
  // RLS: solo entrenadores de ese gimnasio ven el turno.
  const { data: turno } = await supabase
    .from("turnos_gimnasio")
    .select("id, nombre, abierto_en, cerrado_en, disciplinas(nombre)")
    .eq("id", turnoId.data)
    .maybeSingle();
  if (!turno) notFound();

  const t = turno as unknown as {
    id: string;
    nombre: NombreTurno | null;
    abierto_en: string;
    cerrado_en: string | null;
    disciplinas: { nombre: string } | null;
  };

  if (t.cerrado_en) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-4 text-center">
        <h1 className="text-2xl font-medium text-fg">Este turno ya está cerrado</h1>
        <Link href="/entrenador" className="text-sm text-fg-body underline underline-offset-4">
          Volver a mis disciplinas
        </Link>
      </div>
    );
  }

  const descripcion = `${t.disciplinas?.nombre ?? "Gimnasio"} · ${
    t.nombre ? `Turno ${ETIQUETA_TURNO[t.nombre].toLowerCase()} · ` : ""
  }abierto ${formatearHora(t.abierto_en)}`;

  return (
    <Kiosco
      turnoId={t.id}
      descripcionTurno={descripcion}
      dispositivo={esDispositivo(dispositivo) ? dispositivo : "tablet"}
    />
  );
}

export default function PaginaKiosco({ params, searchParams }: PageProps<"/kiosco/[turno]">) {
  return (
    // Tema claro y sin menú: el kiosco no muestra nada del portal.
    <div data-theme="light" className="flex flex-1 flex-col bg-canvas">
      <Suspense fallback={<p className="p-6 text-sm text-fg-muted">Cargando…</p>}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

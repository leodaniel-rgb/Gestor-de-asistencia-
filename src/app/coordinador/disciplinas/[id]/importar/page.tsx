import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar lista" };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  const { data: disciplina } = await supabase
    .from("disciplinas")
    .select("id, nombre, tipo, activa")
    .eq("id", id.data)
    .maybeSingle();
  if (!disciplina || disciplina.tipo !== "lista") notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href={`/coordinador/disciplinas/${disciplina.id}`} className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← {disciplina.nombre}
        </Link>
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Importar lista</h1>
        <p className="text-sm text-fg-muted">
          Revisa la vista previa antes de confirmar. Se importa todo o nada.
        </p>
      </div>
      {disciplina.activa ? (
        <Importador disciplinaId={disciplina.id} disciplinaNombre={disciplina.nombre} />
      ) : (
        <p className="text-sm text-fg-muted">La disciplina está inactiva: actívala para importar.</p>
      )}
    </div>
  );
}

export default function PaginaImportar({ params }: PageProps<"/coordinador/disciplinas/[id]/importar">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

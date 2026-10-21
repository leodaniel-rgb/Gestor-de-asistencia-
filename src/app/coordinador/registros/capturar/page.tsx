import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { PaseDeLista, type FilaLista } from "@/components/pase-de-lista";
import { requerirUsuario } from "@/lib/auth/dal";
import { ahoraMx } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Capturar sesión" };

async function Contenido({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requerirUsuario("coordinador");
  const { disciplina } = await searchParams;
  const disciplinaId = z.uuid().safeParse(disciplina);

  const supabase = await crearClienteServidor();
  const { data: disciplinas } = await supabase
    .from("disciplinas")
    .select("id, nombre")
    .eq("tipo", "lista")
    .eq("activa", true)
    .order("nombre");

  // La lista solo se consulta cuando la coordinación elige la disciplina y pulsa "Cargar lista".
  let editor: React.ReactNode = null;
  if (disciplinaId.success) {
    const [inscripcionesRes, solicitudesRes, categoriasRes] = await Promise.all([
      supabase
        .from("inscripciones")
        .select("alumnos(id, matricula, nombre)")
        .eq("disciplina_id", disciplinaId.data)
        .is("fecha_baja", null),
      supabase
        .from("solicitudes")
        .select("id, matricula, nombre")
        .eq("disciplina_id", disciplinaId.data)
        .eq("tipo", "alta")
        .eq("estado", "pendiente"),
      supabase
        .from("catalogo_opciones")
        .select("id, nombre")
        .eq("tipo", "categoria_incidencia")
        .eq("activa", true)
        .order("creado_en"),
    ]);
    const filas: FilaLista[] = [
      ...((inscripcionesRes.data ?? []) as unknown as { alumnos: { id: string; matricula: string; nombre: string } | null }[])
        .flatMap((i) => (i.alumnos ? [i.alumnos] : []))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((a) => ({ clave: a.id, tipo: "alumno" as const, nombre: a.nombre, matricula: a.matricula })),
      ...(solicitudesRes.data ?? []).map((s) => ({
        clave: s.id as string,
        tipo: "solicitud" as const,
        nombre: s.nombre as string,
        matricula: s.matricula as string,
      })),
    ];
    const { fecha: hoy, hora } = ahoraMx();
    editor =
      filas.length === 0 ? (
        <p className="text-sm text-fg-muted">La disciplina no tiene alumnos en la lista.</p>
      ) : (
        <PaseDeLista
          modo="admin-capturar"
          disciplinaId={disciplinaId.data}
          hoy={hoy}
          filas={filas}
          categorias={categoriasRes.data ?? []}
          horaInicial={hora}
        />
      );
  }

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Disciplina
          <select
            name="disciplina"
            required
            defaultValue={disciplinaId.success ? disciplinaId.data : ""}
            className="h-10 min-w-56 rounded-control border border-line bg-surface px-3 text-sm text-fg"
          >
            <option value="" disabled>
              Elegir…
            </option>
            {(disciplinas ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated">
          Cargar lista
        </button>
      </form>
      {editor}
    </>
  );
}

export default function PaginaCapturar({ searchParams }: PageProps<"/coordinador/registros/capturar">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/coordinador/registros" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Registros
        </Link>
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Capturar sesión</h1>
        <p className="text-sm text-fg-muted">
          Para listas en papel o sesiones que el entrenador no pudo registrar. Quedará marcada como capturada por
          coordinación.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

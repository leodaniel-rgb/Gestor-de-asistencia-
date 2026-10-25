import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PuntoSinGenero } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { ETIQUETA_GENERO, type Genero } from "@/lib/catalogos";
import { leerNota } from "@/lib/notas";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Alumnos" };

async function Resultados({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requerirUsuario("coordinador");
  const { q } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim().slice(0, 60) : "";

  // Solo se consulta cuando la coordinación busca algo.
  if (busqueda.length < 3) {
    return <p className="text-sm text-fg-muted">Escribe al menos 3 caracteres de la matrícula o del nombre.</p>;
  }

  // Escapa comodines de LIKE y comas del filtro "or" de PostgREST.
  const patron = `%${busqueda.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ")}%`;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("alumnos")
    .select("id, matricula, nombre, genero, alumnos_coordinacion(nota, excluido_reportes), inscripciones(fecha_baja, disciplinas(nombre))")
    .or(`matricula.ilike.${patron},nombre.ilike.${patron}`)
    .order("nombre")
    .limit(50);
  if (error) return <p className="text-sm text-danger">No se pudo buscar.</p>;

  const alumnos = (data ?? []) as unknown as {
    id: string;
    matricula: string;
    nombre: string;
    genero: Genero | null;
    alumnos_coordinacion: { nota: string | null; excluido_reportes: boolean } | null;
    inscripciones: { fecha_baja: string | null; disciplinas: { nombre: string } | null }[];
  }[];
  if (alumnos.length === 0) return <p className="text-sm text-fg-muted">Sin resultados.</p>;

  return (
    <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
      {alumnos.map((a) => {
        const vigentes = a.inscripciones.filter((i) => !i.fecha_baja).map((i) => i.disciplinas?.nombre);
        return (
          <li key={a.id}>
            <Link
              href={`/coordinador/alumnos/${a.id}`}
              className="flex flex-col gap-0.5 px-4 py-3 hover:bg-white/[0.02]"
            >
              <span className="text-sm text-fg">
                {a.nombre} <span className="font-mono text-[13px] text-fg-muted">{a.matricula}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-muted">
                {a.genero ? (
                  ETIQUETA_GENERO[a.genero]
                ) : (
                  <>
                    <PuntoSinGenero /> Género sin asignar
                  </>
                )}{" "}
                · {vigentes.length ? vigentes.join(", ") : "Sin disciplinas con lista (solo gimnasio o dado de baja)"}
                {leerNota(a.alumnos_coordinacion).excluido && " · No cuenta en reportes"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function PaginaAlumnos({ searchParams }: PageProps<"/coordinador/alumnos">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Alumnos</h1>
        <p className="text-sm text-fg-muted">Directorio general, incluidos los que solo van al gimnasio.</p>
      </div>
      <form method="get" className="flex flex-wrap gap-2" role="search">
        <input
          name="q"
          type="search"
          minLength={3}
          maxLength={60}
          placeholder="Matrícula o nombre"
          aria-label="Buscar alumno por matrícula o nombre"
          className="h-10 min-w-64 flex-1 rounded-control border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-fg-muted sm:flex-none"
        />
        <button type="submit" className="h-10 rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated">
          Buscar
        </button>
      </form>
      <Suspense fallback={<p className="text-sm text-fg-muted">Buscando…</p>}>
        <Resultados searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

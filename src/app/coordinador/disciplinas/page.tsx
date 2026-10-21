import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { describirDias, ETIQUETA_TIPO, type TipoDisciplina } from "@/lib/catalogos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioNuevaDisciplina } from "./componentes";

export const metadata: Metadata = { title: "Disciplinas" };

type Fila = {
  id: string;
  nombre: string;
  tipo: TipoDisciplina;
  dias_clase: number[];
  activa: boolean;
  entrenador_disciplina: { perfiles: { nombre: string } | null }[];
  inscripciones: { count: number }[];
};

async function ListaDisciplinas() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("disciplinas")
    .select(
      "id, nombre, tipo, dias_clase, activa, entrenador_disciplina(perfiles(nombre)), inscripciones(count)",
    )
    .is("inscripciones.fecha_baja", null)
    .order("activa", { ascending: false })
    .order("nombre");

  if (error) return <p className="text-sm text-danger">No se pudieron cargar las disciplinas.</p>;
  const filas = (data ?? []) as unknown as Fila[];
  if (filas.length === 0) {
    return <p className="text-sm text-fg-muted">Aún no hay disciplinas. Crea la primera arriba.</p>;
  }

  return (
    <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
      {filas.map((d) => {
        const entrenadores = d.entrenador_disciplina
          .map((e) => e.perfiles?.nombre)
          .filter(Boolean)
          .join(", ");
        return (
          <li key={d.id}>
            <Link
              href={`/coordinador/disciplinas/${d.id}`}
              className="flex flex-col gap-1 px-4 py-4 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[15px] ${d.activa ? "text-fg" : "text-fg-faint line-through"}`}>
                    {d.nombre}
                  </span>
                  <span className="rounded-badge bg-white/5 px-1.5 text-xs text-fg-muted">
                    {ETIQUETA_TIPO[d.tipo]}
                  </span>
                  {!d.activa && <span className="rounded-badge bg-white/5 px-1.5 text-xs text-fg-faint">Inactiva</span>}
                </div>
                <span className="text-[13px] text-fg-muted">
                  {describirDias(d.dias_clase)} · {entrenadores || <span className="text-info">Sin entrenador</span>}
                </span>
              </div>
              {d.tipo === "lista" && (
                <span className="text-[13px] text-fg-muted">{d.inscripciones[0]?.count ?? 0} alumnos</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function PaginaDisciplinas() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Disciplinas</h1>
        <p className="text-sm text-fg-muted">
          Selecciones, talleres y gimnasio. Las disciplinas inactivas conservan su historial.
        </p>
      </div>
      <FormularioNuevaDisciplina />
      <Suspense fallback={<p className="text-sm text-fg-muted">Cargando disciplinas…</p>}>
        <ListaDisciplinas />
      </Suspense>
    </div>
  );
}

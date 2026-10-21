import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { describirDias, type TipoDisciplina } from "@/lib/catalogos";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis disciplinas" };

type Fila = {
  id: string;
  nombre: string;
  tipo: TipoDisciplina;
  dias_clase: number[];
  inscripciones: { count: number }[];
};

async function MisDisciplinas() {
  const usuario = await requerirUsuario("entrenador");
  const supabase = await crearClienteServidor();
  // RLS ya limita a las disciplinas asignadas a este entrenador.
  const { data, error } = await supabase
    .from("disciplinas")
    .select("id, nombre, tipo, dias_clase, inscripciones(count)")
    .eq("activa", true)
    .is("inscripciones.fecha_baja", null)
    .order("nombre");

  const filas = (data ?? []) as unknown as Fila[];

  return (
    <>
      <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">Hola, {usuario.nombre}</h1>
      {error ? (
        <p className="text-sm text-danger">No se pudieron cargar tus disciplinas.</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Aún no tienes disciplinas asignadas. Pide a la coordinación VIVE que te asigne.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filas.map((d) => (
            <li key={d.id}>
              <Link
                href={`/entrenador/disciplinas/${d.id}`}
                className="flex min-h-24 flex-col justify-between gap-2 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-elevated"
              >
                <span className="text-lg font-medium text-fg">{d.nombre}</span>
                <span className="text-[13px] text-fg-muted">
                  {d.tipo === "lista" ? `${d.inscripciones[0]?.count ?? 0} alumnos · ` : "Acceso libre · "}
                  {describirDias(d.dias_clase)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function PaginaEntrenador() {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <MisDisciplinas />
    </Suspense>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AlumnoEditable, type AlumnoFila } from "@/components/alumno-editable";
import { Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { describirDias, type TipoDisciplina } from "@/lib/catalogos";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lista de alumnos" };

async function Lista({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("entrenador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  // RLS: si la disciplina no es suya, no devuelve nada → 404.
  const [disciplinaRes, inscripcionesRes] = await Promise.all([
    supabase.from("disciplinas").select("id, nombre, tipo, dias_clase").eq("id", id.data).maybeSingle(),
    supabase
      .from("inscripciones")
      .select("id, alumnos(id, matricula, nombre, genero)")
      .eq("disciplina_id", id.data)
      .is("fecha_baja", null),
  ]);

  const disciplina = disciplinaRes.data as
    | { id: string; nombre: string; tipo: TipoDisciplina; dias_clase: number[] }
    | null;
  if (!disciplina) notFound();

  const alumnos = ((inscripcionesRes.data ?? []) as unknown as { alumnos: AlumnoFila | null }[])
    .map((i) => i.alumnos)
    .filter((a): a is AlumnoFila => a !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/entrenador" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Mis disciplinas
        </Link>
        <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">{disciplina.nombre}</h1>
        <p className="text-[13px] text-fg-muted">{describirDias(disciplina.dias_clase)}</p>
      </div>

      {disciplina.tipo === "acceso_libre" ? (
        <Tarjeta>
          <p className="text-sm text-fg-body">Disciplina de acceso libre: no lleva lista.</p>
          <p className="mt-1 text-[13px] text-fg-muted">El registro de entradas llegará con el modo kiosco.</p>
        </Tarjeta>
      ) : alumnos.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Aún no hay alumnos en la lista. La coordinación VIVE carga la lista inicial.
        </p>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-medium text-fg">
            Lista de alumnos <span className="text-fg-muted">({alumnos.length})</span>
          </h2>
          <p className="text-[13px] text-fg-muted">
            Puedes corregir nombre y género. Para cambiar una matrícula o dar de baja, avisa a la coordinación.
          </p>
          <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-[inset_0_0_0_1px_var(--line)]">
            {alumnos.map((a) => (
              <li key={a.id}>
                <AlumnoEditable alumno={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function PaginaListaEntrenador({ params }: PageProps<"/entrenador/disciplinas/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Lista params={params} />
    </Suspense>
  );
}

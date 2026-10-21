import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AlumnoEditable, type AlumnoFila } from "@/components/alumno-editable";
import { BotonConfirmar } from "@/components/boton-confirmar";
import { Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { ETIQUETA_TIPO, formatearFecha, type TipoDisciplina } from "@/lib/catalogos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { darDeBaja, quitarEntrenador } from "../actions";
import {
  FormularioAsignar,
  FormularioEditarDisciplina,
  FormularioInscribir,
} from "../componentes";

export const metadata: Metadata = { title: "Disciplina" };

type Disciplina = {
  id: string;
  nombre: string;
  tipo: TipoDisciplina;
  dias_clase: number[];
  activa: boolean;
};

async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  const [disciplinaRes, asignacionesRes, entrenadoresRes, inscripcionesRes] = await Promise.all([
    supabase.from("disciplinas").select("id, nombre, tipo, dias_clase, activa").eq("id", id.data).maybeSingle(),
    supabase
      .from("entrenador_disciplina")
      .select("id, perfiles(id, nombre, activo)")
      .eq("disciplina_id", id.data),
    supabase.from("perfiles").select("id, nombre").eq("rol", "entrenador").eq("activo", true).order("nombre"),
    supabase
      .from("inscripciones")
      .select("id, fecha_alta, alumnos(id, matricula, nombre, genero)")
      .eq("disciplina_id", id.data)
      .is("fecha_baja", null),
  ]);

  const disciplina = disciplinaRes.data as Disciplina | null;
  if (!disciplina) notFound();

  const asignaciones = (asignacionesRes.data ?? []) as unknown as {
    id: string;
    perfiles: { id: string; nombre: string; activo: boolean } | null;
  }[];
  const asignados = new Set(asignaciones.map((a) => a.perfiles?.id));
  const disponibles = (entrenadoresRes.data ?? []).filter((e) => !asignados.has(e.id));

  const inscripciones = ((inscripcionesRes.data ?? []) as unknown as {
    id: string;
    fecha_alta: string;
    alumnos: AlumnoFila | null;
  }[])
    .filter((i) => i.alumnos)
    .sort((a, b) => a.alumnos!.nombre.localeCompare(b.alumnos!.nombre, "es"));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/coordinador/disciplinas" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Disciplinas
        </Link>
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">{disciplina.nombre}</h1>
        <p className="text-sm text-fg-muted">{ETIQUETA_TIPO[disciplina.tipo]}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="text-base font-medium text-fg">Datos</h2>
          <FormularioEditarDisciplina disciplina={disciplina} />
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <h2 className="text-base font-medium text-fg">Entrenadores</h2>
          {asignaciones.length === 0 ? (
            <p className="text-[13px] text-info">Sin entrenador asignado.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {asignaciones.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span className={`text-sm ${a.perfiles?.activo ? "text-fg" : "text-fg-faint line-through"}`}>
                    {a.perfiles?.nombre}
                  </span>
                  <form action={quitarEntrenador}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-[13px] text-fg-muted hover:text-danger">
                      Quitar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <FormularioAsignar disciplinaId={disciplina.id} entrenadores={disponibles} />
        </Tarjeta>
      </div>

      {disciplina.tipo === "lista" ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-normal tracking-[-0.012em] text-fg">
              Lista de alumnos <span className="text-fg-muted">({inscripciones.length})</span>
            </h2>
            <Link
              href={`/coordinador/disciplinas/${disciplina.id}/importar`}
              className="inline-flex h-9 items-center rounded-control border border-line px-3 text-[13px] text-fg-body hover:bg-elevated"
            >
              Importar desde Excel
            </Link>
          </div>
          <Tarjeta>
            <FormularioInscribir disciplinaId={disciplina.id} />
          </Tarjeta>
          {inscripciones.length === 0 ? (
            <p className="text-sm text-fg-muted">Aún no hay alumnos inscritos.</p>
          ) : (
            <ul className="divide-y divide-line rounded-card px-4 shadow-[inset_0_0_0_1px_var(--line)]">
              {inscripciones.map((i) => (
                <li key={i.id}>
                  <AlumnoEditable
                    alumno={i.alumnos!}
                    editarMatricula
                    detalle={`Inscrito desde ${formatearFecha(i.fecha_alta)}`}
                    accionesExtra={
                      <BotonConfirmar
                        accion={darDeBaja}
                        campos={{ inscripcion_id: i.id }}
                        texto="Dar de baja"
                        textoConfirmar="Confirmar baja"
                      />
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <Tarjeta>
          <p className="text-sm text-fg-body">Disciplina de acceso libre: no lleva lista.</p>
          <p className="mt-1 text-[13px] text-fg-muted">
            Los alumnos se registran al llegar, en el modo kiosco del gimnasio.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

export default function PaginaDisciplina({ params }: PageProps<"/coordinador/disciplinas/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Detalle params={params} />
    </Suspense>
  );
}

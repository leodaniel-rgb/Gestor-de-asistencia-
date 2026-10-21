import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PaseDeLista, type FilaLista } from "@/components/pase-de-lista";
import { requerirUsuario } from "@/lib/auth/dal";
import { ahoraMx, fechasCapturables } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Registrar asistencia" };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("entrenador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  const [disciplinaRes, inscripcionesRes, solicitudesRes, categoriasRes] = await Promise.all([
    supabase.from("disciplinas").select("id, nombre, tipo, activa").eq("id", id.data).maybeSingle(),
    supabase
      .from("inscripciones")
      .select("alumnos(id, matricula, nombre)")
      .eq("disciplina_id", id.data)
      .is("fecha_baja", null),
    supabase
      .from("solicitudes")
      .select("id, matricula, nombre")
      .eq("disciplina_id", id.data)
      .eq("tipo", "alta")
      .eq("estado", "pendiente"),
    supabase
      .from("catalogo_opciones")
      .select("id, nombre")
      .eq("tipo", "categoria_incidencia")
      .eq("activa", true)
      .order("creado_en"),
  ]);

  const disciplina = disciplinaRes.data;
  if (!disciplina || disciplina.tipo !== "lista" || !disciplina.activa) notFound();

  const alumnos: FilaLista[] = ((inscripcionesRes.data ?? []) as unknown as {
    alumnos: { id: string; matricula: string; nombre: string } | null;
  }[])
    .flatMap((i) => (i.alumnos ? [i.alumnos] : []))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((a) => ({ clave: a.id, tipo: "alumno", nombre: a.nombre, matricula: a.matricula }));
  const pendientes: FilaLista[] = (solicitudesRes.data ?? []).map((s) => ({
    clave: s.id,
    tipo: "solicitud",
    nombre: s.nombre as string,
    matricula: s.matricula as string,
  }));

  const { fecha: hoy, hora } = ahoraMx();

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/entrenador/disciplinas/${disciplina.id}`} className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← {disciplina.nombre}
        </Link>
        <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">Registrar asistencia</h1>
      </div>
      {alumnos.length + pendientes.length === 0 ? (
        <p className="text-sm text-fg-muted">La lista está vacía. La coordinación VIVE carga la lista inicial.</p>
      ) : (
        <PaseDeLista
          modo="registrar"
          disciplinaId={disciplina.id}
          filas={[...alumnos, ...pendientes]}
          categorias={categoriasRes.data ?? []}
          fechas={fechasCapturables(hoy)}
          hoy={hoy}
          horaInicial={hora}
        />
      )}
    </>
  );
}

export default function PaginaRegistrarAsistencia({ params }: PageProps<"/entrenador/disciplinas/[id]/asistencia">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando lista…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

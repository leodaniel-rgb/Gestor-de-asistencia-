import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PaseDeLista, type FilaLista } from "@/components/pase-de-lista";
import { Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearMomento } from "@/lib/catalogos";
import { ahoraMx, describirFecha, ventanaCorreccion } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Corregir asistencia" };

type Sesion = {
  id: string;
  disciplina_id: string;
  fecha: string;
  hora_inicio: string;
  creado_en: string;
  anulada: boolean;
  disciplinas: { nombre: string } | null;
  asistencias: {
    id: string;
    estado: "asistio" | "falta";
    alumnos: { nombre: string; matricula: string } | null;
    solicitudes: { nombre: string; matricula: string; estado: string } | null;
  }[];
  incidencias: { categoria_id: string; descripcion: string | null }[];
};

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("entrenador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  const [sesionRes, categoriasRes] = await Promise.all([
    supabase
      .from("sesiones")
      .select(
        "id, disciplina_id, fecha, hora_inicio, creado_en, anulada, disciplinas(nombre), " +
          "asistencias(id, estado, alumnos(nombre, matricula), solicitudes(nombre, matricula, estado)), " +
          "incidencias(categoria_id, descripcion)",
      )
      .eq("id", id.data)
      .maybeSingle(),
    supabase
      .from("catalogo_opciones")
      .select("id, nombre")
      .eq("tipo", "categoria_incidencia")
      .eq("activa", true)
      .order("creado_en"),
  ]);
  const sesion = sesionRes.data as unknown as Sesion | null;
  if (!sesion) notFound();

  const { fecha: hoy } = ahoraMx();
  const { vence, abierta } = ventanaCorreccion(sesion.creado_en);
  const corregible = abierta && !sesion.anulada;

  const filas: FilaLista[] = sesion.asistencias
    .map((a) => {
      const p = a.alumnos ?? a.solicitudes;
      return {
        clave: a.id,
        tipo: a.alumnos ? ("alumno" as const) : ("solicitud" as const),
        nombre: p?.nombre ?? "—",
        matricula: p?.matricula ?? "",
        estadoInicial: a.estado,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/entrenador/disciplinas/${sesion.disciplina_id}`} className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← {sesion.disciplinas?.nombre}
        </Link>
        <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">
          Sesión: {describirFecha(sesion.fecha, hoy)}, {sesion.hora_inicio.slice(0, 5)}
        </h1>
        <p className="text-[13px] text-fg-muted">
          {sesion.anulada
            ? "La coordinación anuló esta sesión: no cuenta en los reportes."
            : corregible
              ? `Puedes corregirla hasta el ${formatearMomento(vence)}.`
              : "Pasaron 24 horas: solo la coordinación puede corregirla."}
        </p>
      </div>

      {corregible ? (
        <PaseDeLista
          modo="corregir"
          sesionId={sesion.id}
          disciplinaId={sesion.disciplina_id}
          fechaFija={sesion.fecha}
          hoy={hoy}
          filas={filas}
          categorias={categoriasRes.data ?? []}
          horaInicial={sesion.hora_inicio.slice(0, 5)}
          incidenciasIniciales={sesion.incidencias.map((i) => ({
            categoria_id: i.categoria_id,
            descripcion: i.descripcion ?? "",
          }))}
        />
      ) : (
        <Tarjeta>
          <ul className="flex flex-col divide-y divide-line">
            {filas.map((f) => (
              <li key={f.clave} className="flex justify-between gap-2 py-2 text-sm">
                <span className="text-fg">{f.nombre}</span>
                <span className={f.estadoInicial === "asistio" ? "text-success" : "text-danger"}>
                  {f.estadoInicial === "asistio" ? "Asistió" : "Falta"}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </>
  );
}

export default function PaginaSesion({ params }: PageProps<"/entrenador/sesiones/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

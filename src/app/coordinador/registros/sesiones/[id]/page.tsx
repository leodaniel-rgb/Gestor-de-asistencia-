import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AccionConMotivo } from "@/components/accion-con-motivo";
import { Historial } from "@/components/historial";
import { PaseDeLista, type FilaLista } from "@/components/pase-de-lista";
import { Aviso, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearMomento } from "@/lib/catalogos";
import { ahoraMx, describirFecha } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { anularSesion } from "../../acciones";

export const metadata: Metadata = { title: "Sesión" };

type Sesion = {
  id: string;
  disciplina_id: string;
  fecha: string;
  hora_inicio: string;
  creado_en: string;
  anulada: boolean;
  registro_tardio: boolean;
  capturada_por_coordinacion: boolean;
  disciplinas: { nombre: string } | null;
  entrenador: { nombre: string } | null;
  asistencias: {
    id: string;
    estado: "asistio" | "falta";
    alumnos: { nombre: string; matricula: string } | null;
    solicitudes: { nombre: string; matricula: string; estado: string } | null;
  }[];
  incidencias: { categoria_id: string; descripcion: string | null; catalogo_opciones: { nombre: string } | null }[];
};

async function Contenido({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { guardado } = await searchParams;

  const supabase = await crearClienteServidor();
  const [sesionRes, categoriasRes] = await Promise.all([
    supabase
      .from("sesiones")
      .select(
        "id, disciplina_id, fecha, hora_inicio, creado_en, anulada, registro_tardio, capturada_por_coordinacion, " +
          "disciplinas(nombre), entrenador:perfiles!sesiones_entrenador_id_fkey(nombre), " +
          "asistencias(id, estado, alumnos(nombre, matricula), solicitudes(nombre, matricula, estado)), " +
          "incidencias(categoria_id, descripcion, catalogo_opciones(nombre))",
      )
      .eq("id", id.data)
      .maybeSingle(),
    supabase.from("catalogo_opciones").select("id, nombre").eq("tipo", "categoria_incidencia").order("creado_en"),
  ]);
  const s = sesionRes.data as unknown as Sesion | null;
  if (!s) notFound();
  const hoy = ahoraMx().fecha;

  const filas: FilaLista[] = s.asistencias
    .map((a) => {
      const p = a.alumnos ?? a.solicitudes;
      const rechazada = !a.alumnos && a.solicitudes?.estado === "rechazada";
      return {
        clave: a.id,
        tipo: a.alumnos ? ("alumno" as const) : ("solicitud" as const),
        nombre: (p?.nombre ?? "—") + (rechazada ? " (solicitud rechazada: no cuenta)" : ""),
        matricula: p?.matricula ?? "",
        estadoInicial: a.estado,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/coordinador/registros" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Registros
        </Link>
        <h1 className={`text-[28px] font-normal tracking-[-0.022em] ${s.anulada ? "text-fg-faint line-through" : "text-fg"}`}>
          {s.disciplinas?.nombre} · {describirFecha(s.fecha, hoy)}, {s.hora_inicio.slice(0, 5)}
        </h1>
        <p className="text-[13px] text-fg-muted">
          {s.capturada_por_coordinacion ? "Capturada por coordinación" : `Registrada por ${s.entrenador?.nombre}`} el{" "}
          {formatearMomento(s.creado_en)}
          {s.registro_tardio && " · Registro tardío"}
        </p>
      </div>

      {guardado && <Aviso tono="exito">Cambios guardados.</Aviso>}

      {s.anulada ? (
        <>
          <Aviso>Sesión anulada: no cuenta en reportes. Restáurala para poder corregirla.</Aviso>
          <Tarjeta>
            <ul className="flex flex-col divide-y divide-line">
              {filas.map((f) => (
                <li key={f.clave} className="flex justify-between gap-2 py-2 text-sm">
                  <span className="text-fg-muted">{f.nombre}</span>
                  <span className="text-fg-faint">{f.estadoInicial === "asistio" ? "Asistió" : "Falta"}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </>
      ) : (
        <PaseDeLista
            modo="admin-corregir"
            sesionId={s.id}
            disciplinaId={s.disciplina_id}
            fechaFija={s.fecha}
            hoy={hoy}
            filas={filas}
            categorias={categoriasRes.data ?? []}
            horaInicial={s.hora_inicio.slice(0, 5)}
            incidenciasIniciales={s.incidencias.map((i) => ({
              categoria_id: i.categoria_id,
              descripcion: i.descripcion ?? "",
            }))}
          />
      )}

      <AccionConMotivo
        accion={anularSesion}
        campos={{ id: s.id, anular: String(!s.anulada) }}
        texto={s.anulada ? "Restaurar sesión" : "Anular sesión"}
        textoConfirmar={s.anulada ? "Restaurar" : "Anular"}
        peligro={!s.anulada}
      />

      <Historial entidad="sesiones" id={s.id} />
    </div>
  );
}

export default function PaginaSesionAdmin({ params, searchParams }: PageProps<"/coordinador/registros/sesiones/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

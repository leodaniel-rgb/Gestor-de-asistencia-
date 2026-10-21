import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AlumnoEditable, type AlumnoFila } from "@/components/alumno-editable";
import { BotonConfirmar } from "@/components/boton-confirmar";
import { Aviso, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { ahoraMx, describirFecha, ventanaCorreccion } from "@/lib/fechas";
import { describirDias, formatearHora, formatearMomento, type TipoDisciplina } from "@/lib/catalogos";
import { ETIQUETA_TURNO, type NombreTurno } from "@/lib/gimnasio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { solicitarBaja } from "./actions";
import { SugerirAlumno } from "./sugerir";

export const metadata: Metadata = { title: "Lista de alumnos" };

type Solicitud = {
  id: string;
  tipo: "alta" | "baja";
  estado: "pendiente" | "aprobada" | "rechazada";
  matricula: string | null;
  nombre: string | null;
  inscripcion_id: string | null;
  motivo_rechazo: string | null;
  creado_en: string;
  inscripciones: { alumnos: { nombre: string } | null } | null;
};

const ESTILO_ESTADO = {
  pendiente: "text-info",
  aprobada: "text-success",
  rechazada: "text-danger",
} as const;

type SesionReciente = {
  id: string;
  fecha: string;
  hora_inicio: string;
  registro_tardio: boolean;
  creado_en: string;
  asistencias: { estado: "asistio" | "falta" }[];
};

async function Lista({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requerirUsuario("entrenador");
  const id = z.uuid().safeParse((await params).id);
  const avisos = await searchParams;
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  // RLS: si la disciplina no es suya, no devuelve nada → 404.
  const [disciplinaRes, inscripcionesRes, solicitudesRes, sesionesRes, turnosRes] = await Promise.all([
    supabase.from("disciplinas").select("id, nombre, tipo, dias_clase").eq("id", id.data).maybeSingle(),
    supabase
      .from("inscripciones")
      .select("id, alumnos(id, matricula, nombre, genero)")
      .eq("disciplina_id", id.data)
      .is("fecha_baja", null),
    supabase
      .from("solicitudes")
      .select(
        "id, tipo, estado, matricula, nombre, inscripcion_id, motivo_rechazo, creado_en, inscripciones(alumnos(nombre))",
      )
      .eq("disciplina_id", id.data)
      .order("creado_en", { ascending: false })
      .limit(20),
    supabase
      .from("sesiones")
      .select("id, fecha, hora_inicio, registro_tardio, creado_en, asistencias(estado)")
      .eq("disciplina_id", id.data)
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false })
      .limit(10),
    supabase
      .from("turnos_gimnasio")
      .select("id, fecha, nombre, abierto_en, cerrado_en, cierre_automatico, registros_gimnasio(salida)")
      .eq("disciplina_id", id.data)
      .order("abierto_en", { ascending: false })
      .limit(10),
  ]);

  const disciplina = disciplinaRes.data as
    | { id: string; nombre: string; tipo: TipoDisciplina; dias_clase: number[] }
    | null;
  if (!disciplina) notFound();

  const solicitudes = (solicitudesRes.data ?? []) as unknown as Solicitud[];
  const bajasPendientes = new Set(
    solicitudes.filter((s) => s.tipo === "baja" && s.estado === "pendiente").map((s) => s.inscripcion_id),
  );

  const sesiones = (sesionesRes.data ?? []) as unknown as SesionReciente[];
  const turnos = (turnosRes.data ?? []) as unknown as {
    id: string;
    fecha: string;
    nombre: NombreTurno | null;
    abierto_en: string;
    cerrado_en: string | null;
    cierre_automatico: boolean;
    registros_gimnasio: { salida: string | null }[];
  }[];
  const { fecha: hoy } = ahoraMx();

  const inscripciones = ((inscripcionesRes.data ?? []) as unknown as { id: string; alumnos: AlumnoFila | null }[])
    .filter((i): i is { id: string; alumnos: AlumnoFila } => i.alumnos !== null)
    .sort((a, b) => a.alumnos.nombre.localeCompare(b.alumnos.nombre, "es"));

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
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-medium text-fg">Turnos recientes</h2>
          <p className="text-[13px] text-fg-muted">El gimnasio se abre y se cierra desde “Mis disciplinas”.</p>
          {turnos.length === 0 ? (
            <Tarjeta>
              <p className="text-sm text-fg-muted">Aún no hay turnos registrados.</p>
            </Tarjeta>
          ) : (
            <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-[inset_0_0_0_1px_var(--line)]">
              {turnos.map((t) => {
                const sinSalida = t.registros_gimnasio.filter((x) => !x.salida).length;
                return (
                  <li key={t.id} className="flex flex-col gap-0.5 py-3">
                    <span className="text-sm text-fg">
                      {describirFecha(t.fecha, hoy)}
                      {t.nombre && ` · ${ETIQUETA_TURNO[t.nombre]}`} · {formatearHora(t.abierto_en)}
                      {t.cerrado_en ? ` – ${formatearHora(t.cerrado_en)}` : " · abierto"}
                    </span>
                    <span className="text-[13px] text-fg-muted">
                      {t.registros_gimnasio.length} entradas
                      {t.cerrado_en && sinSalida > 0 && <span className="text-info"> · {sinSalida} sin salida</span>}
                      {t.cierre_automatico && <span className="text-info"> · Cerrado automáticamente</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <>
          {avisos.registrada && <Aviso tono="exito">Asistencia guardada.</Aviso>}
          {avisos.corregida && <Aviso tono="exito">Corrección guardada.</Aviso>}
          <Link
            href={`/entrenador/disciplinas/${disciplina.id}/asistencia`}
            className="inline-flex h-12 w-full items-center justify-center rounded-control bg-accent px-4 text-[15px] font-medium text-on-accent hover:opacity-90 sm:w-fit"
          >
            Registrar asistencia
          </Link>

          {sesiones.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-medium text-fg">Sesiones recientes</h2>
              <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-[inset_0_0_0_1px_var(--line)]">
                {sesiones.map((s) => {
                  const asistieron = s.asistencias.filter((a) => a.estado === "asistio").length;
                  const corregible = ventanaCorreccion(s.creado_en).abierta;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/entrenador/sesiones/${s.id}`}
                        className="flex items-center justify-between gap-2 py-3 hover:opacity-80"
                      >
                        <span className="flex flex-col">
                          <span className="text-sm text-fg">
                            {describirFecha(s.fecha, hoy)}, {s.hora_inicio.slice(0, 5)}
                            {s.registro_tardio && <span className="text-[13px] text-info"> · Registro tardío</span>}
                          </span>
                          <span className="text-[13px] text-fg-muted">
                            {asistieron} de {s.asistencias.length} asistieron
                          </span>
                        </span>
                        <span className="text-[13px] text-fg-muted">{corregible ? "Corregir →" : "Ver →"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <SugerirAlumno disciplinaId={disciplina.id} />

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-medium text-fg">
              Lista de alumnos <span className="text-fg-muted">({inscripciones.length})</span>
            </h2>
            {inscripciones.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Aún no hay alumnos en la lista. La coordinación VIVE carga la lista inicial.
              </p>
            ) : (
              <>
                <p className="text-[13px] text-fg-muted">
                  Puedes corregir nombre y género. Si un alumno ya no asiste, repórtalo y la coordinación decidirá.
                </p>
                <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-[inset_0_0_0_1px_var(--line)]">
                  {inscripciones.map((i) => (
                    <li key={i.id}>
                      <AlumnoEditable
                        alumno={i.alumnos}
                        accionesExtra={
                          bajasPendientes.has(i.id) ? (
                            <span className="self-center text-[13px] text-info">Baja solicitada</span>
                          ) : (
                            <BotonConfirmar
                              accion={solicitarBaja}
                              campos={{ disciplina_id: disciplina.id, inscripcion_id: i.id }}
                              texto="Ya no asiste"
                              textoConfirmar="Reportar baja"
                            />
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {solicitudes.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-medium text-fg">Solicitudes recientes</h2>
              <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-[inset_0_0_0_1px_var(--line)]">
                {solicitudes.map((s) => (
                  <li key={s.id} className="flex flex-col gap-0.5 py-3">
                    <span className="text-sm text-fg">
                      {s.tipo === "alta"
                        ? `Alta: ${s.nombre} (${s.matricula})`
                        : `Baja: ${s.inscripciones?.alumnos?.nombre ?? "alumno"}`}
                    </span>
                    <span className="text-[13px] text-fg-muted">
                      <span className={ESTILO_ESTADO[s.estado]}>
                        {s.estado.charAt(0).toUpperCase() + s.estado.slice(1)}
                      </span>
                      {" · "}
                      {formatearMomento(s.creado_en)}
                      {s.motivo_rechazo && ` · Motivo: ${s.motivo_rechazo}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function PaginaListaEntrenador({
  params,
  searchParams,
}: PageProps<"/entrenador/disciplinas/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Lista params={params} searchParams={searchParams} />
    </Suspense>
  );
}

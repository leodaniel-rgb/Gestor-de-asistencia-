import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { describirDias, formatearHora, type TipoDisciplina } from "@/lib/catalogos";
import { ahoraMx, diaSemanaIso } from "@/lib/fechas";
import { ETIQUETA_TURNO, sugerirTurno, type NombreTurno } from "@/lib/gimnasio";
import { AbrirGimnasio, TurnoAbierto } from "./gimnasio-tarjeta";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Recordatorio } from "./recordatorio";

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
  const { fecha: hoy, hora } = ahoraMx();
  const diaHoy = diaSemanaIso(hoy);

  const supabase = await crearClienteServidor();
  // RLS limita todo a las disciplinas asignadas a este entrenador.
  const [disciplinasRes, sesionesRes, sinClaseRes, motivosRes, turnosRes] = await Promise.all([
    supabase
      .from("disciplinas")
      .select("id, nombre, tipo, dias_clase, inscripciones(count)")
      .eq("activa", true)
      .is("inscripciones.fecha_baja", null)
      .order("nombre"),
    supabase.from("sesiones").select("disciplina_id").eq("fecha", hoy),
    supabase.from("dias_sin_clase").select("disciplina_id, catalogo_opciones(nombre)").eq("fecha", hoy),
    supabase
      .from("catalogo_opciones")
      .select("id, nombre")
      .eq("tipo", "motivo_sin_clase")
      .eq("activa", true)
      .order("creado_en"),
    supabase
      .from("turnos_gimnasio")
      .select("id, disciplina_id, nombre, abierto_en, registros_gimnasio(salida)")
      .is("cerrado_en", null),
  ]);

  const filas = (disciplinasRes.data ?? []) as unknown as Fila[];
  const sesionesHoy = new Map<string, number>();
  for (const s of sesionesRes.data ?? []) {
    sesionesHoy.set(s.disciplina_id, (sesionesHoy.get(s.disciplina_id) ?? 0) + 1);
  }
  const sinClaseHoy = new Map(
    ((sinClaseRes.data ?? []) as unknown as { disciplina_id: string; catalogo_opciones: { nombre: string } | null }[]).map(
      (d) => [d.disciplina_id, d.catalogo_opciones?.nombre ?? null],
    ),
  );
  const motivos = motivosRes.data ?? [];
  const turnosAbiertos = new Map(
    ((turnosRes.data ?? []) as unknown as {
      id: string;
      disciplina_id: string;
      nombre: NombreTurno | null;
      abierto_en: string;
      registros_gimnasio: { salida: string | null }[];
    }[]).map((t) => [t.disciplina_id, t]),
  );

  // Primero las que hoy son día habitual y aún no tienen respuesta.
  const pendienteHoy = (d: Fila) =>
    d.tipo === "lista" && d.dias_clase.includes(diaHoy) && !sesionesHoy.has(d.id) && !sinClaseHoy.has(d.id);
  const ordenadas = [...filas].sort((a, b) => Number(pendienteHoy(b)) - Number(pendienteHoy(a)));

  return (
    <>
      <h1 className="text-2xl font-medium tracking-[-0.012em] text-fg">Hola, {usuario.nombre}</h1>
      {disciplinasRes.error ? (
        <p className="text-sm text-danger">No se pudieron cargar tus disciplinas.</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Aún no tienes disciplinas asignadas. Pide a la coordinación VIVE que te asigne.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {ordenadas.map((d) => {
            const alumnos = d.inscripciones[0]?.count ?? 0;
            const registradas = sesionesHoy.get(d.id) ?? 0;
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]"
              >
                <Link href={`/entrenador/disciplinas/${d.id}`} className="flex flex-col gap-1 hover:opacity-80">
                  <span className="text-lg font-medium text-fg">{d.nombre}</span>
                  <span className="text-[13px] text-fg-muted">
                    {d.tipo === "lista" ? `${alumnos} alumnos · ` : "Acceso libre · "}
                    {describirDias(d.dias_clase)}
                  </span>
                </Link>

                {d.tipo === "acceso_libre" &&
                  (() => {
                    const turno = turnosAbiertos.get(d.id);
                    if (!turno) return <AbrirGimnasio disciplinaId={d.id} sugerido={sugerirTurno(hora)} />;
                    const dentro = turno.registros_gimnasio.filter((x) => !x.salida).length;
                    return (
                      <>
                        <p className="text-sm text-success">
                          ● Turno abierto{turno.nombre ? ` (${ETIQUETA_TURNO[turno.nombre]})` : ""} desde{" "}
                          {formatearHora(turno.abierto_en)} · {turno.registros_gimnasio.length}{" "}
                          entradas · {dentro} dentro
                        </p>
                        <TurnoAbierto turnoId={turno.id} />
                      </>
                    );
                  })()}

                {d.tipo === "lista" &&
                  (registradas > 0 ? (
                    <p className="text-sm text-success">
                      ✓ Asistencia registrada hoy{registradas > 1 ? ` (${registradas} sesiones)` : ""}
                    </p>
                  ) : sinClaseHoy.has(d.id) ? (
                    <p className="text-sm text-fg-muted">
                      Hoy: no hubo clase{sinClaseHoy.get(d.id) ? ` (${sinClaseHoy.get(d.id)})` : ""}
                    </p>
                  ) : alumnos === 0 ? (
                    <p className="text-[13px] text-fg-muted">La lista está vacía.</p>
                  ) : (
                    <Recordatorio
                      disciplinaId={d.id}
                      disciplinaNombre={d.nombre}
                      destacado={d.dias_clase.includes(diaHoy)}
                      motivos={motivos}
                    />
                  ))}
              </li>
            );
          })}
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

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Grafica } from "@/components/graficas/grafica";
import { MapaCalor } from "@/components/graficas/mapa-calor";
import { Aviso } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { DIAS, formatearHora } from "@/lib/catalogos";
import { ahoraMx, describirFecha } from "@/lib/fechas";
import { ETIQUETA_TURNO, type NombreTurno } from "@/lib/gimnasio";
import { registrarError } from "@/lib/registro";
import {
  concurrencia,
  entradasPorDiaYTurno,
  etiquetaDia,
  ETIQUETA_GENERO_CORTA,
  horaPico,
  porActividad,
  porDia,
  resumenListas,
  valorSesion,
  type EntradaGimnasio,
  type SesionReporte,
} from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraFiltros } from "./barra-filtros";
import { consultaFiltros, describirRango, leerFiltros, type Filtros, type Params } from "./filtros";

export const metadata: Metadata = { title: "Reportes" };

function Indicador({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
      <span className="text-2xl font-medium tracking-[-0.012em] text-fg">{valor}</span>
      <span className="text-xs uppercase tracking-wide text-fg-muted">{etiqueta}</span>
      {detalle && <span className="text-xs text-fg-faint">{detalle}</span>}
    </div>
  );
}

/** Aviso de alumnos marcados por la coordinación como "no contar en reportes". */
function Excluidos({ n }: { n: number }) {
  if (!n) return null;
  return (
    <p className="text-[13px] text-info">
      {n === 1 ? "1 alumno marcado" : `${n} alumnos marcados`} como “No cuenta en reportes” no se incluye
      {n === 1 ? "" : "n"} (ver su nota en el directorio de alumnos).
    </p>
  );
}

// ---------------------------------------------------------------------------

async function DashboardListas({ f }: { f: Filtros }) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_listas", {
    p_desde: f.desde,
    p_hasta: f.hasta,
    p_disciplinas: f.disciplina ? [f.disciplina] : null,
    p_dias: f.dias,
  });
  if (error) {
    registrarError("reportes:listas", error);
    return <Aviso>No se pudo generar el reporte.</Aviso>;
  }
  const r = data as {
    sesiones: SesionReporte[];
    incidencias: { fecha: string; disciplina: string; categoria: string; descripcion: string | null }[];
    sin_clase: { fecha: string; disciplina: string; motivo: string | null }[];
    pendientes: number;
    excluidos: number;
  };
  const hoy = ahoraMx().fecha;
  const rango = describirRango(f);
  const corto = f.periodo !== "mes" && f.periodo !== "libre";
  const que = f.estado === "asistio" ? "Asistencia" : "Faltas";
  const quien = f.genero === "todos" ? "" : ` · ${ETIQUETA_GENERO_CORTA[f.genero]}`;
  const subtitulo = `${rango}${quien}`;
  const res = resumenListas(r.sesiones, f.estado, f.genero);
  const actividad = porActividad(r.sesiones, f.estado, f.genero);
  const dias = porDia(r.sesiones, f.desde, f.hasta, f.estado, f.genero, f.dias);
  const porCategoria = new Map<string, number>();
  for (const i of r.incidencias) porCategoria.set(i.categoria, (porCategoria.get(i.categoria) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      {r.pendientes > 0 && (
        <p className="text-[13px] text-info">
          {r.pendientes} asistencias de alumnos pendientes de aprobación no se incluyen (ver Solicitudes).
        </p>
      )}
      <Excluidos n={r.excluidos} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Indicador etiqueta={f.estado === "asistio" ? "Registros de asistencia" : "Faltas"} valor={String(res.total)} />
        <Indicador etiqueta="Promedio por sesión" valor={res.promedioPorSesion?.toFixed(1) ?? "—"} />
        <Indicador
          etiqueta="Pico"
          valor={res.pico ? String(res.pico.total) : "—"}
          detalle={res.pico ? describirFecha(res.pico.fecha, hoy) : undefined}
        />
        <Indicador
          etiqueta="Mujeres / Hombres"
          valor={`${res.porGenero.f} / ${res.porGenero.m}`}
          detalle={`No binario ${res.porGenero.nb} · Sin asignar ${res.porGenero.sa}`}
        />
        <Indicador etiqueta="Sesiones registradas" valor={String(res.sesiones)} />
        <Indicador
          etiqueta="% de asistencia"
          valor={res.porcentajeAsistencia === null ? "—" : `${res.porcentajeAsistencia}%`}
          detalle={`${res.faltas} faltas`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafica
          titulo={`${que} por actividad`}
          subtitulo={subtitulo}
          categorias={actividad.map((a) => a.etiqueta)}
          series={[{ nombre: que, valores: actividad.map((a) => a.valor), color: 0 }]}
          tipos={actividad.length > 6 ? ["barras-h", "barras"] : ["barras", "barras-h"]}
          nombreArchivo={`por-actividad-${f.desde}`}
        />
        <Grafica
          titulo={`${que} por día`}
          subtitulo={subtitulo}
          categorias={dias.map((d) => etiquetaDia(d.fecha, corto))}
          series={[{ nombre: que, valores: dias.map((d) => d.valor), color: 0 }]}
          tipos={["lineas", "barras"]}
          nombreArchivo={`por-dia-${f.desde}`}
        />
        {f.genero === "todos" && (
          <Grafica
            titulo={`${que} por género`}
            subtitulo={rango}
            categorias={["Mujeres", "Hombres", "No binario", "Sin asignar"]}
            series={[
              {
                nombre: que,
                valores: [res.porGenero.f, res.porGenero.m, res.porGenero.nb, res.porGenero.sa],
                color: 0,
              },
            ]}
            coloresCategorias={[0, 1, 2, "neutro"]}
            tipos={["pastel", "barras"]}
            nombreArchivo={`por-genero-${f.desde}`}
          />
        )}
        <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)] print:break-inside-avoid">
          <h2 className="text-[15px] font-medium text-fg">Reporte de incidencias</h2>
          {r.incidencias.length === 0 ? (
            <p className="text-sm text-fg-muted">• Sin incidencias</p>
          ) : (
            <>
              <p className="text-[13px] text-fg-muted">
                {[...porCategoria].map(([c, n]) => `${c}: ${n}`).join(" · ")}
              </p>
              <ul className="flex max-h-64 flex-col divide-y divide-line overflow-auto">
                {r.incidencias.map((i, k) => (
                  <li key={k} className="py-2 text-sm">
                    <span className="text-fg">
                      {i.categoria} · {i.disciplina}
                    </span>{" "}
                    <span className="text-[13px] text-fg-muted">({describirFecha(i.fecha, hoy)})</span>
                    {i.descripcion && <p className="text-[13px] text-fg-body">{i.descripcion}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]">
        <h2 className="text-[15px] font-medium text-fg">Detalle de asistencia por sesión</h2>
        {r.sesiones.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin sesiones en este periodo.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[13px] text-fg-muted">
                  {["Día", "Actividad", "Hora", "Total", "Mujeres", "Hombres", "No binario", "Sin asignar", "Faltas"].map((h) => (
                    <th key={h} className={`py-2 pr-4 font-normal ${["Día", "Actividad", "Hora"].includes(h) ? "" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.sesiones.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 text-fg-body">{describirFecha(s.fecha, hoy)}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/coordinador/registros/sesiones/${s.id}`} className="text-fg hover:underline">
                        {s.disciplina}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-fg-body">{s.hora}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg">{valorSesion(s, "asistio", "todos")}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-body">{s.asistio.f}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-body">{s.asistio.m}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-body">{s.asistio.nb}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-body">{s.asistio.sa}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-body">{valorSesion(s, "falta", "todos")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-fg-faint">
              Total semanal: {res.asistencias} registros | Mujeres: {res.porGenero.f} | Hombres: {res.porGenero.m} | No binario:{" "}
              {res.porGenero.nb} | Sin asignar: {res.porGenero.sa}
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]">
        <h2 className="text-[15px] font-medium text-fg">Días sin clase</h2>
        {r.sin_clase.length === 0 ? (
          <p className="text-sm text-fg-muted">Ningún entrenador marcó “No hubo clase” en este periodo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {r.sin_clase.map((d, k) => (
              <li key={k} className="flex justify-between gap-2 py-2 text-sm">
                <span className="text-fg">{d.disciplina}</span>
                <span className="text-[13px] text-fg-muted">
                  {describirFecha(d.fecha, hoy)} · {d.motivo ?? "Sin motivo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function DashboardGimnasio({ f }: { f: Filtros }) {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_gimnasio", {
    p_desde: f.desde,
    p_hasta: f.hasta,
    p_disciplinas: f.disciplina ? [f.disciplina] : null,
    p_dias: f.dias,
    p_incluir_corregidas: f.corregidas,
  });
  if (error) {
    registrarError("reportes:gimnasio", error);
    return <Aviso>No se pudo generar el reporte.</Aviso>;
  }
  const r = data as {
    turnos: { id: string; fecha: string; nombre: NombreTurno | null; abierto_en: string; cerrado_en: string | null; entradas: number; sin_salida: number }[];
    entradas: EntradaGimnasio[];
    alumnos_distintos: number;
    sin_salida: number;
    promedio_minutos: number | null;
    top: { nombre: string; matricula: string; visitas: number }[];
    excluidos: number;
  };
  const hoy = ahoraMx().fecha;
  const rango = describirRango(f);
  const corto = f.periodo !== "mes" && f.periodo !== "libre";
  const porDiaTurno = entradasPorDiaYTurno(r.entradas, f.desde, f.hasta, f.dias);
  const calor = concurrencia(r.entradas);
  const pico = horaPico(r.entradas);
  const hayTurnoSinNombre = porDiaTurno.some((d) => d.sinNombre > 0);
  const porDiaSemana = DIAS.map((d) => r.entradas.filter((e) => e.dia === d.valor).length);

  return (
    <div className="flex flex-col gap-6">
      <Excluidos n={r.excluidos} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Indicador etiqueta="Entradas" valor={String(r.entradas.length)} />
        <Indicador etiqueta="Alumnos distintos" valor={String(r.alumnos_distintos)} />
        <Indicador
          etiqueta="Tiempo promedio"
          valor={r.promedio_minutos === null ? "—" : `${Math.round(r.promedio_minutos)} min`}
          detalle={f.corregidas ? "Incluye salidas corregidas" : "Solo salidas registradas"}
        />
        <Indicador etiqueta="Sin salida" valor={String(r.sin_salida)} />
        <Indicador etiqueta="Turnos" valor={String(r.turnos.length)} />
        <Indicador
          etiqueta="Hora pico"
          valor={pico ? `${String(pico.hora).padStart(2, "0")}:00` : "—"}
          detalle={pico ? `${DIAS[pico.dia - 1].largo} · ${pico.valor} entradas` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafica
          titulo="Entradas por día y turno"
          subtitulo={rango}
          categorias={porDiaTurno.map((d) => etiquetaDia(d.fecha, corto))}
          series={[
            { nombre: "Mañana", valores: porDiaTurno.map((d) => d.manana), color: 0 },
            { nombre: "Tarde", valores: porDiaTurno.map((d) => d.tarde), color: 1 },
            ...(hayTurnoSinNombre
              ? [{ nombre: "Solo hora", valores: porDiaTurno.map((d) => d.sinNombre), color: 2 as const }]
              : []),
          ]}
          apiladas
          tipos={["barras", "lineas"]}
          nombreArchivo={`gimnasio-por-dia-${f.desde}`}
        />
        <Grafica
          titulo="Días más concurridos"
          subtitulo={rango}
          categorias={DIAS.map((d) => d.largo)}
          series={[{ nombre: "Entradas", valores: porDiaSemana, color: 0 }]}
          tipos={["barras", "barras-h"]}
          nombreArchivo={`gimnasio-dias-${f.desde}`}
        />
      </div>

      <MapaCalor
        titulo="Concurrencia por día y hora"
        subtitulo={rango}
        horas={calor.horas}
        celdas={calor.celdas}
        maximo={calor.maximo}
        nombreArchivo={`gimnasio-concurrencia-${f.desde}`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]">
          <h2 className="text-[15px] font-medium text-fg">Alumnos que más asisten</h2>
          {r.top.length === 0 ? (
            <p className="text-sm text-fg-muted">Sin entradas en este periodo.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-line">
              {r.top.map((a, i) => (
                <li key={a.matricula} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-fg">
                    {i + 1}. {a.nombre} <span className="font-mono text-[13px] text-fg-muted">{a.matricula}</span>
                  </span>
                  <span className="tabular-nums text-fg-body">{a.visitas} visitas</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)]">
          <h2 className="text-[15px] font-medium text-fg">Turnos</h2>
          {r.turnos.length === 0 ? (
            <p className="text-sm text-fg-muted">Sin turnos en este periodo.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-fg-muted">
                    <th className="py-2 pr-4 font-normal">Fecha</th>
                    <th className="py-2 pr-4 font-normal">Turno</th>
                    <th className="py-2 pr-4 font-normal">Horario</th>
                    <th className="py-2 pr-4 text-right font-normal">Entradas</th>
                    <th className="py-2 pr-4 text-right font-normal">Sin salida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.turnos.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-4 text-fg-body">
                        <Link href={`/coordinador/registros/turnos/${t.id}`} className="hover:underline">
                          {describirFecha(t.fecha, hoy)}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-fg-body">{t.nombre ? ETIQUETA_TURNO[t.nombre] : "—"}</td>
                      <td className="py-2 pr-4 tabular-nums text-fg-body">
                        {formatearHora(t.abierto_en)}
                        {t.cerrado_en ? ` – ${formatearHora(t.cerrado_en)}` : " · abierto"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-fg">{t.entradas}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-fg-body">{t.sin_salida || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

async function Contenido({ searchParams }: { searchParams: Promise<Params> }) {
  await requerirUsuario("coordinador");
  const f = leerFiltros(await searchParams);

  const supabase = await crearClienteServidor();
  const { data: disciplinas } = await supabase
    .from("disciplinas")
    .select("id, nombre, tipo")
    .eq("tipo", f.vista === "gimnasio" ? "acceso_libre" : "lista")
    .order("nombre");

  const enlace = (vista: string) => `/coordinador/reportes?vista=${vista}&periodo=${f.periodo}&desde=${f.desde}&hasta=${f.hasta}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">
            {f.vista === "gimnasio" ? "Dashboard del gimnasio" : "Dashboard de asistencia · Talleres | Selecciones"}
          </h1>
          <p className="text-sm text-fg-muted">{describirRango(f)}</p>
        </div>
        <nav className="flex gap-1 text-[13px] print:hidden" aria-label="Dashboard">
          {(["listas", "gimnasio"] as const).map((v) => (
            <Link
              key={v}
              href={enlace(v)}
              className={`rounded-full px-3 py-1.5 ${v === f.vista ? "bg-white/10 text-fg" : "text-fg-muted hover:bg-white/5"}`}
            >
              {v === "listas" ? "Selecciones y talleres" : "Gimnasio"}
            </Link>
          ))}
        </nav>
      </div>
      <BarraFiltros f={f} disciplinas={disciplinas ?? []} />
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <a
          href={`/coordinador/reportes/excel?${consultaFiltros(f)}`}
          className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated"
        >
          Descargar Excel
        </a>
        <Link
          href={`/coordinador/reportes/general?${consultaFiltros(f)}`}
          className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated"
        >
          Reporte general (imagen)
        </Link>
        <span className="text-xs text-fg-faint">
          Datos editables con los filtros actuales{f.vista === "listas" ? ", incluida una hoja por alumno" : ""}. Contiene
          datos personales: guárdalo solo en el almacenamiento institucional.
        </span>
      </div>
      {f.error && <Aviso>{f.error}</Aviso>}
      {f.vista === "gimnasio" ? <DashboardGimnasio f={f} /> : <DashboardListas f={f} />}
      <p className="text-xs text-fg-faint print:hidden">
        Para guardar todo el dashboard en PDF: Ctrl + P (o ⌘ + P) → “Guardar como PDF”.
      </p>
    </>
  );
}

export default function PaginaReportes({ searchParams }: PageProps<"/coordinador/reportes">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-sm text-fg-muted">Generando reporte…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

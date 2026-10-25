import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { DIAS, describirDias } from "@/lib/catalogos";
import { ahoraMx } from "@/lib/fechas";
import { type NombreTurno } from "@/lib/gimnasio";
import { registrarError } from "@/lib/registro";
import {
  concurrencia,
  entradasPorDiaYTurno,
  etiquetaDia,
  horaPico,
  MAX_SESIONES_DETALLE,
  porActividad,
  porDia,
  resumenListas,
  resumenPorActividad,
  sinSalidaPorDia,
  valorSesion,
  type ConteoGenero,
  type EntradaGimnasio,
  type ResumenListas,
  type SesionReporte,
} from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { consultaFiltros, describirRango, leerFiltros, type Filtros, type Params } from "../filtros";
import { LaminaGeneral, type DatosGimnasio, type DatosListas, type Indicador } from "./lamina";

export const metadata: Metadata = { title: "Reporte general" };

const numero = (n: number) => n.toLocaleString("es-MX");
const generado = () => {
  const { fecha, hora } = ahoraMx();
  return `Generado el ${fecha} a las ${hora} · Gestor de asistencia VIVE`;
};

/** Rango, disciplina y días elegidos, para el subtítulo de la imagen. */
function subtitulo(f: Filtros, disciplina: string | null): string {
  return [describirRango(f), disciplina, f.dias ? describirDias(f.dias) : null].filter(Boolean).join(" · ");
}

function indicadoresListas(r: ResumenListas, estado: "asistio" | "falta", corto: boolean): Indicador[] {
  const que = estado === "asistio" ? "asistencia" : "faltas";
  return [
    { etiqueta: estado === "asistio" ? "Registros de asistencia" : "Faltas", valor: numero(r.total) },
    { etiqueta: "Promedio por sesión", valor: r.promedioPorSesion?.toFixed(1) ?? "—" },
    { etiqueta: `Pico · ${que}`, valor: r.pico ? numero(r.pico.total) : "—", detalle: r.pico ? etiquetaDia(r.pico.fecha, corto) : undefined },
    {
      etiqueta: "Mujeres / Hombres",
      valor: `${r.porGenero.f} / ${r.porGenero.m}`,
      detalle: `No binario ${r.porGenero.nb} · Sin asignar ${r.porGenero.sa}`,
    },
    { etiqueta: "Sesiones registradas", valor: numero(r.sesiones) },
    { etiqueta: "% de asistencia", valor: r.porcentajeAsistencia === null ? "—" : `${r.porcentajeAsistencia}%` },
  ];
}

async function datosListas(f: Filtros, disciplina: string | null): Promise<DatosListas | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_listas", {
    p_desde: f.desde,
    p_hasta: f.hasta,
    p_disciplinas: f.disciplina ? [f.disciplina] : null,
    p_dias: f.dias,
  });
  if (error) {
    registrarError("reportes:general-listas", error);
    return null;
  }
  const r = data as {
    sesiones: SesionReporte[];
    incidencias: { categoria: string }[];
    sin_clase: unknown[];
    pendientes: number;
    excluidos: number;
  };
  const corto = f.periodo !== "mes" && f.periodo !== "libre";
  const a = resumenListas(r.sesiones, "asistio", "todos");
  const x = resumenListas(r.sesiones, "falta", "todos");

  const faltasPorActividad = new Map(porActividad(r.sesiones, "falta", "todos").map((p) => [p.etiqueta, p.valor]));
  const actividades = porActividad(r.sesiones, "asistio", "todos").map((p) => ({
    etiqueta: p.etiqueta,
    asistio: p.valor,
    falta: faltasPorActividad.get(p.etiqueta) ?? 0,
  }));
  const faltasPorDia = porDia(r.sesiones, f.desde, f.hasta, "falta", "todos", f.dias);
  const dias = porDia(r.sesiones, f.desde, f.hasta, "asistio", "todos", f.dias).map((d, i) => ({
    etiqueta: etiquetaDia(d.fecha, corto),
    asistio: d.valor,
    falta: faltasPorDia[i].valor,
  }));

  const porCategoria = new Map<string, number>();
  for (const i of r.incidencias) porCategoria.set(i.categoria, (porCategoria.get(i.categoria) ?? 0) + 1);
  const incidencias = [...porCategoria].map(([c, n]) => `${c}: ${n}`);
  if (incidencias.length === 0) incidencias.push("Sin incidencias");
  incidencias.push(`Días sin clase registrados: ${r.sin_clase.length}`);

  const tabla =
    r.sesiones.length <= MAX_SESIONES_DETALLE
      ? {
          titulo: "Detalle de asistencia por sesión",
          columnas: ["Día", "Actividad", "Hora", "Asistencias", "Mujeres", "Hombres", "No binario", "Sin asignar", "Faltas"],
          numericas: 6,
          filas: r.sesiones.map((s) => [
            etiquetaDia(s.fecha, corto),
            s.disciplina,
            s.hora,
            numero(valorSesion(s, "asistio", "todos")),
            numero(s.asistio.f),
            numero(s.asistio.m),
            numero(s.asistio.nb),
            numero(s.asistio.sa),
            numero(valorSesion(s, "falta", "todos")),
          ]),
        }
      : {
          titulo: `Detalle por actividad (${numero(r.sesiones.length)} sesiones)`,
          columnas: ["Actividad", "Sesiones", "Asistencias", "Faltas", "% de asistencia"],
          numericas: 4,
          filas: resumenPorActividad(r.sesiones).map((p) => [
            p.disciplina,
            numero(p.sesiones),
            numero(p.asistencias),
            numero(p.faltas),
            p.porcentaje === null ? "—" : `${p.porcentaje}%`,
          ]),
        };
  if (tabla.filas.length === 0) tabla.filas.push(["Sin sesiones en este periodo", ...Array(tabla.columnas.length - 1).fill("")]);

  const notas = [
    `Total: ${numero(a.asistencias)} asistencias y ${numero(a.faltas)} faltas`,
    r.pendientes ? `${r.pendientes} asistencias pendientes de aprobación no incluidas` : null,
    r.excluidos ? `${r.excluidos} alumnos marcados como "no contar" excluidos` : null,
    generado(),
  ];

  return {
    tipo: "listas",
    titulo: "Dashboard de asistencia · Talleres | Selecciones",
    rango: subtitulo(f, disciplina),
    pie: notas.filter(Boolean).join(" · "),
    asistio: { indicadores: indicadoresListas(a, "asistio", corto), genero: a.porGenero },
    falta: { indicadores: indicadoresListas(x, "falta", corto), genero: x.porGenero },
    ambas: [
      { etiqueta: "Asistencias", valor: numero(a.asistencias) },
      { etiqueta: "Faltas", valor: numero(a.faltas) },
      { etiqueta: "% de asistencia", valor: a.porcentajeAsistencia === null ? "—" : `${a.porcentajeAsistencia}%` },
      { etiqueta: "Promedio de asistencia", valor: a.promedioPorSesion?.toFixed(1) ?? "—", detalle: "por sesión" },
      {
        etiqueta: "Mujeres / Hombres",
        valor: `${a.porGenero.f} / ${a.porGenero.m}`,
        detalle: `Asistencias · No binario ${a.porGenero.nb} · Sin asignar ${a.porGenero.sa}`,
      },
      { etiqueta: "Sesiones registradas", valor: numero(a.sesiones) },
    ],
    actividades,
    dias,
    incidencias,
    tabla,
  };
}

async function datosGimnasio(f: Filtros, disciplina: string | null): Promise<DatosGimnasio | null> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("reporte_gimnasio", {
    p_desde: f.desde,
    p_hasta: f.hasta,
    p_disciplinas: f.disciplina ? [f.disciplina] : null,
    p_dias: f.dias,
    p_incluir_corregidas: f.corregidas,
  });
  if (error) {
    registrarError("reportes:general-gimnasio", error);
    return null;
  }
  // El top de alumnos no se usa: la imagen no lleva nombres ni matrículas.
  const r = data as {
    turnos: { fecha: string; nombre: NombreTurno | null; sin_salida: number }[];
    entradas: EntradaGimnasio[];
    alumnos_distintos: number;
    por_genero: ConteoGenero;
    sin_salida: number;
    promedio_minutos: number | null;
    excluidos: number;
  };
  const corto = f.periodo !== "mes" && f.periodo !== "libre";
  const porDiaTurno = entradasPorDiaYTurno(r.entradas, f.desde, f.hasta, f.dias);
  const pico = horaPico(r.entradas);
  const sinSalida = sinSalidaPorDia(r.turnos, f.desde, f.hasta, f.dias);

  return {
    tipo: "gimnasio",
    titulo: "Dashboard del gimnasio",
    rango: subtitulo(f, disciplina),
    pie: [
      `Entradas: ${numero(r.entradas.length)} · Salidas no marcadas: ${numero(r.sin_salida)}`,
      r.excluidos ? `${r.excluidos} alumnos marcados como "no contar" excluidos` : null,
      generado(),
    ]
      .filter(Boolean)
      .join(" · "),
    indicadores: [
      { etiqueta: "Entradas", valor: numero(r.entradas.length) },
      { etiqueta: "Alumnos distintos", valor: numero(r.alumnos_distintos) },
      {
        etiqueta: "Tiempo promedio",
        valor: r.promedio_minutos === null ? "—" : `${Math.round(r.promedio_minutos)} min`,
        detalle: f.corregidas ? "Incluye salidas corregidas" : "Solo salidas registradas",
      },
      { etiqueta: "Sin salida", valor: numero(r.sin_salida) },
      { etiqueta: "Turnos", valor: numero(r.turnos.length) },
      {
        etiqueta: "Hora pico",
        valor: pico ? `${String(pico.hora).padStart(2, "0")}:00` : "—",
        detalle: pico ? `${DIAS[pico.dia - 1].largo} · ${pico.valor} entradas` : undefined,
      },
    ],
    porDiaTurno: {
      categorias: porDiaTurno.map((d) => etiquetaDia(d.fecha, corto)),
      series: [
        { nombre: "Mañana", valores: porDiaTurno.map((d) => d.manana), color: 0 },
        { nombre: "Tarde", valores: porDiaTurno.map((d) => d.tarde), color: 1 },
        ...(porDiaTurno.some((d) => d.sinNombre > 0)
          ? [{ nombre: "Solo hora", valores: porDiaTurno.map((d) => d.sinNombre), color: 2 as const }]
          : []),
      ],
    },
    diasSemana: { categorias: DIAS.map((d) => d.largo), valores: DIAS.map((d) => r.entradas.filter((e) => e.dia === d.valor).length) },
    sinSalida: { categorias: sinSalida.map((d) => etiquetaDia(d.fecha, corto)), valores: sinSalida.map((d) => d.valor) },
    calor: concurrencia(r.entradas),
    genero: r.por_genero,
  };
}

async function Contenido({ searchParams }: { searchParams: Promise<Params> }) {
  await requerirUsuario("coordinador");
  const f = leerFiltros(await searchParams);

  let disciplina: string | null = null;
  if (f.disciplina) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase.from("disciplinas").select("nombre").eq("id", f.disciplina).maybeSingle();
    disciplina = data?.nombre ?? null;
  }
  const datos = f.vista === "gimnasio" ? await datosGimnasio(f, disciplina) : await datosListas(f, disciplina);

  return (
    <>
      <div className="flex flex-col gap-1 print:hidden">
        <Link href={`/coordinador/reportes?${consultaFiltros(f)}`} className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Volver al dashboard
        </Link>
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">
          Reporte general · {f.vista === "gimnasio" ? "Gimnasio" : "Selecciones y talleres"}
        </h1>
        <p className="text-sm text-fg-muted">
          Todas las gráficas del periodo en una sola imagen, con fondo claro. Para cambiar el periodo o los filtros, vuelve al
          dashboard.{f.vista === "gimnasio" && " No incluye el top de alumnos (datos personales)."}
        </p>
      </div>
      {f.error && <Aviso>{f.error}</Aviso>}
      {datos ? (
        <LaminaGeneral datos={datos} nombreArchivo={`reporte-general-${f.vista}-${f.desde}`} />
      ) : (
        <Aviso>No se pudo generar el reporte.</Aviso>
      )}
    </>
  );
}

export default function PaginaReporteGeneral({ searchParams }: PageProps<"/coordinador/reportes/general">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-sm text-fg-muted">Generando reporte…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

import type { NextRequest } from "next/server";
import { obtenerUsuario } from "@/lib/auth/dal";
import { DIAS } from "@/lib/catalogos";
import { ETIQUETA_ESTADO_EXCEL, ETIQUETA_GENERO_EXCEL, generarExcel, respuestaExcel, type Hoja } from "@/lib/excel";
import { ETIQUETA_TURNO } from "@/lib/gimnasio";
import { registrarError } from "@/lib/registro";
import {
  concurrencia,
  entradasPorDiaYTurno,
  resumenListas,
  valorSesion,
  type EntradaGimnasio,
  type SesionReporte,
} from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { describirRango, leerFiltros, type Params } from "../filtros";

/** Excel editable del reporte, con los mismos filtros que el dashboard. */
export async function GET(request: NextRequest) {
  const usuario = await obtenerUsuario();
  if (!usuario || usuario.rol !== "coordinador" || usuario.debeCambiarPassword) {
    return new Response("No autorizado", { status: 403 });
  }

  const params: Params = {};
  for (const clave of new Set(request.nextUrl.searchParams.keys())) {
    const valores = request.nextUrl.searchParams.getAll(clave);
    params[clave] = valores.length > 1 ? valores : valores[0];
  }
  const f = leerFiltros(params);
  const args = { p_desde: f.desde, p_hasta: f.hasta, p_disciplinas: f.disciplina ? [f.disciplina] : null, p_dias: f.dias };
  const supabase = await crearClienteServidor();
  const encabezadoPeriodo: Hoja["filas"] = [["Periodo", describirRango(f)], ["Desde", f.desde], ["Hasta", f.hasta]];

  let hojas: Hoja[];
  if (f.vista === "gimnasio") {
    const { data, error } = await supabase.rpc("reporte_gimnasio", { ...args, p_incluir_corregidas: f.corregidas });
    if (error) {
      registrarError("excel:gimnasio", error);
      return new Response("No se pudo generar el Excel", { status: 500 });
    }
    const r = data as {
      turnos: { fecha: string; nombre: "manana" | "tarde" | null; abierto_en: string; cerrado_en: string | null; entradas: number; sin_salida: number }[];
      entradas: EntradaGimnasio[];
      alumnos_distintos: number;
      sin_salida: number;
      promedio_minutos: number | null;
      top: { nombre: string; matricula: string; visitas: number }[];
    };
    const hora = (ts: string | null) =>
      ts ? new Intl.DateTimeFormat("es-MX", { timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(ts)) : "";
    const calor = concurrencia(r.entradas);
    hojas = [
      {
        nombre: "Resumen",
        encabezados: ["Indicador", "Valor"],
        filas: [
          ...encabezadoPeriodo,
          ["Entradas", r.entradas.length],
          ["Alumnos distintos", r.alumnos_distintos],
          ["Tiempo promedio (min)", r.promedio_minutos],
          ["Incluye salidas corregidas", f.corregidas ? "Sí" : "No"],
          ["Sin salida", r.sin_salida],
          ["Turnos", r.turnos.length],
          ...r.top.map((a, i) => [`Top ${i + 1}`, `${a.nombre} (${a.matricula}) · ${a.visitas} visitas`]),
        ],
      },
      {
        nombre: "Turnos",
        encabezados: ["Fecha", "Turno", "Apertura", "Cierre", "Entradas", "Sin salida"],
        filas: r.turnos.map((t) => [t.fecha, t.nombre ? ETIQUETA_TURNO[t.nombre] : "Solo hora", hora(t.abierto_en), hora(t.cerrado_en), t.entradas, t.sin_salida]),
      },
      {
        nombre: "Entradas por día y turno",
        encabezados: ["Fecha", "Mañana", "Tarde", "Solo hora", "Total"],
        filas: entradasPorDiaYTurno(r.entradas, f.desde, f.hasta, f.dias).map((d) => [
          d.fecha, d.manana, d.tarde, d.sinNombre, d.manana + d.tarde + d.sinNombre,
        ]),
      },
      {
        nombre: "Concurrencia",
        encabezados: ["Día", ...calor.horas.map((h) => `${String(h).padStart(2, "0")}:00`)],
        filas: DIAS.map((d) => [d.largo, ...calor.horas.map((h) => calor.celdas.find((c) => c.dia === d.valor && c.hora === h)?.valor ?? 0)]),
      },
    ];
  } else {
    const [reporte, detalle] = await Promise.all([
      supabase.rpc("reporte_listas", args),
      supabase.rpc("reporte_asistencias_detalle", args),
    ]);
    if (reporte.error || detalle.error) {
      registrarError("excel:listas", reporte.error ?? detalle.error);
      return new Response("No se pudo generar el Excel", { status: 500 });
    }
    const r = reporte.data as {
      sesiones: SesionReporte[];
      incidencias: { fecha: string; disciplina: string; categoria: string; descripcion: string | null }[];
      sin_clase: { fecha: string; disciplina: string; motivo: string | null }[];
      pendientes: number;
    };
    const filasDetalle = detalle.data as {
      fecha: string; hora: string; disciplina: string; matricula: string; nombre: string; genero: string | null; estado: string;
    }[];
    const res = resumenListas(r.sesiones, "asistio", "todos");
    hojas = [
      {
        nombre: "Resumen",
        encabezados: ["Indicador", "Valor"],
        filas: [
          ...encabezadoPeriodo,
          ["Registros de asistencia", res.asistencias],
          ["Faltas", res.faltas],
          ["% de asistencia", res.porcentajeAsistencia],
          ["Promedio por sesión", res.promedioPorSesion],
          ["Pico (día)", res.pico ? `${res.pico.fecha} · ${res.pico.total}` : null],
          ["Mujeres", res.porGenero.f],
          ["Hombres", res.porGenero.m],
          ["No binario", res.porGenero.nb],
          ["Sin asignar", res.porGenero.sa],
          ["Sesiones registradas", res.sesiones],
          ["Asistencias pendientes de aprobación (no incluidas)", r.pendientes],
        ],
      },
      {
        nombre: "Por sesión",
        encabezados: ["Fecha", "Actividad", "Hora", "Total", "Mujeres", "Hombres", "No binario", "Sin asignar", "Faltas"],
        filas: r.sesiones.map((s) => [
          s.fecha, s.disciplina, s.hora, valorSesion(s, "asistio", "todos"),
          s.asistio.f, s.asistio.m, s.asistio.nb, s.asistio.sa, valorSesion(s, "falta", "todos"),
        ]),
      },
      {
        nombre: "Por alumno",
        encabezados: ["Fecha", "Hora", "Actividad", "Matrícula", "Nombre", "Género", "Estado"],
        filas: filasDetalle.map((a) => [
          a.fecha, a.hora, a.disciplina, a.matricula, a.nombre,
          a.genero ? ETIQUETA_GENERO_EXCEL[a.genero] : "Sin asignar", ETIQUETA_ESTADO_EXCEL[a.estado] ?? a.estado,
        ]),
      },
      {
        nombre: "Incidencias",
        encabezados: ["Fecha", "Actividad", "Categoría", "Descripción"],
        filas: r.incidencias.map((i) => [i.fecha, i.disciplina, i.categoria, i.descripcion]),
      },
      {
        nombre: "Días sin clase",
        encabezados: ["Fecha", "Actividad", "Motivo"],
        filas: r.sin_clase.map((d) => [d.fecha, d.disciplina, d.motivo ?? "Sin motivo"]),
      },
    ];
  }

  // Sin registro en la bitácora no hay descarga: toda salida de datos queda auditada.
  const { error: errorRegistro } = await supabase.rpc("registrar_exportacion", {
    p_tipo: f.vista === "gimnasio" ? "reporte_gimnasio" : "reporte_listas",
  });
  if (errorRegistro) {
    registrarError("excel:registrar", errorRegistro);
    return new Response("No se pudo registrar la exportación", { status: 500 });
  }
  const buffer = await generarExcel(hojas);

  const prefijo = f.vista === "gimnasio" ? "gimnasio" : "asistencia";
  return respuestaExcel(buffer, `${prefijo}-${f.desde}-a-${f.hasta}.xlsx`);
}

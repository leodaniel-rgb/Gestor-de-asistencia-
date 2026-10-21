import { obtenerUsuario } from "@/lib/auth/dal";
import { DIAS } from "@/lib/catalogos";
import { ETIQUETA_ESTADO_EXCEL, ETIQUETA_GENERO_EXCEL, generarExcel, respuestaExcel, siNo } from "@/lib/excel";
import { ahoraMx } from "@/lib/fechas";
import { ETIQUETA_TURNO } from "@/lib/gimnasio";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

type Fila = Record<string, unknown>;

const hora = (ts: unknown) =>
  typeof ts === "string"
    ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(ts))
    : null;
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Respaldo completo en Excel. Se genera al vuelo y no se guarda en ningún lado. */
export async function GET() {
  const usuario = await obtenerUsuario();
  if (!usuario || usuario.rol !== "coordinador" || usuario.debeCambiarPassword) {
    return new Response("No autorizado", { status: 403 });
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("respaldo_completo");
  if (error || !data) {
    registrarError("respaldo:generar", error);
    return new Response("No se pudo generar el respaldo", { status: 500 });
  }

  // Sin registro en la bitácora no hay descarga.
  const { error: errorRegistro } = await supabase.rpc("registrar_exportacion", { p_tipo: "respaldo" });
  if (errorRegistro) {
    registrarError("respaldo:registrar", errorRegistro);
    return new Response("No se pudo registrar el respaldo", { status: 500 });
  }

  const r = data as Record<string, Fila[]> & { generado_en: string };
  const dias = (v: unknown) =>
    Array.isArray(v) && v.length
      ? v.map((d) => DIAS.find((x) => x.valor === d)?.largo ?? d).join(", ")
      : "Sin días fijos";

  const buffer = await generarExcel([
    {
      nombre: "Respaldo",
      encabezados: ["Dato", "Valor"],
      filas: [
        ["Generado", hora(r.generado_en)],
        ["Generado por", usuario.nombre],
        ["Aviso", "Contiene datos personales. Guárdalo solo en el almacenamiento institucional (OneDrive/SharePoint)."],
      ],
    },
    {
      nombre: "Disciplinas",
      encabezados: ["Nombre", "Tipo", "Días habituales", "Activa", "Creada"],
      filas: r.disciplinas.map((d) => [
        texto(d.nombre), d.tipo === "acceso_libre" ? "Acceso libre" : "Con lista", dias(d.dias_clase), siNo(d.activa), hora(d.creado_en),
      ]),
    },
    {
      nombre: "Entrenadores",
      encabezados: ["Nombre", "Correo", "Activo", "Disciplinas"],
      filas: r.entrenadores.map((e) => [texto(e.nombre), texto(e.correo), siNo(e.activo), texto(e.disciplinas)]),
    },
    {
      nombre: "Alumnos",
      encabezados: ["Matrícula", "Nombre", "Género", "Registrado"],
      filas: r.alumnos.map((a) => [
        texto(a.matricula), texto(a.nombre), a.genero ? ETIQUETA_GENERO_EXCEL[String(a.genero)] : "Sin asignar", hora(a.creado_en),
      ]),
    },
    {
      nombre: "Inscripciones",
      encabezados: ["Disciplina", "Matrícula", "Nombre", "Alta", "Baja"],
      filas: r.inscripciones.map((i) => [texto(i.disciplina), texto(i.matricula), texto(i.nombre), texto(i.fecha_alta), texto(i.fecha_baja)]),
    },
    {
      nombre: "Asistencias",
      encabezados: [
        "Fecha", "Hora", "Disciplina", "Matrícula", "Nombre", "Estado",
        "Sesión anulada", "Pendiente de aprobación", "Registro tardío", "Capturada por coordinación", "Registrada por",
      ],
      filas: r.asistencias.map((a) => [
        texto(a.fecha), texto(a.hora), texto(a.disciplina), texto(a.matricula), texto(a.nombre),
        ETIQUETA_ESTADO_EXCEL[String(a.estado)] ?? texto(a.estado),
        siNo(a.sesion_anulada), siNo(a.pendiente_de_aprobacion), siNo(a.registro_tardio),
        siNo(a.capturada_por_coordinacion), texto(a.registrada_por),
      ]),
    },
    {
      nombre: "Incidencias",
      encabezados: ["Fecha", "Disciplina", "Categoría", "Descripción", "Sesión anulada"],
      filas: r.incidencias.map((i) => [texto(i.fecha), texto(i.disciplina), texto(i.categoria), texto(i.descripcion), siNo(i.sesion_anulada)]),
    },
    {
      nombre: "Días sin clase",
      encabezados: ["Fecha", "Disciplina", "Motivo", "Anulado"],
      filas: r.dias_sin_clase.map((d) => [texto(d.fecha), texto(d.disciplina), texto(d.motivo) ?? "Sin motivo", siNo(d.anulado)]),
    },
    {
      nombre: "Gimnasio",
      encabezados: ["Fecha", "Turno", "Matrícula", "Nombre", "Entrada", "Salida", "Salida corregida", "Anulado"],
      filas: r.gimnasio.map((g) => [
        texto(g.fecha), g.turno ? ETIQUETA_TURNO[g.turno as "manana" | "tarde"] : "Solo hora", texto(g.matricula), texto(g.nombre),
        hora(g.entrada), hora(g.salida), siNo(g.salida_corregida), siNo(g.anulado),
      ]),
    },
    {
      nombre: "Solicitudes",
      encabezados: ["Fecha", "Tipo", "Estado", "Disciplina", "Matrícula", "Nombre", "Motivo de rechazo"],
      filas: r.solicitudes.map((s) => [
        hora(s.creado_en), s.tipo === "alta" ? "Alta" : "Baja", texto(s.estado), texto(s.disciplina), texto(s.matricula), texto(s.nombre), texto(s.motivo_rechazo),
      ]),
    },
  ]);

  return respuestaExcel(buffer, `respaldo-asistencia-vive-${ahoraMx().fecha}.xlsx`);
}

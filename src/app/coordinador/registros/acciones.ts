"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { GENEROS } from "@/lib/catalogos";
import { ahoraMx } from "@/lib/fechas";
import { normalizarMatricula } from "@/lib/matricula";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAdmin = { error?: string; ok?: string };

const esquemaMotivo = z
  .string()
  .trim()
  .min(5, "Escribe el motivo de la corrección (mínimo 5 caracteres).")
  .max(300, "Máximo 300 caracteres.");
const esquemaHora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida.");
const ESTADOS = ["asistio", "falta"] as const;
const esquemaIncidencias = z
  .array(z.object({ categoria_id: z.uuid("Elige una categoría."), descripcion: z.string().trim().max(500).optional() }))
  .max(10);

function mensajeError(error: { code?: string; message?: string }, contexto: string): string {
  if (error.code === "22023") return error.message ?? "Datos no válidos.";
  if (error.code === "23505") return "Esa matrícula ya pertenece a otro alumno.";
  if (error.code === "42501") return "No tienes permiso para esta corrección.";
  registrarError(contexto, error);
  return "No se pudo guardar. Intenta de nuevo.";
}

async function rpc(nombre: string, args: Record<string, unknown>, contexto: string): Promise<EstadoAdmin> {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(nombre, args);
  if (error) return { error: mensajeError(error, contexto) };
  refresh();
  return { ok: "Cambio guardado." };
}

// --- Sesiones ---------------------------------------------------------------

const esquemaCorreccion = z.object({
  sesion_id: z.uuid(),
  hora: esquemaHora,
  marcas: z.array(z.object({ id: z.uuid(), estado: z.enum(ESTADOS) })),
  incidencias: esquemaIncidencias,
  motivo: esquemaMotivo,
});

export async function corregirSesionAdmin(datos: z.input<typeof esquemaCorreccion>): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = esquemaCorreccion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message };
  const res = await rpc(
    "admin_corregir_sesion",
    {
      p_sesion: r.data.sesion_id,
      p_hora: r.data.hora,
      p_marcas: r.data.marcas,
      p_incidencias: r.data.incidencias,
      p_motivo: r.data.motivo,
    },
    "admin:corregir-sesion",
  );
  if (res.error) return res;
  redirect(`/coordinador/registros/sesiones/${r.data.sesion_id}?guardado=1`);
}

const esquemaCaptura = z.object({
  disciplina_id: z.uuid(),
  fecha: z.iso.date("Fecha no válida."),
  hora: esquemaHora,
  marcas: z
    .array(
      z.union([
        z.object({ alumno_id: z.uuid(), estado: z.enum(ESTADOS) }),
        z.object({ solicitud_id: z.uuid(), estado: z.enum(ESTADOS) }),
      ]),
    )
    .min(1),
  incidencias: esquemaIncidencias,
  motivo: esquemaMotivo,
});

export async function capturarSesionAdmin(datos: z.input<typeof esquemaCaptura>): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = esquemaCaptura.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message };
  if (r.data.fecha > ahoraMx().fecha) return { error: "No se pueden capturar fechas futuras." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("admin_capturar_sesion", {
    p_disciplina: r.data.disciplina_id,
    p_fecha: r.data.fecha,
    p_hora: r.data.hora,
    p_marcas: r.data.marcas,
    p_incidencias: r.data.incidencias,
    p_motivo: r.data.motivo,
  });
  if (error || !data) return { error: mensajeError(error ?? {}, "admin:capturar") };
  redirect(`/coordinador/registros/sesiones/${data}?guardado=1`);
}

const esquemaAnular = z.object({ id: z.uuid(), anular: z.enum(["true", "false"]), motivo: esquemaMotivo });

function leerAnulacion(formData: FormData) {
  return esquemaAnular.safeParse({
    id: formData.get("id"),
    anular: formData.get("anular"),
    motivo: formData.get("motivo"),
  });
}

export async function anularSesion(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = leerAnulacion(formData);
  if (!r.success) return { error: r.error.issues[0]?.message };
  return rpc(
    "admin_anular_sesion",
    { p_sesion: r.data.id, p_anular: r.data.anular === "true", p_motivo: r.data.motivo },
    "admin:anular-sesion",
  );
}

export async function anularSinClase(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = leerAnulacion(formData);
  if (!r.success) return { error: r.error.issues[0]?.message };
  return rpc(
    "admin_anular_sin_clase",
    { p_id: r.data.id, p_anular: r.data.anular === "true", p_motivo: r.data.motivo },
    "admin:anular-sin-clase",
  );
}

// --- Gimnasio ---------------------------------------------------------------

export async function cerrarTurnoAdmin(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = z
    .object({ id: z.uuid(), motivo: esquemaMotivo })
    .safeParse({ id: formData.get("id"), motivo: formData.get("motivo") });
  if (!r.success) return { error: r.error.issues[0]?.message };
  return rpc("admin_cerrar_turno", { p_turno: r.data.id, p_motivo: r.data.motivo }, "admin:cerrar-turno");
}

export async function anularRegistroGimnasio(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = leerAnulacion(formData);
  if (!r.success) return { error: r.error.issues[0]?.message };
  return rpc(
    "admin_anular_registro_gimnasio",
    { p_registro: r.data.id, p_anular: r.data.anular === "true", p_motivo: r.data.motivo },
    "admin:anular-registro",
  );
}

export async function corregirSalida(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = z
    .object({ id: z.uuid(), fecha: z.iso.date(), hora: esquemaHora, motivo: esquemaMotivo })
    .safeParse({
      id: formData.get("id"),
      fecha: formData.get("fecha"),
      hora: formData.get("hora"),
      motivo: formData.get("motivo"),
    });
  if (!r.success) return { error: r.error.issues[0]?.message };
  // San Luis Potosí: UTC-6 todo el año (México eliminó el horario de verano en 2022).
  const salida = `${r.data.fecha}T${r.data.hora}:00-06:00`;
  return rpc(
    "admin_corregir_salida",
    { p_registro: r.data.id, p_salida: salida, p_motivo: r.data.motivo },
    "admin:corregir-salida",
  );
}

// --- Alumnos ----------------------------------------------------------------

export async function actualizarAlumnoAdmin(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = z
    .object({
      id: z.uuid(),
      matricula: z.string(),
      nombre: z.string().trim().min(2, "Escribe el nombre completo.").max(120),
      genero: z.union([z.enum(GENEROS), z.literal("")]),
      motivo: esquemaMotivo,
    })
    .safeParse({
      id: formData.get("id"),
      matricula: formData.get("matricula"),
      nombre: formData.get("nombre"),
      genero: formData.get("genero") ?? "",
      motivo: formData.get("motivo"),
    });
  if (!r.success) return { error: r.error.issues[0]?.message };
  const m = normalizarMatricula(r.data.matricula);
  if (m.estado !== "valida") return { error: "Escribe la matrícula completa: AL + 8 dígitos (ej. AL07210101)." };

  return rpc(
    "admin_actualizar_alumno",
    {
      p_alumno: r.data.id,
      p_matricula: m.matricula,
      p_nombre: r.data.nombre,
      p_genero: r.data.genero || null,
      p_motivo: r.data.motivo,
    },
    "admin:actualizar-alumno",
  );
}

// --- Nota de coordinación y exclusión de reportes ----------------------------

export async function guardarNotaAlumno(_p: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  await requerirUsuario("coordinador");
  const r = z
    .object({
      id: z.uuid(),
      nota: z.string().trim().max(300, "La nota admite máximo 300 caracteres."),
      excluir: z.boolean(),
      motivo: z.string().trim().max(300, "Máximo 300 caracteres."),
    })
    .safeParse({
      id: formData.get("id"),
      nota: formData.get("nota") ?? "",
      excluir: formData.get("excluir") === "on",
      motivo: formData.get("motivo") ?? "",
    });
  if (!r.success) return { error: r.error.issues[0]?.message };
  if (r.data.excluir && r.data.nota.length < 5) {
    return { error: "Para no contarlo en reportes escribe una nota (mínimo 5 caracteres)." };
  }

  return rpc(
    "admin_nota_alumno",
    { p_alumno: r.data.id, p_nota: r.data.nota, p_excluir: r.data.excluir, p_motivo: r.data.motivo || null },
    "admin:nota-alumno",
  );
}

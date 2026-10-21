"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { ahoraMx, fechasCapturables } from "@/lib/fechas";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

const ESTADOS = ["asistio", "falta"] as const;
const esquemaHora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida.");
const esquemaIncidencias = z
  .array(
    z.object({
      categoria_id: z.uuid("Elige una categoría."),
      descripcion: z.string().trim().max(500).optional(),
    }),
  )
  .max(10);

const esquemaRegistro = z.object({
  disciplina_id: z.uuid(),
  fecha: z.string(),
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
});

export type ResultadoAsistencia = { error?: string };

export async function registrarAsistencia(
  datos: z.input<typeof esquemaRegistro>,
): Promise<ResultadoAsistencia> {
  await requerirUsuario("entrenador");
  const r = esquemaRegistro.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos no válidos." };
  if (!fechasCapturables(ahoraMx().fecha).includes(r.data.fecha)) {
    return { error: "Solo puedes registrar hoy o hasta 3 días atrás." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_sesion", {
    p_disciplina: r.data.disciplina_id,
    p_fecha: r.data.fecha,
    p_hora: r.data.hora,
    p_marcas: r.data.marcas,
    p_incidencias: r.data.incidencias,
  });
  if (error) {
    registrarError("asistencia:registrar", error);
    return {
      error:
        error.code === "22023"
          ? "La lista cambió mientras la llenabas (alguien fue dado de alta o de baja). Recarga la página."
          : "No se guardó la asistencia. Revisa tu conexión e intenta de nuevo.",
    };
  }
  redirect(`/entrenador/disciplinas/${r.data.disciplina_id}?registrada=1`);
}

const esquemaCorreccion = z.object({
  sesion_id: z.uuid(),
  disciplina_id: z.uuid(),
  hora: esquemaHora,
  marcas: z.array(z.object({ id: z.uuid(), estado: z.enum(ESTADOS) })),
  incidencias: esquemaIncidencias,
});

export async function corregirAsistencia(
  datos: z.input<typeof esquemaCorreccion>,
): Promise<ResultadoAsistencia> {
  await requerirUsuario("entrenador");
  const r = esquemaCorreccion.safeParse(datos);
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Datos no válidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("corregir_sesion", {
    p_sesion: r.data.sesion_id,
    p_hora: r.data.hora,
    p_marcas: r.data.marcas,
    p_incidencias: r.data.incidencias,
  });
  if (error) {
    registrarError("asistencia:corregir", error);
    return {
      error:
        error.code === "42501"
          ? "Esta sesión ya no se puede corregir (pasaron 24 horas). Pide el cambio a la coordinación."
          : "No se guardó la corrección. Intenta de nuevo.",
    };
  }
  redirect(`/entrenador/disciplinas/${r.data.disciplina_id}?corregida=1`);
}

export type EstadoSinClase = { error?: string };

/** Respuesta "No hubo clase" del recordatorio (solo para hoy). */
export async function marcarSinClase(
  _previo: EstadoSinClase,
  formData: FormData,
): Promise<EstadoSinClase> {
  await requerirUsuario("entrenador");
  const datos = z
    .object({ disciplina_id: z.uuid(), motivo_id: z.union([z.uuid(), z.literal("")]) })
    .safeParse({ disciplina_id: formData.get("disciplina_id"), motivo_id: formData.get("motivo_id") ?? "" });
  if (!datos.success) return { error: "Datos no válidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("dias_sin_clase").insert({
    disciplina_id: datos.data.disciplina_id,
    fecha: ahoraMx().fecha,
    motivo_id: datos.data.motivo_id || null,
  });
  if (error && error.code !== "23505") {
    registrarError("asistencia:sin-clase", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  refresh();
  return {};
}

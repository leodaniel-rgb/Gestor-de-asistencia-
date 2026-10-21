"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { esquemaGenero, esquemaNombre } from "@/lib/catalogos";
import { normalizarMatricula } from "@/lib/matricula";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoSugerencia = {
  error?: string;
  ok?: string;
  errores?: Record<string, string[]>;
  confirmarMatricula?: string;
  valores?: Record<string, string>;
};

/** El entrenador sugiere un alumno nuevo; la coordinación lo aprueba. */
export async function sugerirAlta(
  _previo: EstadoSugerencia,
  formData: FormData,
): Promise<EstadoSugerencia> {
  await requerirUsuario("entrenador");

  const valores = {
    matricula: String(formData.get("matricula") ?? ""),
    nombre: String(formData.get("nombre") ?? ""),
    genero: String(formData.get("genero") ?? ""),
  };
  const disciplinaId = z.uuid().safeParse(formData.get("disciplina_id"));
  if (!disciplinaId.success) return { error: "Disciplina no válida." };

  const r = normalizarMatricula(valores.matricula);
  if (r.estado === "invalida") {
    return { valores, errores: { matricula: ["Matrícula no válida: 8 dígitos con el 0 al inicio."] } };
  }
  if (r.estado === "confirmar" && formData.get("confirmada") !== r.matricula) {
    return { valores, confirmarMatricula: r.matricula };
  }

  const datos = z
    .object({ nombre: esquemaNombre, genero: esquemaGenero })
    .safeParse({ nombre: valores.nombre, genero: valores.genero });
  if (!datos.success) return { valores, errores: z.flattenError(datos.error).fieldErrors };

  // RLS valida que la disciplina sea del entrenador y que quede pendiente a su nombre.
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("solicitudes").insert({
    tipo: "alta",
    disciplina_id: disciplinaId.data,
    matricula: r.matricula,
    nombre: datos.data.nombre,
    genero: datos.data.genero,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya hay una sugerencia pendiente para esa matrícula." };
    registrarError("solicitudes:alta", error);
    return { valores, error: "No se pudo enviar la sugerencia." };
  }

  refresh();
  return { ok: `Sugerencia enviada (${r.matricula}). La coordinación la revisará.` };
}

/** El entrenador reporta que un alumno ya no asiste; la coordinación decide. */
export async function solicitarBaja(formData: FormData): Promise<void> {
  await requerirUsuario("entrenador");
  const datos = z
    .object({ disciplina_id: z.uuid(), inscripcion_id: z.uuid() })
    .safeParse({
      disciplina_id: formData.get("disciplina_id"),
      inscripcion_id: formData.get("inscripcion_id"),
    });
  if (!datos.success) return;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("solicitudes").insert({ tipo: "baja", ...datos.data });
  // 23505: ya había una solicitud de baja pendiente; no es un error para el usuario.
  if (error && error.code !== "23505") registrarError("solicitudes:baja", error);
  refresh();
}

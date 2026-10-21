"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { esquemaGenero, esquemaNombre } from "@/lib/catalogos";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAlumno = { error?: string; ok?: boolean; errores?: Record<string, string[]> };

const esquema = z.object({
  id: z.uuid(),
  nombre: esquemaNombre,
  genero: esquemaGenero,
});

/**
 * El entrenador corrige nombre y género de alumnos inscritos en sus
 * disciplinas (RLS). La coordinación corrige con motivo en la ficha del alumno.
 */
export async function actualizarAlumno(
  _previo: EstadoAlumno,
  formData: FormData,
): Promise<EstadoAlumno> {
  await requerirUsuario("entrenador");

  const datos = esquema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    genero: formData.get("genero") ?? "",
  });
  if (!datos.success) return { errores: z.flattenError(datos.error).fieldErrors };

  const cambios = { nombre: datos.data.nombre, genero: datos.data.genero };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("alumnos")
    .update(cambios)
    .eq("id", datos.data.id)
    .select("id");

  if (error) {
    registrarError("alumnos:actualizar", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  if (!data?.length) return { error: "No tienes permiso para editar a este alumno." };

  refresh();
  return { ok: true };
}

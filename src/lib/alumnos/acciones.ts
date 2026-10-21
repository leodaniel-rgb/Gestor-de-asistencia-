"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { esquemaGenero, esquemaNombre } from "@/lib/catalogos";
import { normalizarMatricula } from "@/lib/matricula";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoAlumno = { error?: string; ok?: boolean; errores?: Record<string, string[]> };

const esquema = z.object({
  id: z.uuid(),
  nombre: esquemaNombre,
  genero: esquemaGenero,
});

/**
 * Corrige nombre y género. Coordinador: cualquier alumno (y también la
 * matrícula). Entrenador: solo alumnos inscritos en sus disciplinas (RLS).
 */
export async function actualizarAlumno(
  _previo: EstadoAlumno,
  formData: FormData,
): Promise<EstadoAlumno> {
  const usuario = await requerirUsuario();

  const datos = esquema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    genero: formData.get("genero") ?? "",
  });
  if (!datos.success) return { errores: z.flattenError(datos.error).fieldErrors };

  const cambios: { nombre: string; genero: string | null; matricula?: string } = {
    nombre: datos.data.nombre,
    genero: datos.data.genero,
  };

  const matriculaEntrada = formData.get("matricula");
  if (usuario.rol === "coordinador" && typeof matriculaEntrada === "string" && matriculaEntrada) {
    const r = normalizarMatricula(matriculaEntrada);
    if (r.estado !== "valida") {
      return { errores: { matricula: ["Escribe la matrícula completa: AL + 8 dígitos (ej. AL07210101)."] } };
    }
    cambios.matricula = r.matricula;
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("alumnos")
    .update(cambios)
    .eq("id", datos.data.id)
    .select("id");

  if (error) {
    registrarError("alumnos:actualizar", error);
    if (error.code === "23505") return { error: "Esa matrícula ya pertenece a otro alumno." };
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  if (!data?.length) return { error: "No tienes permiso para editar a este alumno." };

  refresh();
  return { ok: true };
}

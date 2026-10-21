"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import {
  esquemaGenero,
  esquemaNombre,
  hoyMx,
  TIPOS_DISCIPLINA,
} from "@/lib/catalogos";
import { normalizarMatricula } from "@/lib/matricula";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoForm = {
  error?: string;
  ok?: string;
  errores?: Record<string, string[]>;
  // Matrícula de 7 dígitos: se pide confirmar la versión con el 0.
  confirmarMatricula?: string;
  // Valores enviados, para no perder lo escrito si hay que corregir algo.
  valores?: Record<string, string>;
};

const esquemaDias = z
  .array(z.coerce.number().int().min(1).max(7))
  .transform((d) => [...new Set(d)].sort());

const esquemaDisciplina = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre.").max(80),
  dias: esquemaDias,
});

// --- Disciplinas -------------------------------------------------------------

export async function crearDisciplina(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  await requerirUsuario("coordinador");
  const datos = esquemaDisciplina
    .extend({ tipo: z.enum(TIPOS_DISCIPLINA) })
    .safeParse({
      nombre: formData.get("nombre"),
      tipo: formData.get("tipo"),
      dias: formData.getAll("dias"),
    });
  if (!datos.success) return { errores: z.flattenError(datos.error).fieldErrors };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("disciplinas").insert({
    nombre: datos.data.nombre,
    tipo: datos.data.tipo,
    dias_clase: datos.data.dias,
  });
  if (error) {
    registrarError("disciplinas:crear", error);
    return {
      error: error.code === "23505" ? "Ya existe una disciplina con ese nombre." : "No se pudo crear.",
    };
  }
  refresh();
  return { ok: `Se creó ${datos.data.nombre}.` };
}

export async function actualizarDisciplina(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  await requerirUsuario("coordinador");
  const datos = esquemaDisciplina
    .extend({ id: z.uuid(), activa: z.boolean() })
    .safeParse({
      id: formData.get("id"),
      nombre: formData.get("nombre"),
      dias: formData.getAll("dias"),
      activa: formData.get("activa") === "on",
    });
  if (!datos.success) return { errores: z.flattenError(datos.error).fieldErrors };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("disciplinas")
    .update({ nombre: datos.data.nombre, dias_clase: datos.data.dias, activa: datos.data.activa })
    .eq("id", datos.data.id);
  if (error) {
    registrarError("disciplinas:actualizar", error);
    return {
      error: error.code === "23505" ? "Ya existe una disciplina con ese nombre." : "No se pudo guardar.",
    };
  }
  refresh();
  return { ok: "Cambios guardados." };
}

// --- Asignación de entrenadores ---------------------------------------------

export async function asignarEntrenador(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  await requerirUsuario("coordinador");
  const datos = z
    .object({ disciplina_id: z.uuid(), entrenador_id: z.uuid("Elige un entrenador.") })
    .safeParse({
      disciplina_id: formData.get("disciplina_id"),
      entrenador_id: formData.get("entrenador_id"),
    });
  if (!datos.success) return { error: "Elige un entrenador." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("entrenador_disciplina").insert(datos.data);
  if (error) {
    registrarError("asignaciones:crear", error);
    return { error: error.code === "23505" ? "Ya está asignado." : "No se pudo asignar." };
  }
  refresh();
  return {};
}

export async function quitarEntrenador(formData: FormData): Promise<void> {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("entrenador_disciplina").delete().eq("id", id.data);
  if (error) registrarError("asignaciones:quitar", error);
  refresh();
}

// --- Alumnos e inscripciones ------------------------------------------------

export async function inscribirAlumno(
  _previo: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  await requerirUsuario("coordinador");

  const disciplinaId = z.uuid().safeParse(formData.get("disciplina_id"));
  if (!disciplinaId.success) return { error: "Disciplina no válida." };

  const entrada = String(formData.get("matricula") ?? "");
  const valores = {
    matricula: entrada,
    nombre: String(formData.get("nombre") ?? ""),
    genero: String(formData.get("genero") ?? ""),
  };
  const r = normalizarMatricula(entrada);
  if (r.estado === "invalida") {
    return { valores, errores: { matricula: ["Matrícula no válida: AL + 8 dígitos (ej. AL07210101)."] } };
  }
  if (r.estado === "confirmar" && formData.get("confirmada") !== r.matricula) {
    return { valores, confirmarMatricula: r.matricula };
  }

  const supabase = await crearClienteServidor();

  // ¿Ya existe? Se usa el registro existente y no se sobrescribe su nombre.
  const { data: existente, error: errorBusqueda } = await supabase
    .from("alumnos")
    .select("id, nombre")
    .eq("matricula", r.matricula)
    .maybeSingle();
  if (errorBusqueda) {
    registrarError("alumnos:buscar", errorBusqueda);
    return { error: "No se pudo verificar la matrícula." };
  }

  let alumnoId = existente?.id as string | undefined;
  let aviso = "";
  if (existente) {
    aviso = ` Ya estaba registrado como "${existente.nombre}"; se conservó ese nombre.`;
  } else {
    const datos = z
      .object({ nombre: esquemaNombre, genero: esquemaGenero })
      .safeParse({ nombre: formData.get("nombre"), genero: formData.get("genero") ?? "" });
    if (!datos.success) return { valores, errores: z.flattenError(datos.error).fieldErrors };

    const { data: nuevo, error } = await supabase
      .from("alumnos")
      .insert({ matricula: r.matricula, nombre: datos.data.nombre, genero: datos.data.genero })
      .select("id")
      .single();
    if (error || !nuevo) {
      registrarError("alumnos:crear", error);
      return { valores, error: "No se pudo registrar al alumno." };
    }
    alumnoId = nuevo.id;
  }

  const { error: errorInscripcion } = await supabase
    .from("inscripciones")
    .insert({ alumno_id: alumnoId, disciplina_id: disciplinaId.data });
  if (errorInscripcion) {
    if (errorInscripcion.code === "23505") return { error: "Ese alumno ya está inscrito en esta disciplina." };
    registrarError("inscripciones:crear", errorInscripcion);
    return { valores, error: "No se pudo inscribir." };
  }

  refresh();
  return { ok: `${r.matricula} inscrito.${aviso}` };
}

export async function darDeBaja(formData: FormData): Promise<void> {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse(formData.get("inscripcion_id"));
  if (!id.success) return;
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("inscripciones")
    .update({ fecha_baja: hoyMx() })
    .eq("id", id.data)
    .is("fecha_baja", null);
  if (error) registrarError("inscripciones:baja", error);
  refresh();
}

"use server";

import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { GENEROS, type Genero } from "@/lib/catalogos";
import { MAX_FILAS_IMPORTACION as MAX_FILAS } from "@/lib/importacion";
import { normalizarMatricula, PATRON_MATRICULA } from "@/lib/matricula";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type FilaLeida = { fila: number; matricula: string; nombre: string };

export type FilaAnalizada = FilaLeida & {
  estado: "nuevo" | "existente" | "inscrito" | "revisar";
  matriculaNormalizada?: string;
  motivo?: string;
  sugerencia?: string; // matrícula sugerida cuando falta el 0
  nombreExistente?: string;
  generoExistente?: Genero | null;
};

const esquemaLeidas = z
  .array(
    z.object({
      fila: z.number().int().positive(),
      matricula: z.string().max(40),
      nombre: z.string().max(200),
    }),
  )
  .min(1, "El archivo no tiene filas con datos.")
  .max(MAX_FILAS, `Máximo ${MAX_FILAS} filas por importación.`);

/**
 * Clasifica las filas leídas del Excel. No escribe nada: solo valida y compara
 * contra los alumnos existentes y las inscripciones vigentes de la disciplina.
 */
export async function analizarImportacion(
  disciplinaId: string,
  filas: FilaLeida[],
): Promise<{ error?: string; filas?: FilaAnalizada[] }> {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse(disciplinaId);
  const datos = esquemaLeidas.safeParse(filas);
  if (!id.success) return { error: "Disciplina no válida." };
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Datos no válidos." };

  // 1. Normalizar y detectar problemas dentro del archivo.
  const vistas = new Map<string, number>();
  const analizadas: FilaAnalizada[] = datos.data.map((f) => {
    const nombre = f.nombre.trim().replace(/\s+/g, " ");
    const base = { ...f, nombre };
    const r = normalizarMatricula(f.matricula);
    if (r.estado === "invalida") {
      return { ...base, estado: "revisar", motivo: "Matrícula no válida" };
    }
    if (r.estado === "confirmar") {
      return {
        ...base,
        estado: "revisar",
        motivo: "Le falta el 0 inicial (Excel suele borrarlo)",
        sugerencia: r.matricula,
      };
    }
    if (nombre.length < 2 || nombre.length > 120) {
      return { ...base, estado: "revisar", motivo: "Nombre vacío o demasiado largo", matriculaNormalizada: r.matricula };
    }
    const previa = vistas.get(r.matricula);
    if (previa) {
      return {
        ...base,
        estado: "revisar",
        motivo: `Matrícula repetida en el archivo (fila ${previa})`,
        matriculaNormalizada: r.matricula,
      };
    }
    vistas.set(r.matricula, f.fila);
    return { ...base, estado: "nuevo", matriculaNormalizada: r.matricula };
  });

  // 2. Comparar con la base de datos.
  const matriculas = [...vistas.keys()];
  if (matriculas.length > 0) {
    const supabase = await crearClienteServidor();
    const { data: existentes, error } = await supabase
      .from("alumnos")
      .select("id, matricula, nombre, genero, inscripciones(disciplina_id, fecha_baja)")
      .in("matricula", matriculas);
    if (error) {
      registrarError("importar:analizar", error);
      return { error: "No se pudo comparar con los alumnos registrados." };
    }

    const porMatricula = new Map(
      ((existentes ?? []) as unknown as {
        matricula: string;
        nombre: string;
        genero: Genero | null;
        inscripciones: { disciplina_id: string; fecha_baja: string | null }[];
      }[]).map((a) => [a.matricula, a]),
    );

    for (const f of analizadas) {
      if (f.estado !== "nuevo" || !f.matriculaNormalizada) continue;
      const a = porMatricula.get(f.matriculaNormalizada);
      if (!a) continue;
      const inscrito = a.inscripciones.some(
        (i) => i.disciplina_id === id.data && i.fecha_baja === null,
      );
      f.estado = inscrito ? "inscrito" : "existente";
      f.nombreExistente = a.nombre;
      f.generoExistente = a.genero;
    }
  }

  return { filas: analizadas };
}

const esquemaConfirmar = z
  .array(
    z.object({
      matricula: z.string().regex(PATRON_MATRICULA),
      nombre: z.string().trim().min(2).max(120),
      genero: z.enum(GENEROS).nullable(),
      actualizar_nombre: z.boolean(),
    }),
  )
  .min(1, "No hay alumnos por importar.")
  .max(MAX_FILAS);

export type ResultadoImportacion = {
  error?: string;
  resultado?: { creados: number; actualizados: number; inscritos: number; ya_inscritos: number };
};

/** Importa en una sola transacción (función `importar_alumnos`): todo o nada. */
export async function confirmarImportacion(
  disciplinaId: string,
  filas: z.input<typeof esquemaConfirmar>,
): Promise<ResultadoImportacion> {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse(disciplinaId);
  const datos = esquemaConfirmar.safeParse(filas);
  if (!id.success) return { error: "Disciplina no válida." };
  if (!datos.success) return { error: "Hay filas con datos no válidos. Vuelve a revisar el archivo." };

  const matriculas = new Set(datos.data.map((f) => f.matricula));
  if (matriculas.size !== datos.data.length) return { error: "Hay matrículas repetidas." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("importar_alumnos", {
    p_disciplina: id.data,
    p_filas: datos.data,
  });
  if (error) {
    registrarError("importar:confirmar", error);
    return { error: "No se importó nada: ocurrió un error. Intenta de nuevo." };
  }
  return { resultado: data as ResultadoImportacion["resultado"] };
}

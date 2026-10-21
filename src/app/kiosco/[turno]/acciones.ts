"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { envPublico } from "@/lib/env";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type RespuestaKiosco =
  | { tipo: "nuevo" }
  | { tipo: "entrada" | "salida"; nombreCorto: string }
  | { tipo: "listo"; accion: "entrada" | "salida"; nombreCorto: string }
  | { tipo: "error"; mensaje: string }
  | { tipo: "cerrado" };

const esquemaMatricula = z.string().regex(/^AL0\d{7}$/);

function traducirError(error: { code?: string } | null): RespuestaKiosco {
  if (error?.code === "54000") return { tipo: "error", mensaje: "Demasiados intentos. Espera un minuto." };
  if (error?.code === "22023") return { tipo: "error", mensaje: "No se pudo registrar. Vuelve a escribir tu matrícula." };
  return { tipo: "error", mensaje: "Algo salió mal. Intenta de nuevo." };
}

async function turnoCerrado(turno: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("turnos_gimnasio").select("cerrado_en").eq("id", turno).maybeSingle();
  return !data || data.cerrado_en !== null;
}

export async function buscarAlumno(turno: string, matricula: string): Promise<RespuestaKiosco> {
  await requerirUsuario("entrenador");
  if (!z.uuid().safeParse(turno).success || !esquemaMatricula.safeParse(matricula).success) {
    return { tipo: "error", mensaje: "Matrícula no válida." };
  }
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("kiosco_buscar", { p_turno: turno, p_matricula: matricula });
  if (error) {
    if (await turnoCerrado(turno)) return { tipo: "cerrado" };
    if (error.code !== "54000") registrarError("kiosco:buscar", error);
    return traducirError(error);
  }
  const r = data as { accion: "nuevo" | "entrada" | "salida"; nombre_corto?: string };
  return r.accion === "nuevo" ? { tipo: "nuevo" } : { tipo: r.accion, nombreCorto: r.nombre_corto ?? "" };
}

export async function registrarMovimiento(
  turno: string,
  matricula: string,
  accion: "entrada" | "salida",
  nombre?: string,
): Promise<RespuestaKiosco> {
  await requerirUsuario("entrenador");
  const datos = z
    .object({
      turno: z.uuid(),
      matricula: esquemaMatricula,
      accion: z.enum(["entrada", "salida"]),
      nombre: z.string().trim().min(5).max(120).optional(),
    })
    .safeParse({ turno, matricula, accion, nombre });
  if (!datos.success) return { tipo: "error", mensaje: "Escribe tu nombre completo (nombre y apellidos)." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("kiosco_registrar", {
    p_turno: datos.data.turno,
    p_matricula: datos.data.matricula,
    p_accion: datos.data.accion,
    p_nombre: datos.data.nombre ?? null,
  });
  if (error) {
    if (await turnoCerrado(turno)) return { tipo: "cerrado" };
    registrarError("kiosco:registrar", error);
    return traducirError(error);
  }
  const r = data as { accion: "entrada" | "salida"; nombre_corto: string };
  return { tipo: "listo", accion: r.accion, nombreCorto: r.nombre_corto };
}

export type EstadoSalida = { error?: string };

/**
 * Salir del kiosco (y opcionalmente cerrar el turno) exige la contraseña del
 * entrenador. Se verifica con un cliente temporal que no toca la sesión actual.
 */
export async function salirDelKiosco(
  _previo: EstadoSalida,
  formData: FormData,
): Promise<EstadoSalida> {
  const usuario = await requerirUsuario("entrenador");
  const datos = z
    .object({ turno: z.uuid(), password: z.string().min(1).max(72), cerrar: z.enum(["si", "no"]) })
    .safeParse({ turno: formData.get("turno"), password: formData.get("password"), cerrar: formData.get("cerrar") });
  if (!datos.success) return { error: "Escribe tu contraseña." };

  const verificador = createClient(envPublico.NEXT_PUBLIC_SUPABASE_URL, envPublico.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: errorAuth } = await verificador.auth.signInWithPassword({
    email: usuario.correo,
    password: datos.data.password,
  });
  if (errorAuth) return { error: "Contraseña incorrecta." };
  // Revoca solo la sesión temporal de la verificación.
  await verificador.auth.signOut({ scope: "local" });

  if (datos.data.cerrar === "si") {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.rpc("cerrar_turno", { p_turno: datos.data.turno });
    if (error && !(await turnoCerrado(datos.data.turno))) {
      registrarError("kiosco:cerrar", error);
      return { error: "No se pudo cerrar el turno. Intenta de nuevo." };
    }
  }
  redirect("/entrenador");
}

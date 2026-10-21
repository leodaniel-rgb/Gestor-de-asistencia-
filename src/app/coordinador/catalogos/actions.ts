"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

const TIPOS = ["motivo_sin_clase", "categoria_incidencia"] as const;

export type EstadoCatalogo = { error?: string; ok?: string };

function mensaje(code: string | undefined): string {
  if (code === "23514") return "Máximo 6 opciones activas. Desactiva una antes de agregar o activar otra.";
  if (code === "23505") return "Ya existe una opción con ese nombre.";
  return "No se pudo guardar. Intenta de nuevo.";
}

export async function agregarOpcion(
  _previo: EstadoCatalogo,
  formData: FormData,
): Promise<EstadoCatalogo> {
  await requerirUsuario("coordinador");
  const datos = z
    .object({
      tipo: z.enum(TIPOS),
      nombre: z.string().trim().min(2, "Mínimo 2 caracteres.").max(40, "Máximo 40 caracteres."),
    })
    .safeParse({ tipo: formData.get("tipo"), nombre: formData.get("nombre") });
  if (!datos.success) return { error: datos.error.issues[0]?.message };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("catalogo_opciones").insert(datos.data);
  if (error) {
    if (error.code !== "23514" && error.code !== "23505") registrarError("catalogos:agregar", error);
    return { error: mensaje(error.code) };
  }
  refresh();
  return { ok: `Se agregó "${datos.data.nombre}".` };
}

export async function alternarOpcion(
  _previo: EstadoCatalogo,
  formData: FormData,
): Promise<EstadoCatalogo> {
  await requerirUsuario("coordinador");
  const datos = z
    .object({ id: z.uuid(), activa: z.enum(["true", "false"]) })
    .safeParse({ id: formData.get("id"), activa: formData.get("activa") });
  if (!datos.success) return { error: "Datos no válidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("catalogo_opciones")
    .update({ activa: datos.data.activa === "true" })
    .eq("id", datos.data.id);
  if (error) {
    if (error.code !== "23514") registrarError("catalogos:alternar", error);
    return { error: mensaje(error.code) };
  }
  refresh();
  return {};
}

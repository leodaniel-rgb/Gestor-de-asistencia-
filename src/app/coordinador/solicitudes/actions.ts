"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoResolucion = { error?: string };

export async function aprobarSolicitud(
  _previo: EstadoResolucion,
  formData: FormData,
): Promise<EstadoResolucion> {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Solicitud no válida." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("aprobar_solicitud", { p_solicitud: id.data });
  if (error) {
    registrarError("solicitudes:aprobar", error);
    return {
      error: error.code === "22023" ? "La solicitud ya fue resuelta." : "No se pudo aprobar. Intenta de nuevo.",
    };
  }
  refresh();
  return {};
}

export async function rechazarSolicitud(
  _previo: EstadoResolucion,
  formData: FormData,
): Promise<EstadoResolucion> {
  await requerirUsuario("coordinador");
  const datos = z
    .object({
      id: z.uuid(),
      motivo: z.string().trim().min(3, "Escribe el motivo (mínimo 3 caracteres).").max(300),
    })
    .safeParse({ id: formData.get("id"), motivo: formData.get("motivo") });
  if (!datos.success) return { error: datos.error.issues[0]?.message ?? "Datos no válidos." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("rechazar_solicitud", {
    p_solicitud: datos.data.id,
    p_motivo: datos.data.motivo,
  });
  if (error) {
    registrarError("solicitudes:rechazar", error);
    return {
      error: error.code === "22023" ? "La solicitud ya fue resuelta." : "No se pudo rechazar. Intenta de nuevo.",
    };
  }
  refresh();
  return {};
}

"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoGimnasio = { error?: string };

const esquemaDispositivo = z.enum(["celular", "tablet", "computadora"]);

/** Abre el gimnasio y entra directo al kiosco con el dispositivo elegido. */
export async function abrirGimnasio(
  _previo: EstadoGimnasio,
  formData: FormData,
): Promise<EstadoGimnasio> {
  await requerirUsuario("entrenador");
  const datos = z
    .object({
      disciplina_id: z.uuid(),
      nombre: z.enum(["manana", "tarde", ""]),
      dispositivo: esquemaDispositivo,
    })
    .safeParse({
      disciplina_id: formData.get("disciplina_id"),
      nombre: formData.get("nombre") ?? "",
      dispositivo: formData.get("dispositivo"),
    });
  if (!datos.success) return { error: "Elige el turno y el dispositivo." };

  const supabase = await crearClienteServidor();
  const { data: turnoId, error } = await supabase.rpc("abrir_turno", {
    p_disciplina: datos.data.disciplina_id,
    p_nombre: datos.data.nombre || null,
  });
  if (error || !turnoId) {
    registrarError("gimnasio:abrir", error);
    return { error: "No se pudo abrir el gimnasio. Intenta de nuevo." };
  }
  redirect(`/kiosco/${turnoId}?dispositivo=${datos.data.dispositivo}`);
}

/** Vuelve al kiosco de un turno abierto, eligiendo el dispositivo. */
export async function irAlKiosco(formData: FormData): Promise<void> {
  await requerirUsuario("entrenador");
  const turno = z.uuid().safeParse(formData.get("turno_id"));
  const dispositivo = esquemaDispositivo.safeParse(formData.get("dispositivo"));
  if (!turno.success) return;
  redirect(`/kiosco/${turno.data}?dispositivo=${dispositivo.success ? dispositivo.data : "tablet"}`);
}

/** Cierre desde el portal del entrenador (ya autenticado; fuera del kiosco). */
export async function cerrarTurnoPortal(formData: FormData): Promise<void> {
  await requerirUsuario("entrenador");
  const turno = z.uuid().safeParse(formData.get("turno_id"));
  if (!turno.success) return;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cerrar_turno", { p_turno: turno.data });
  if (error) registrarError("gimnasio:cerrar-portal", error);
  refresh();
}

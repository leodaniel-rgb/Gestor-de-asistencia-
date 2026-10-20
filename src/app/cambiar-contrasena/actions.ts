"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerUsuario, rutaInicio } from "@/lib/auth/dal";
import { esquemaPassword } from "@/lib/auth/password";
import { registrarError } from "@/lib/registro";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoCambio = { error?: string; errores?: Record<string, string[]> };

const esquema = z
  .object({ password: esquemaPassword, confirmacion: z.string() })
  .refine((d) => d.password === d.confirmacion, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmacion"],
  });

export async function cambiarPassword(
  _previo: EstadoCambio,
  formData: FormData,
): Promise<EstadoCambio> {
  // Se permite con cambio pendiente: es justo el caso de uso de esta acción.
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/login");

  const datos = esquema.safeParse({
    password: formData.get("password"),
    confirmacion: formData.get("confirmacion"),
  });
  if (!datos.success) {
    return { errores: z.flattenError(datos.error).fieldErrors };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({
    password: datos.data.password,
  });
  if (error) {
    registrarError("cambiar-contrasena:update-user", error);
    return {
      error:
        error.code === "same_password"
          ? "La nueva contraseña debe ser distinta de la temporal."
          : error.code === "weak_password"
            ? "La contraseña no cumple la política de seguridad."
            : "No se pudo cambiar la contraseña. Intenta de nuevo.",
    };
  }

  // Solo después de un cambio exitoso se libera la cuenta.
  const admin = crearClienteAdmin();
  const { error: errorPerfil } = await admin
    .from("perfiles")
    .update({ debe_cambiar_password: false })
    .eq("id", usuario.id);
  if (errorPerfil) {
    registrarError("cambiar-contrasena:completar-perfil", errorPerfil);
    return { error: "La contraseña cambió, pero no se pudo activar la cuenta. Avisa a coordinación." };
  }

  redirect(rutaInicio({ ...usuario, debeCambiarPassword: false }));
}

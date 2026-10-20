"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { rutaInicio, type Rol } from "@/lib/auth/dal";
import { registrarError } from "@/lib/registro";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoLogin = { error?: string; correo?: string };

const esquema = z.object({
  correo: z.email().transform((c) => c.toLowerCase().trim()),
  password: z.string().min(1).max(72),
});

// Mensaje único: no revela si el correo existe ni si la cuenta está desactivada.
const ERROR_GENERICO = "Correo o contraseña incorrectos.";

export async function iniciarSesion(
  _previo: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const correo = String(formData.get("correo") ?? "");
  const datos = esquema.safeParse({
    correo,
    password: formData.get("password"),
  });
  if (!datos.success) return { error: ERROR_GENERICO, correo };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: datos.data.correo,
    password: datos.data.password,
  });
  if (error || !data.user) {
    // Credenciales incorrectas es lo normal; solo se registran fallos inesperados.
    if (error && error.code !== "invalid_credentials") registrarError("login:sign-in", error);
    return { error: ERROR_GENERICO, correo };
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from("perfiles")
    .select("rol, activo, debe_cambiar_password")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!perfil || !perfil.activo) {
    if (errorPerfil) registrarError("login:leer-perfil", errorPerfil);
    await supabase.auth.signOut();
    return { error: ERROR_GENERICO, correo };
  }

  redirect(
    rutaInicio({
      id: data.user.id,
      nombre: "",
      correo: datos.data.correo,
      rol: perfil.rol as Rol,
      debeCambiarPassword: perfil.debe_cambiar_password,
    }),
  );
}

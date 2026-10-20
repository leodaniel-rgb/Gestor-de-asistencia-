"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requerirUsuario } from "@/lib/auth/dal";
import { generarPasswordTemporal } from "@/lib/auth/password";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoCuenta = {
  error?: string;
  errores?: Record<string, string[]>;
  // Se muestra una sola vez; nunca se guarda en texto plano.
  credencial?: { nombre: string; correo: string; password: string };
};

// Prácticamente permanente: las cuentas no se reactivan ni se eliminan.
const BLOQUEO_PERMANENTE = "876000h";

const esquemaNueva = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre completo.").max(120),
  correo: z.email("Correo no válido.").transform((c) => c.toLowerCase().trim()),
});

const esquemaId = z.uuid();

export async function crearCuenta(
  _previo: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  const coordinador = await requerirUsuario("coordinador");

  const datos = esquemaNueva.safeParse({
    nombre: formData.get("nombre"),
    correo: formData.get("correo"),
  });
  if (!datos.success) return { errores: z.flattenError(datos.error).fieldErrors };

  const password = generarPasswordTemporal();
  const admin = crearClienteAdmin();
  const { data: creado, error: errorAuth } = await admin.auth.admin.createUser({
    email: datos.data.correo,
    password,
    email_confirm: true, // el portal no envía correos
  });
  if (errorAuth || !creado.user) {
    const duplicado =
      errorAuth?.code === "email_exists" || errorAuth?.code === "user_already_exists";
    return {
      error: duplicado
        ? "Ya existe una cuenta con ese correo."
        : "No se pudo crear la cuenta. Intenta de nuevo.",
    };
  }

  // El perfil se inserta con la sesión del coordinador: RLS lo valida y la
  // bitácora registra al coordinador como autor.
  const supabase = await crearClienteServidor();
  const { error: errorPerfil } = await supabase.from("perfiles").insert({
    id: creado.user.id,
    correo: datos.data.correo,
    nombre: datos.data.nombre,
    creado_por: coordinador.id,
  });
  if (errorPerfil) {
    // La cuenta de Auth aún no tiene perfil ni registros: se puede revertir.
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: "No se pudo crear el perfil. No se guardó nada." };
  }

  refresh();
  return { credencial: { nombre: datos.data.nombre, correo: datos.data.correo, password } };
}

export async function restablecerPassword(
  _previo: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  await requerirUsuario("coordinador");
  const id = esquemaId.safeParse(formData.get("id"));
  if (!id.success) return { error: "Cuenta no válida." };

  // Primero se marca el cambio obligatorio (RLS: solo entrenadores activos o no).
  const supabase = await crearClienteServidor();
  const { data: perfil, error } = await supabase
    .from("perfiles")
    .update({ debe_cambiar_password: true })
    .eq("id", id.data)
    .eq("activo", true)
    .select("nombre, correo")
    .maybeSingle();
  if (error || !perfil) return { error: "No se encontró una cuenta activa." };

  const password = generarPasswordTemporal();
  const admin = crearClienteAdmin();
  const { error: errorAuth } = await admin.auth.admin.updateUserById(id.data, { password });
  if (errorAuth) {
    return { error: "No se pudo restablecer. La cuenta quedó bloqueada hasta reintentar." };
  }

  refresh();
  return { credencial: { nombre: perfil.nombre, correo: perfil.correo, password } };
}

export async function desactivarCuenta(
  _previo: EstadoCuenta,
  formData: FormData,
): Promise<EstadoCuenta> {
  await requerirUsuario("coordinador");
  const id = esquemaId.safeParse(formData.get("id"));
  if (!id.success) return { error: "Cuenta no válida." };

  // El perfil inactivo corta el acceso a los datos de inmediato (RLS).
  const supabase = await crearClienteServidor();
  const { data: perfil, error } = await supabase
    .from("perfiles")
    .update({ activo: false })
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error || !perfil) return { error: "No se encontró la cuenta." };

  // Además se bloquea el inicio de sesión en Auth.
  const admin = crearClienteAdmin();
  const { error: errorAuth } = await admin.auth.admin.updateUserById(id.data, {
    ban_duration: BLOQUEO_PERMANENTE,
  });

  refresh();
  if (errorAuth) {
    // El acceso ya está cortado por el perfil inactivo; el bloqueo es una capa extra.
    return { error: "Cuenta desactivada. El bloqueo adicional en Auth falló; avisa al responsable técnico." };
  }
  return {};
}

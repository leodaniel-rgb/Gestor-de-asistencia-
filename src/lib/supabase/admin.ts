import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { envPublico } from "@/lib/env";

/**
 * Cliente con la llave secreta: SE SALTA RLS.
 * Uso restringido a `auth.admin` (crear, restablecer y desactivar cuentas) y a
 * marcar el cambio de contraseña como completado. Toda llamada debe ir precedida
 * de una verificación de permisos en el servidor (ver lib/auth/dal.ts).
 */
export function crearClienteAdmin() {
  const llaveSecreta = z
    .string()
    .startsWith("sb_secret_")
    .parse(process.env.SUPABASE_SECRET_KEY);

  return createClient(envPublico.NEXT_PUBLIC_SUPABASE_URL, llaveSecreta, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

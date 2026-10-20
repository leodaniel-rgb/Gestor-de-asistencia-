import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envPublico } from "@/lib/env";

/**
 * Cliente con la sesión del usuario: todas sus consultas pasan por RLS.
 * Se crea uno nuevo por petición; nunca guardarlo en una variable global.
 */
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    envPublico.NEXT_PUBLIC_SUPABASE_URL,
    envPublico.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // El proxy se encarga de renovar la sesión.
          }
        },
      },
    },
  );
}

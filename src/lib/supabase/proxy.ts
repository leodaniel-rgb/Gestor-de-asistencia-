import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { envPublico } from "@/lib/env";

const RUTAS_PUBLICAS = ["/", "/login"];

/**
 * Renueva la sesión en cada petición y redirige a /login si no hay sesión.
 * Es solo un chequeo optimista: la autorización real vive en lib/auth/dal.ts
 * y en las políticas RLS de la base de datos.
 */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const encabezadosCache: Record<string, string> = {};

  const supabase = createServerClient(
    envPublico.NEXT_PUBLIC_SUPABASE_URL,
    envPublico.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          respuesta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
          // Evita que un CDN entregue la sesión de un usuario a otro.
          Object.assign(encabezadosCache, headers);
          Object.entries(headers).forEach(([clave, valor]) =>
            respuesta.headers.set(clave, valor),
          );
        },
      },
    },
  );

  // No poner código entre createServerClient y getClaims (ver docs de Supabase).
  const { data } = await supabase.auth.getClaims();
  const haySesion = Boolean(data?.claims);

  const ruta = request.nextUrl.pathname;
  if (!haySesion && !RUTAS_PUBLICAS.includes(ruta)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redireccion = NextResponse.redirect(url);
    respuesta.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
    Object.entries(encabezadosCache).forEach(([clave, valor]) =>
      redireccion.headers.set(clave, valor),
    );
    return redireccion;
  }

  return respuesta;
}

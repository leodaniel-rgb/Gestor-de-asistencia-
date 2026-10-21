import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Rol = "coordinador" | "entrenador";

export type Usuario = {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  debeCambiarPassword: boolean;
};

/**
 * Capa de acceso a datos (DAL): única fuente de verdad sobre quién es el
 * usuario. Valida el JWT con getClaims() (nunca getSession()) y lee el perfil
 * con su propia sesión, así que RLS también aplica. Se memoiza por petición.
 * Devuelve null si no hay sesión, el perfil no existe o está desactivado.
 */
export const obtenerUsuario = cache(async (): Promise<Usuario | null> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (error || !id) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, nombre, correo, rol, activo, debe_cambiar_password")
    .eq("id", id)
    .maybeSingle();

  if (!perfil || !perfil.activo) return null;

  return {
    id: perfil.id,
    nombre: perfil.nombre,
    correo: perfil.correo,
    rol: perfil.rol as Rol,
    debeCambiarPassword: perfil.debe_cambiar_password,
  };
});

/** Ruta de inicio según el estado y rol del usuario. */
export function rutaInicio(usuario: Usuario): string {
  if (usuario.debeCambiarPassword) return "/cambiar-contrasena";
  return usuario.rol === "coordinador" ? "/coordinador/disciplinas" : "/entrenador";
}

/**
 * Exige un usuario habilitado (activo y sin cambio de contraseña pendiente)
 * y, opcionalmente, un rol. Redirige si no cumple. Usar en cada página y en
 * cada Server Action protegida.
 */
export async function requerirUsuario(rol?: Rol): Promise<Usuario> {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/login");
  if (usuario.debeCambiarPassword) redirect("/cambiar-contrasena");
  if (rol && usuario.rol !== rol) redirect(rutaInicio(usuario));
  return usuario;
}

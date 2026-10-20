import "server-only";

/**
 * Registra un error en los logs del servidor (terminal local o Vercel → Logs).
 * Solo código y mensaje técnico: nunca correos, contraseñas ni datos de alumnos.
 * Al usuario se le sigue mostrando un mensaje genérico.
 */
export function registrarError(
  contexto: string,
  error: { code?: string; message?: string } | null | undefined,
) {
  console.error(
    JSON.stringify({
      nivel: "error",
      contexto,
      codigo: error?.code ?? null,
      mensaje: error?.message ?? null,
    }),
  );
}

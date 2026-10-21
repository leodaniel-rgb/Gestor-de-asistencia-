/**
 * Matrícula Tecmilenio: "AL" + 8 dígitos que empiezan con 0 (ej. AL07210101).
 * Los alumnos suelen omitir el "AL" y a veces el 0 inicial.
 *
 * - "AL07210101" o "07210101" → válida (sin ambigüedad).
 * - "7210101" o "AL7210101"   → requiere confirmar "AL07210101".
 * - Cualquier otra cosa       → inválida.
 */
export type ResultadoMatricula =
  | { estado: "valida"; matricula: string }
  | { estado: "confirmar"; matricula: string }
  | { estado: "invalida" };

export const PATRON_MATRICULA = /^AL0\d{7}$/;

export function normalizarMatricula(entrada: string): ResultadoMatricula {
  const limpia = entrada.replace(/[\s-]/g, "").toUpperCase();
  const digitos = limpia.startsWith("AL") ? limpia.slice(2) : limpia;

  if (!/^\d+$/.test(digitos)) return { estado: "invalida" };
  if (/^0\d{7}$/.test(digitos)) return { estado: "valida", matricula: `AL${digitos}` };
  if (/^[1-9]\d{6}$/.test(digitos)) return { estado: "confirmar", matricula: `AL0${digitos}` };
  return { estado: "invalida" };
}

export const AYUDA_MATRICULA =
  "Escribe solo los números de la matrícula, con el 0 al inicio (8 dígitos).";

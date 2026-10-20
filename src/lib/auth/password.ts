import { z } from "zod";

// Coincide con la política configurada en Supabase Auth.
export const esquemaPassword = z
  .string()
  .min(10, "Mínimo 10 caracteres.")
  .max(72, "Máximo 72 caracteres.")
  .regex(/[a-z]/, "Incluye al menos una minúscula.")
  .regex(/[A-Z]/, "Incluye al menos una mayúscula.")
  .regex(/[0-9]/, "Incluye al menos un número.");

// Sin caracteres ambiguos (0/O, 1/l/I) para dictarla sin errores.
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz";
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";
const TODOS = MINUSCULAS + MAYUSCULAS + DIGITOS;

function aleatorio(max: number): number {
  // Muestreo por rechazo para evitar sesgo de módulo.
  const limite = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  let valor: number;
  do {
    crypto.getRandomValues(buffer);
    valor = buffer[0];
  } while (valor >= limite);
  return valor % max;
}

/** Contraseña temporal de 14 caracteres que cumple la política. */
export function generarPasswordTemporal(longitud = 14): string {
  const caracteres = [
    MINUSCULAS[aleatorio(MINUSCULAS.length)],
    MAYUSCULAS[aleatorio(MAYUSCULAS.length)],
    DIGITOS[aleatorio(DIGITOS.length)],
  ];
  while (caracteres.length < longitud) {
    caracteres.push(TODOS[aleatorio(TODOS.length)]);
  }
  // Fisher–Yates
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

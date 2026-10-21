import { z } from "zod";

export const GENEROS = ["femenino", "masculino", "no_binario"] as const;
export type Genero = (typeof GENEROS)[number];
export const ETIQUETA_GENERO: Record<Genero, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  no_binario: "No binario",
};

export const TIPOS_DISCIPLINA = ["lista", "acceso_libre"] as const;
export type TipoDisciplina = (typeof TIPOS_DISCIPLINA)[number];
export const ETIQUETA_TIPO: Record<TipoDisciplina, string> = {
  lista: "Con lista (selección o taller)",
  acceso_libre: "Acceso libre (gimnasio)",
};

// ISO: 1 = lunes … 7 = domingo (igual que en la base de datos).
export const DIAS = [
  { valor: 1, corto: "L", largo: "Lunes" },
  { valor: 2, corto: "M", largo: "Martes" },
  { valor: 3, corto: "Mi", largo: "Miércoles" },
  { valor: 4, corto: "J", largo: "Jueves" },
  { valor: 5, corto: "V", largo: "Viernes" },
  { valor: 6, corto: "S", largo: "Sábado" },
  { valor: 7, corto: "D", largo: "Domingo" },
] as const;

export function describirDias(dias: number[]): string {
  if (dias.length === 0) return "Sin días fijos";
  return DIAS.filter((d) => dias.includes(d.valor))
    .map((d) => d.largo)
    .join(", ");
}

export const esquemaGenero = z
  .union([z.enum(GENEROS), z.literal("")])
  .transform((g) => (g === "" ? null : g));

export const esquemaNombre = z
  .string()
  .trim()
  .min(2, "Escribe el nombre completo.")
  .max(120, "Máximo 120 caracteres.");

/** Fecha de hoy en San Luis Potosí, formato YYYY-MM-DD. */
export function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const formatoFecha = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "UTC", // las columnas `date` llegan como medianoche UTC
});
export function formatearFecha(fecha: string): string {
  return formatoFecha.format(new Date(`${fecha}T00:00:00Z`));
}

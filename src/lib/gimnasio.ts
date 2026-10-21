export type NombreTurno = "manana" | "tarde";
export type Dispositivo = "celular" | "tablet" | "computadora";

export const ETIQUETA_TURNO: Record<NombreTurno, string> = { manana: "Mañana", tarde: "Tarde" };

export const DISPOSITIVOS: { valor: Dispositivo; etiqueta: string }[] = [
  { valor: "celular", etiqueta: "Celular" },
  { valor: "tablet", etiqueta: "Tablet" },
  { valor: "computadora", etiqueta: "Computadora" },
];

/**
 * Sugerencia de turno según la hora "HH:MM": antes de las 13:00, mañana;
 * desde las 15:00, tarde; en medio, solo se registra la hora (null).
 */
export function sugerirTurno(hora: string): NombreTurno | null {
  const h = Number(hora.slice(0, 2));
  if (h < 13) return "manana";
  if (h >= 15) return "tarde";
  return null;
}

export function esDispositivo(valor: unknown): valor is Dispositivo {
  return valor === "celular" || valor === "tablet" || valor === "computadora";
}

/** Dígitos que escribe el alumno en el kiosco → matrícula completa o confirmación. */
export function matriculaDesdeDigitos(
  digitos: string,
): { estado: "valida" | "confirmar"; matricula: string } | { estado: "incompleta" } {
  if (/^0\d{7}$/.test(digitos)) return { estado: "valida", matricula: `AL${digitos}` };
  if (/^[1-9]\d{6}$/.test(digitos)) return { estado: "confirmar", matricula: `AL0${digitos}` };
  return { estado: "incompleta" };
}

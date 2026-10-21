// Utilidades de fecha en la zona de San Luis Potosí. Las fechas se manejan
// como texto "YYYY-MM-DD" para no mezclar zonas horarias.

export const DIAS_CAPTURA_ATRAS = 3; // debe coincidir con privado.fecha_capturable

const ZONA = "America/Mexico_City";

/** Fecha y hora actuales en San Luis Potosí. */
export function ahoraMx(fecha = new Date()): { fecha: string; hora: string } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

/** Suma días a una fecha "YYYY-MM-DD" (aritmética de calendario, sin zonas). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha "YYYY-MM-DD". */
export function diaSemanaIso(fecha: string): number {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return dia === 0 ? 7 : dia;
}

/** Fechas que se pueden capturar: hoy y hasta 3 días atrás (la más reciente primero). */
export function fechasCapturables(hoy: string): string[] {
  return Array.from({ length: DIAS_CAPTURA_ATRAS + 1 }, (_, i) => sumarDias(hoy, -i));
}

const formatoDia = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "hoy", "ayer" o "lunes 19 de octubre". */
export function describirFecha(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, -1)) return "Ayer";
  const texto = formatoDia.format(new Date(`${fecha}T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const VENTANA_CORRECCION_MS = 24 * 60 * 60 * 1000; // debe coincidir con privado.puede_corregir_sesion

/** Momento límite para corregir una sesión y si aún se puede. Se evalúa en el servidor, por petición. */
export function ventanaCorreccion(creadoEn: string, ahora: number = Date.now()) {
  const vence = new Date(creadoEn).getTime() + VENTANA_CORRECCION_MS;
  return { vence: new Date(vence).toISOString(), abierta: ahora < vence };
}

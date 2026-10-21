// Cálculos de los dashboards a partir de lo que devuelven las funciones
// reporte_listas y reporte_gimnasio. Funciones puras (se prueban sin base).

import { diaSemanaIso, sumarDias } from "./fechas";

export const RANGO_MAXIMO_DIAS = 92; // debe coincidir con privado.validar_rango_reporte

export type ConteoGenero = { f: number; m: number; nb: number; sa: number };
export type SesionReporte = {
  id: string;
  fecha: string;
  hora: string;
  disciplina_id: string;
  disciplina: string;
  asistio: ConteoGenero;
  falta: ConteoGenero;
};
export type FiltroGenero = "todos" | keyof ConteoGenero;
export type FiltroEstado = "asistio" | "falta";

export const ETIQUETA_GENERO_CORTA: Record<keyof ConteoGenero, string> = {
  f: "Mujeres",
  m: "Hombres",
  nb: "No binario",
  sa: "Sin asignar",
};

const suma = (c: ConteoGenero) => c.f + c.m + c.nb + c.sa;

export function contar(c: ConteoGenero, genero: FiltroGenero): number {
  return genero === "todos" ? suma(c) : c[genero];
}

/** Valor de una sesión según los filtros (asistencias o faltas, y género). */
export function valorSesion(s: SesionReporte, estado: FiltroEstado, genero: FiltroGenero): number {
  return contar(estado === "asistio" ? s.asistio : s.falta, genero);
}

export type ResumenListas = {
  sesiones: number;
  total: number; // asistencias o faltas según el filtro
  asistencias: number;
  faltas: number;
  porcentajeAsistencia: number | null;
  promedioPorSesion: number | null;
  pico: { fecha: string; total: number } | null;
  porGenero: ConteoGenero;
};

export function resumenListas(
  sesiones: SesionReporte[],
  estado: FiltroEstado,
  genero: FiltroGenero,
): ResumenListas {
  const asistencias = sesiones.reduce((a, s) => a + contar(s.asistio, genero), 0);
  const faltas = sesiones.reduce((a, s) => a + contar(s.falta, genero), 0);
  const total = estado === "asistio" ? asistencias : faltas;

  const porFecha = new Map<string, number>();
  for (const s of sesiones) porFecha.set(s.fecha, (porFecha.get(s.fecha) ?? 0) + valorSesion(s, estado, genero));
  let pico: ResumenListas["pico"] = null;
  for (const [fecha, t] of porFecha) if (!pico || t > pico.total) pico = { fecha, total: t };

  const fuente = (s: SesionReporte) => (estado === "asistio" ? s.asistio : s.falta);
  const porGenero = sesiones.reduce<ConteoGenero>(
    (a, s) => ({ f: a.f + fuente(s).f, m: a.m + fuente(s).m, nb: a.nb + fuente(s).nb, sa: a.sa + fuente(s).sa }),
    { f: 0, m: 0, nb: 0, sa: 0 },
  );

  return {
    sesiones: sesiones.length,
    total,
    asistencias,
    faltas,
    porcentajeAsistencia: asistencias + faltas ? Math.round((asistencias / (asistencias + faltas)) * 1000) / 10 : null,
    promedioPorSesion: sesiones.length ? Math.round((total / sesiones.length) * 10) / 10 : null,
    pico,
    porGenero,
  };
}

/** Total por disciplina, de mayor a menor. */
export function porActividad(
  sesiones: SesionReporte[],
  estado: FiltroEstado,
  genero: FiltroGenero,
): { etiqueta: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const s of sesiones) m.set(s.disciplina, (m.get(s.disciplina) ?? 0) + valorSesion(s, estado, genero));
  return [...m].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Todas las fechas del rango (inclusive). */
export function fechasDelRango(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  for (let f = desde; f <= hasta && fechas.length <= RANGO_MAXIMO_DIAS; f = sumarDias(f, 1)) fechas.push(f);
  return fechas;
}

/** Total por fecha; incluye las fechas sin datos (en 0) para no ocultar huecos. */
export function porDia(
  sesiones: SesionReporte[],
  desde: string,
  hasta: string,
  estado: FiltroEstado,
  genero: FiltroGenero,
  dias: number[] | null,
): { fecha: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const s of sesiones) m.set(s.fecha, (m.get(s.fecha) ?? 0) + valorSesion(s, estado, genero));
  return fechasDelRango(desde, hasta)
    .filter((f) => !dias || dias.includes(diaSemanaIso(f)))
    .map((fecha) => ({ fecha, valor: m.get(fecha) ?? 0 }));
}

// --- Gimnasio ---------------------------------------------------------------

export type EntradaGimnasio = { fecha: string; dia: number; hora: number; turno: "manana" | "tarde" | null };

/** Entradas por fecha, separadas por turno (Mañana, Tarde, Solo hora). */
export function entradasPorDiaYTurno(
  entradas: EntradaGimnasio[],
  desde: string,
  hasta: string,
  dias: number[] | null,
): { fecha: string; manana: number; tarde: number; sinNombre: number }[] {
  const base = new Map(
    fechasDelRango(desde, hasta)
      .filter((f) => !dias || dias.includes(diaSemanaIso(f)))
      .map((f) => [f, { fecha: f, manana: 0, tarde: 0, sinNombre: 0 }]),
  );
  for (const e of entradas) {
    const fila = base.get(e.fecha);
    if (!fila) continue;
    if (e.turno === "manana") fila.manana++;
    else if (e.turno === "tarde") fila.tarde++;
    else fila.sinNombre++;
  }
  return [...base.values()];
}

/**
 * Concurrencia: entradas por día de la semana (1–7) y hora (0–23).
 * Devuelve solo el rango de horas con datos, para no dibujar madrugadas vacías.
 */
export function concurrencia(entradas: EntradaGimnasio[]): {
  horas: number[];
  celdas: { dia: number; hora: number; valor: number }[];
  maximo: number;
} {
  if (entradas.length === 0) return { horas: [], celdas: [], maximo: 0 };
  const conteo = new Map<string, number>();
  let min = 23;
  let max = 0;
  for (const e of entradas) {
    conteo.set(`${e.dia}-${e.hora}`, (conteo.get(`${e.dia}-${e.hora}`) ?? 0) + 1);
    min = Math.min(min, e.hora);
    max = Math.max(max, e.hora);
  }
  const horas = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const celdas = [];
  let maximo = 0;
  for (let dia = 1; dia <= 7; dia++) {
    for (const hora of horas) {
      const valor = conteo.get(`${dia}-${hora}`) ?? 0;
      maximo = Math.max(maximo, valor);
      celdas.push({ dia, hora, valor });
    }
  }
  return { horas, celdas, maximo };
}

/** Día de la semana y hora con más entradas. */
export function horaPico(entradas: EntradaGimnasio[]): { dia: number; hora: number; valor: number } | null {
  const { celdas } = concurrencia(entradas);
  return celdas.reduce<{ dia: number; hora: number; valor: number } | null>(
    (a, c) => (c.valor > 0 && (!a || c.valor > a.valor) ? c : a),
    null,
  );
}

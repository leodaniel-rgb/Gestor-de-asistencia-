import { ahoraMx, rangoPeriodo, sumarDias, type Periodo } from "@/lib/fechas";
import { RANGO_MAXIMO_DIAS, type FiltroEstado, type FiltroGenero } from "@/lib/reportes";

export type Params = Record<string, string | string[] | undefined>;

export type Filtros = {
  vista: "listas" | "gimnasio";
  periodo: Periodo;
  desde: string;
  hasta: string;
  disciplina: string | null;
  dias: number[] | null;
  estado: FiltroEstado;
  genero: FiltroGenero;
  corregidas: boolean;
  error?: string;
};

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Lee y valida los filtros de la URL. Nunca confía en ellos: todo se re-valida en la base. */
export function leerFiltros(p: Params): Filtros {
  const hoy = ahoraMx().fecha;
  const vista = uno(p.vista) === "gimnasio" ? "gimnasio" : "listas";
  const periodo = (["semana", "semana-pasada", "mes", "libre"] as const).find((x) => x === uno(p.periodo)) ?? "semana";

  let { desde, hasta } = periodo === "libre" ? { desde: uno(p.desde), hasta: uno(p.hasta) } : rangoPeriodo(periodo, hoy);
  let error: string | undefined;
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
    ({ desde, hasta } = rangoPeriodo("semana", hoy));
    if (periodo === "libre") error = "Rango de fechas no válido; se muestra la semana actual.";
  } else if (sumarDias(desde, RANGO_MAXIMO_DIAS) < hasta) {
    error = "El rango máximo es de 3 meses; se ajustó la fecha final.";
    hasta = sumarDias(desde, RANGO_MAXIMO_DIAS);
  }

  const diasCrudos = (Array.isArray(p.dias) ? p.dias : p.dias ? [p.dias] : [])
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const dias = diasCrudos.length && diasCrudos.length < 7 ? [...new Set(diasCrudos)].sort() : null;

  const disciplina = /^[0-9a-f-]{36}$/i.test(uno(p.disciplina)) ? uno(p.disciplina) : null;
  const estado: FiltroEstado = uno(p.estado) === "falta" ? "falta" : "asistio";
  const genero = (["f", "m", "nb", "sa"] as const).find((g) => g === uno(p.genero)) ?? "todos";

  return { vista, periodo, desde, hasta, disciplina, dias, estado, genero, corregidas: uno(p.corregidas) === "1", error };
}

const formatoLargo = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const formatoDia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });

/** "Semana del 12 al 18 de octubre de 2026" / "Del 1 de septiembre al 21 de octubre de 2026". */
export function describirRango(f: Pick<Filtros, "periodo" | "desde" | "hasta">): string {
  const d = new Date(`${f.desde}T00:00:00Z`);
  const h = new Date(`${f.hasta}T00:00:00Z`);
  const mismoMes = f.desde.slice(0, 7) === f.hasta.slice(0, 7);
  const texto = mismoMes
    ? `del ${d.getUTCDate()} al ${formatoLargo.format(h)}`
    : `del ${formatoDia.format(d)} al ${formatoLargo.format(h)}`;
  const prefijo = f.periodo === "semana" || f.periodo === "semana-pasada" ? "Semana " : "";
  const r = prefijo + texto;
  return r.charAt(0).toUpperCase() + r.slice(1);
}

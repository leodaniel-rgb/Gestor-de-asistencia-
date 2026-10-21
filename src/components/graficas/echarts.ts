// Carga modular de ECharts: solo los tipos y componentes que usan los dashboards.
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };

/**
 * Paletas validadas con scripts/validate_palette.js (skill dataviz):
 * - claro (fondo #ffffff): PASA; el aqua queda < 3:1 → leyenda + etiquetas + tabla.
 * - oscuro (fondo #0f1011): PASA todas las pruebas.
 * Solo se usan 3 colores de serie (válidos en todas las combinaciones).
 * "Sin asignar" usa un gris neutro, no un color de serie.
 */
export const TEMAS = {
  claro: {
    fondo: "#ffffff",
    tinta: "#0b0b0b",
    secundaria: "#52514e",
    tenue: "#898781",
    rejilla: "#e1e0d9",
    eje: "#c3c2b7",
    series: ["#2a78d6", "#eb6834", "#1baf7a"],
    neutro: "#898781",
    calor: ["#cde2fb", "#6da7ec", "#256abf", "#0d366b"],
  },
  oscuro: {
    fondo: "#0f1011",
    tinta: "#ffffff",
    secundaria: "#d0d6e0",
    tenue: "#8a8f98",
    rejilla: "#23252a",
    eje: "#383b3f",
    series: ["#3987e5", "#d95926", "#199e70"],
    neutro: "#8a8f98",
    calor: ["#16263b", "#1c5cab", "#5598e7", "#b7d3f6"],
  },
} as const;

export type NombreTema = keyof typeof TEMAS;

/**
 * El lienzo (canvas) no entiende variables CSS: se usa la fuente ya resuelta
 * del documento (Inter autoalojada por next/font).
 */
export function fuente(): string {
  if (typeof document === "undefined") return 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return getComputedStyle(document.body).fontFamily;
}

/** Renderiza una opción en un lienzo temporal con tema claro y devuelve el PNG. */
export function exportarPng(opcion: echarts.EChartsCoreOption, ancho = 1200, alto = 640): string {
  const contenedor = document.createElement("div");
  contenedor.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px;`;
  document.body.appendChild(contenedor);
  const grafica = echarts.init(contenedor, undefined, { renderer: "canvas", width: ancho, height: alto });
  try {
    grafica.setOption({ ...opcion, animation: false });
    return grafica.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: TEMAS.claro.fondo });
  } finally {
    grafica.dispose();
    contenedor.remove();
  }
}

export function descargar(url: string, nombre: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
}

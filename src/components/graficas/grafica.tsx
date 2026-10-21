"use client";

import { useEffect, useRef, useState } from "react";
import { descargar, echarts, exportarPng, fuente, TEMAS, type NombreTema } from "./echarts";

export type TipoGrafica = "barras" | "barras-h" | "lineas" | "pastel";

const ETIQUETA_TIPO: Record<TipoGrafica, string> = {
  barras: "Barras",
  "barras-h": "Barras horizontales",
  lineas: "Líneas",
  pastel: "Pastel",
};

export type Serie = {
  nombre: string;
  valores: number[];
  /** Índice de color fijo (0–2) o "neutro". El color sigue a la entidad, nunca al orden. */
  color: 0 | 1 | 2 | "neutro";
};

type Props = {
  titulo: string;
  subtitulo: string; // p. ej. el periodo; aparece en el PNG
  categorias: string[];
  series: Serie[];
  tipos: TipoGrafica[]; // el primero es el predeterminado
  /** Colores fijos por categoría; necesarios para ofrecer "pastel". */
  coloresCategorias?: Serie["color"][];
  apiladas?: boolean;
  nombreArchivo: string;
  alto?: number;
};

const MAX_PASTEL = 6; // un pastel con más de 6 rebanadas no se lee

function construirOpcion(
  p: Pick<Props, "categorias" | "series" | "apiladas" | "coloresCategorias">,
  tipo: TipoGrafica,
  tema: NombreTema,
  encabezado?: { titulo: string; subtitulo: string },
): echarts.EChartsCoreOption {
  const t = TEMAS[tema];
  const color = (s: Serie) => (s.color === "neutro" ? t.neutro : t.series[s.color]);
  const texto = { color: t.secundaria, fontFamily: fuente(), fontSize: 12 };
  const variasSeries = p.series.length > 1;
  const pocasCategorias = p.categorias.length <= 12;
  const titulo = encabezado
    ? {
        title: {
          text: encabezado.titulo,
          subtext: encabezado.subtitulo,
          left: 16,
          top: 12,
          textStyle: { color: t.tinta, fontFamily: fuente(), fontSize: 18, fontWeight: 500 },
          subtextStyle: { color: t.tenue, fontFamily: fuente(), fontSize: 13 },
        },
      }
    : {};
  const arriba = encabezado ? 84 : variasSeries ? 40 : 16;
  const tooltipBase = {
    backgroundColor: tema === "claro" ? "#ffffff" : "#161718",
    borderColor: t.eje,
    textStyle: { color: t.tinta, fontFamily: fuente(), fontSize: 13 },
    valueFormatter: (v: unknown) => (typeof v === "number" ? v.toLocaleString("es-MX") : String(v)),
  };
  const leyenda = variasSeries
    ? { legend: { top: encabezado ? 56 : 0, right: 16, textStyle: texto, itemWidth: 12, itemHeight: 12, icon: "roundRect" } }
    : {};

  if (tipo === "pastel") {
    const s = p.series[0];
    return {
      ...titulo,
      backgroundColor: "transparent",
      tooltip: { ...tooltipBase, trigger: "item" },
      // La leyenda lleva el valor: así no hacen falta etiquetas fuera del pastel (se cortan en celular).
      legend: {
        bottom: 0,
        textStyle: texto,
        itemWidth: 12,
        itemHeight: 12,
        icon: "roundRect",
        formatter: (nombre: string) => {
          const i = p.categorias.indexOf(nombre);
          const total = s.valores.reduce((a, v) => a + v, 0) || 1;
          return `${nombre} ${s.valores[i]} (${Math.round((s.valores[i] / total) * 100)}%)`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["0%", "70%"],
          center: ["50%", encabezado ? "55%" : "46%"],
          // Anillo de 2px del color de fondo entre rebanadas.
          itemStyle: { borderColor: t.fondo, borderWidth: 2 },
          // Porcentaje dentro de las rebanadas grandes; el resto se lee en la leyenda o la tabla.
          label: { show: true, position: "inside", color: "#ffffff", fontFamily: fuente(), fontWeight: 600, formatter: (x: { percent: number }) => `${Math.round(x.percent)}%` },
          minShowLabelAngle: 25,
          labelLine: { show: false },
          data: p.categorias.map((c, i) => {
            const k = p.coloresCategorias?.[i] ?? "neutro";
            return { name: c, value: s.valores[i], itemStyle: { color: k === "neutro" ? t.neutro : t.series[k] } };
          }),
        },
      ],
    };
  }

  const horizontal = tipo === "barras-h";
  const ejeCategorias = {
    type: "category",
    data: p.categorias,
    axisLine: { lineStyle: { color: t.eje } },
    axisTick: { show: false },
    axisLabel: { ...texto, interval: horizontal ? 0 : "auto", hideOverlap: true },
  };
  const ejeValores = {
    type: "value",
    minInterval: 1,
    splitLine: { lineStyle: { color: t.rejilla, type: "solid" } },
    axisLabel: { ...texto, color: t.tenue },
  };

  return {
    ...titulo,
    ...leyenda,
    backgroundColor: "transparent",
    grid: { left: 16, right: 24, top: arriba, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: "axis",
      axisPointer: { type: tipo === "lineas" ? "line" : "shadow", lineStyle: { color: t.eje } },
    },
    xAxis: horizontal ? ejeValores : ejeCategorias,
    yAxis: horizontal ? { ...ejeCategorias, inverse: true } : ejeValores,
    series: p.series.map((s, indice) => {
      const c = color(s);
      if (tipo === "lineas") {
        return {
          name: s.nombre,
          type: "line",
          data: s.valores,
          lineStyle: { width: 2, color: c },
          itemStyle: { color: c, borderColor: t.fondo, borderWidth: 2 },
          symbolSize: 8,
          // Etiqueta selectiva: solo el máximo.
          markPoint: pocasCategorias || !variasSeries
            ? { symbol: "circle", symbolSize: 1, label: { show: true, position: "top", ...texto, color: t.tinta, formatter: "{c}" }, data: [{ type: "max" }] }
            : undefined,
          stack: p.apiladas ? "total" : undefined,
        };
      }
      const ultima = indice === p.series.length - 1;
      return {
        name: s.nombre,
        type: "bar",
        data: s.valores,
        stack: p.apiladas ? "total" : undefined,
        barMaxWidth: 48,
        barGap: "8%",
        itemStyle: {
          color: c,
          // Extremo redondeado de 4px solo en la punta de la barra (la última de la pila).
          borderRadius: !p.apiladas || ultima ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0,
          borderColor: t.fondo,
          borderWidth: p.apiladas ? 1 : 0,
        },
        label: {
          show: pocasCategorias && (!p.apiladas || ultima),
          position: horizontal ? "right" : "top",
          ...texto,
          color: t.tinta,
          formatter: p.apiladas
            ? (d: { dataIndex: number }) => String(p.series.reduce((a, x) => a + (x.valores[d.dataIndex] ?? 0), 0))
            : "{c}",
        },
      };
    }),
  };
}

export function Grafica(props: Props) {
  const { titulo, subtitulo, categorias, series, tipos, apiladas, coloresCategorias, nombreArchivo, alto = 320 } = props;
  const permitidos = tipos.filter(
    (t) => t !== "pastel" || (series.length === 1 && categorias.length <= MAX_PASTEL && !!coloresCategorias),
  );
  const [tipo, setTipo] = useState<TipoGrafica>(permitidos[0]);
  const tipoActual = permitidos.includes(tipo) ? tipo : permitidos[0];
  const [verTabla, setVerTabla] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const grafica = useRef<echarts.ECharts | null>(null);
  const vacio = series.every((s) => s.valores.every((v) => !v));

  const datos = { categorias, series, apiladas, coloresCategorias };
  const opcion = construirOpcion(datos, tipoActual, "oscuro");
  const opcionImpresion = construirOpcion(datos, tipoActual, "claro");

  useEffect(() => {
    if (!ref.current || verTabla || vacio) return;
    const g = echarts.init(ref.current, undefined, { renderer: "canvas" });
    grafica.current = g;
    const observador = new ResizeObserver(() => g.resize());
    observador.observe(ref.current);
    return () => {
      observador.disconnect();
      g.dispose();
      grafica.current = null;
    };
  }, [verTabla, vacio]);

  useEffect(() => {
    grafica.current?.setOption(opcion, { notMerge: true });
    // Al imprimir, el papel es blanco: se cambia al tema claro y se regresa después.
    const antes = () => grafica.current?.setOption(opcionImpresion, { notMerge: true });
    const despues = () => grafica.current?.setOption(opcion, { notMerge: true });
    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", despues);
    return () => {
      window.removeEventListener("beforeprint", antes);
      window.removeEventListener("afterprint", despues);
    };
  }, [opcion, opcionImpresion, verTabla, vacio]);

  function descargarPng() {
    const url = exportarPng(construirOpcion({ categorias, series, apiladas, coloresCategorias }, tipoActual, "claro", { titulo, subtitulo }));
    descargar(url, `${nombreArchivo}.png`);
  }

  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)] print:break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[15px] font-medium text-fg">{titulo}</h2>
        <div className="flex flex-wrap items-center gap-1 print:hidden">
          {permitidos.length > 1 && !verTabla && (
            <select
              value={tipoActual}
              onChange={(e) => setTipo(e.target.value as TipoGrafica)}
              aria-label={`Tipo de gráfica: ${titulo}`}
              className="h-8 rounded-control border border-line bg-surface px-2 text-[13px] text-fg-body"
            >
              {permitidos.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setVerTabla((v) => !v)}
            className="h-8 rounded-control px-2 text-[13px] text-fg-muted hover:bg-elevated hover:text-fg"
          >
            {verTabla ? "Ver gráfica" : "Ver tabla"}
          </button>
          {!vacio && (
            <button
              type="button"
              onClick={descargarPng}
              className="h-8 rounded-control px-2 text-[13px] text-fg-muted hover:bg-elevated hover:text-fg"
            >
              Descargar PNG
            </button>
          )}
        </div>
      </div>

      {vacio ? (
        <p className="py-10 text-center text-sm text-fg-muted">Sin datos en este periodo.</p>
      ) : verTabla ? (
        // key distinto: React debe crear un elemento nuevo y no reutilizar el
        // <div> donde ECharts dibujó (si lo reutiliza, falla al quitar nodos).
        <div key="tabla" className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[13px] text-fg-muted">
                <th className="py-1.5 pr-4 font-normal">&nbsp;</th>
                {series.map((s) => (
                  <th key={s.nombre} className="py-1.5 pr-4 text-right font-normal">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {categorias.map((c, i) => (
                <tr key={c}>
                  <td className="py-1.5 pr-4 text-fg-body">{c}</td>
                  {series.map((s) => (
                    <td key={s.nombre} className="py-1.5 pr-4 text-right tabular-nums text-fg">
                      {s.valores[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div key="grafica" ref={ref} role="img" aria-label={`${titulo}. Usa "Ver tabla" para leer los valores.`} style={{ height: alto }} />
      )}
    </section>
  );
}

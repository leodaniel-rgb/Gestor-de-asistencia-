"use client";

import { useEffect, useRef, useState } from "react";
import { descargar, echarts, exportarPng, fuente, TEMAS, type NombreTema } from "./echarts";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Props = {
  titulo: string;
  subtitulo: string;
  horas: number[];
  celdas: { dia: number; hora: number; valor: number }[];
  maximo: number;
  nombreArchivo: string;
};

const etiquetaHora = (h: number) => `${String(h).padStart(2, "0")}:00`;

function construirOpcion(
  p: Pick<Props, "horas" | "celdas" | "maximo">,
  tema: NombreTema,
  encabezado?: { titulo: string; subtitulo: string },
): echarts.EChartsCoreOption {
  const t = TEMAS[tema];
  const texto = { color: t.secundaria, fontFamily: fuente(), fontSize: 12 };
  return {
    backgroundColor: "transparent",
    ...(encabezado
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
      : {}),
    tooltip: {
      backgroundColor: tema === "claro" ? "#ffffff" : "#161718",
      borderColor: t.eje,
      textStyle: { color: t.tinta, fontFamily: fuente(), fontSize: 13 },
      formatter: (x: { value: [number, number, number] }) =>
        `${DIAS[x.value[1]]} ${etiquetaHora(p.horas[x.value[0]])}: ${x.value[2]} entradas`,
    },
    grid: { left: 16, right: 16, top: encabezado ? 84 : 8, bottom: 56, containLabel: true },
    xAxis: {
      type: "category",
      data: p.horas.map(etiquetaHora),
      axisLine: { lineStyle: { color: t.eje } },
      axisTick: { show: false },
      axisLabel: { ...texto, hideOverlap: true },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: DIAS,
      inverse: true,
      axisLine: { lineStyle: { color: t.eje } },
      axisTick: { show: false },
      axisLabel: texto,
    },
    // Escala secuencial de un solo tono (azul), de casi cero a máximo, con leyenda.
    visualMap: {
      min: 0,
      max: Math.max(1, p.maximo),
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemHeight: 160,
      text: ["Más", "Menos"],
      textStyle: texto,
      inRange: { color: [...t.calor] },
    },
    series: [
      {
        type: "heatmap",
        data: p.celdas.map((c) => [p.horas.indexOf(c.hora), c.dia - 1, c.valor]),
        itemStyle: { borderColor: t.fondo, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: t.tinta, borderWidth: 1 } },
      },
    ],
  };
}

/** Concurrencia del gimnasio: entradas por día de la semana y hora. */
export function MapaCalor({ titulo, subtitulo, horas, celdas, maximo, nombreArchivo }: Props) {
  const [verTabla, setVerTabla] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const vacio = maximo === 0;
  const opcion = construirOpcion({ horas, celdas, maximo }, "oscuro");
  const opcionImpresion = construirOpcion({ horas, celdas, maximo }, "claro");

  useEffect(() => {
    if (!ref.current || verTabla || vacio) return;
    const g = echarts.init(ref.current, undefined, { renderer: "canvas" });
    g.setOption(opcion, { notMerge: true });
    const observador = new ResizeObserver(() => g.resize());
    observador.observe(ref.current);
    const antes = () => g.setOption(opcionImpresion, { notMerge: true });
    const despues = () => g.setOption(opcion, { notMerge: true });
    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", despues);
    return () => {
      observador.disconnect();
      window.removeEventListener("beforeprint", antes);
      window.removeEventListener("afterprint", despues);
      g.dispose();
    };
  }, [opcion, opcionImpresion, verTabla, vacio]);

  const porDia = DIAS.map((d, i) => ({ dia: d, valores: horas.map((h) => celdas.find((c) => c.dia === i + 1 && c.hora === h)?.valor ?? 0) }));

  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-[inset_0_0_0_1px_var(--line)] print:break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[15px] font-medium text-fg">{titulo}</h2>
        <div className="flex gap-1 print:hidden">
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
              onClick={() =>
                descargar(
                  exportarPng(construirOpcion({ horas, celdas, maximo }, "claro", { titulo, subtitulo }), 1200, 520),
                  `${nombreArchivo}.png`,
                )
              }
              className="h-8 rounded-control px-2 text-[13px] text-fg-muted hover:bg-elevated hover:text-fg"
            >
              Descargar PNG
            </button>
          )}
        </div>
      </div>
      {vacio ? (
        <p className="py-10 text-center text-sm text-fg-muted">Sin entradas en este periodo.</p>
      ) : verTabla ? (
        // key distinto: no reutilizar el <div> donde dibujó ECharts.
        <div key="tabla" className="overflow-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-[13px] text-fg-muted">
                <th className="py-1.5 pr-3 text-left font-normal">&nbsp;</th>
                {horas.map((h) => (
                  <th key={h} className="px-1.5 py-1.5 text-right font-normal">
                    {etiquetaHora(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {porDia.map((f) => (
                <tr key={f.dia}>
                  <td className="py-1.5 pr-3 text-fg-body">{f.dia}</td>
                  {f.valores.map((v, i) => (
                    <td key={i} className="px-1.5 py-1.5 text-right tabular-nums text-fg">
                      {v || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div key="grafica" ref={ref} role="img" aria-label={`${titulo}. Usa "Ver tabla" para leer los valores.`} style={{ height: 340 }} />
      )}
    </section>
  );
}

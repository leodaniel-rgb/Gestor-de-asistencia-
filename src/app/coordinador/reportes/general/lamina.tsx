"use client";

import { useEffect, useState } from "react";
import { descargar, exportarPng, fuente, TEMAS, type echarts } from "@/components/graficas/echarts";
import { construirOpcion, type Serie, type TipoGrafica } from "@/components/graficas/grafica";
import { construirOpcionCalor } from "@/components/graficas/mapa-calor";
import { Boton } from "@/components/ui";

// Datos ya calculados en el servidor (sin nombres ni matrículas).

export type Indicador = { etiqueta: string; valor: string; detalle?: string };
type Genero4 = { f: number; m: number; nb: number; sa: number };

export type DatosListas = {
  tipo: "listas";
  titulo: string;
  rango: string;
  pie: string;
  asistio: { indicadores: Indicador[]; genero: Genero4 };
  falta: { indicadores: Indicador[]; genero: Genero4 };
  ambas: Indicador[];
  actividades: { etiqueta: string; asistio: number; falta: number }[];
  dias: { etiqueta: string; asistio: number; falta: number }[];
  incidencias: string[];
  tabla: { titulo: string; columnas: string[]; filas: string[][]; numericas: number };
};

export type DatosGimnasio = {
  tipo: "gimnasio";
  titulo: string;
  rango: string;
  pie: string;
  indicadores: Indicador[];
  porDiaTurno: { categorias: string[]; series: Serie[] };
  diasSemana: { categorias: string[]; valores: number[] };
  sinSalida: { categorias: string[]; valores: number[] };
  calor: { horas: number[]; celdas: { dia: number; hora: number; valor: number }[]; maximo: number };
  genero: Genero4;
};

type Mostrar = "asistio" | "falta" | "ambas";

const ETIQUETA_MOSTRAR: Record<Mostrar, string> = { asistio: "Asistencia", falta: "Inasistencia", ambas: "Ambas" };

// --- Contenido de la lámina ---------------------------------------------------

type Bloque =
  | { clase: "grafica"; titulo: string; subtitulo: string; opcion: () => echarts.EChartsCoreOption; ancho: "medio" | "completo"; alto: number }
  | { clase: "texto"; titulo: string; lineas: string[]; ancho: "medio" | "completo" }
  | { clase: "tabla"; titulo: string; columnas: string[]; filas: string[][]; numericas: number };

type Lamina = { titulo: string; subtitulo: string; indicadores: Indicador[]; bloques: Bloque[]; pie: string };

function grafica(
  titulo: string,
  subtitulo: string,
  categorias: string[],
  series: Serie[],
  tipo: TipoGrafica,
  extra: { apiladas?: boolean; coloresCategorias?: Serie["color"][]; ancho?: "medio" | "completo"; alto?: number } = {},
): Bloque {
  return {
    clase: "grafica",
    titulo,
    subtitulo,
    ancho: extra.ancho ?? "medio",
    alto: extra.alto ?? 400,
    opcion: () =>
      construirOpcion({ categorias, series, apiladas: extra.apiladas, coloresCategorias: extra.coloresCategorias }, tipo, "claro", {
        titulo,
        subtitulo,
      }),
  };
}

const GENEROS = ["Mujeres", "Hombres", "No binario", "Sin asignar"];
const valoresGenero = (g: Genero4) => [g.f, g.m, g.nb, g.sa];

function laminaListas(d: DatosListas, mostrar: Mostrar): Lamina {
  const series = (lista: { asistio: number; falta: number }[]) => {
    const s: Serie[] = [];
    if (mostrar !== "falta") s.push({ nombre: "Asistencias", valores: lista.map((x) => x.asistio), color: 0 });
    if (mostrar !== "asistio") s.push({ nombre: "Faltas", valores: lista.map((x) => x.falta), color: 1 });
    return s;
  };
  const que = mostrar === "ambas" ? "Asistencias y faltas" : mostrar === "asistio" ? "Asistencia" : "Faltas";
  const bloques: Bloque[] = [
    grafica(`${que} por actividad`, d.rango, d.actividades.map((a) => a.etiqueta), series(d.actividades),
      d.actividades.length > 6 ? "barras-h" : "barras"),
    grafica(`${que} por día`, d.rango, d.dias.map((x) => x.etiqueta), series(d.dias), "lineas"),
  ];
  if (mostrar === "ambas") {
    bloques.push(
      grafica("Por género", d.rango, GENEROS, [
        { nombre: "Asistencias", valores: valoresGenero(d.asistio.genero), color: 0 },
        { nombre: "Faltas", valores: valoresGenero(d.falta.genero), color: 1 },
      ], "barras"),
    );
  } else {
    bloques.push(
      grafica(`${que} por género`, d.rango, GENEROS, [{ nombre: que, valores: valoresGenero(d[mostrar].genero), color: 0 }], "pastel", {
        coloresCategorias: [0, 1, 2, "neutro"],
      }),
    );
  }
  bloques.push({ clase: "texto", titulo: "Reporte de incidencias", lineas: d.incidencias, ancho: "medio" });
  bloques.push({ clase: "tabla", ...d.tabla });

  return {
    titulo: d.titulo,
    subtitulo: d.rango,
    indicadores: mostrar === "ambas" ? d.ambas : d[mostrar].indicadores,
    bloques,
    pie: d.pie,
  };
}

function laminaGimnasio(d: DatosGimnasio): Lamina {
  const conocidos = d.genero.f + d.genero.m + d.genero.nb;
  const bloques: Bloque[] = [
    grafica("Entradas por día y turno", d.rango, d.porDiaTurno.categorias, d.porDiaTurno.series, "barras", { apiladas: true }),
    grafica("Días más concurridos", d.rango, d.diasSemana.categorias, [{ nombre: "Entradas", valores: d.diasSemana.valores, color: 0 }], "barras"),
    {
      clase: "grafica",
      titulo: "Concurrencia por día y hora",
      subtitulo: d.rango,
      ancho: "completo",
      alto: 460,
      opcion: () => construirOpcionCalor(d.calor, "claro", { titulo: "Concurrencia por día y hora", subtitulo: d.rango }),
    },
    grafica("Salidas no marcadas por día", d.rango, d.sinSalida.categorias, [{ nombre: "Sin salida", valores: d.sinSalida.valores, color: 1 }], "barras"),
    conocidos === 0
      ? {
          clase: "texto",
          titulo: "Alumnos por género",
          lineas: [`Ningún alumno del periodo tiene género asignado (${d.genero.sa} sin asignar).`, "El kiosco no pide el género: se asigna en el directorio de alumnos."],
          ancho: "medio",
        }
      : grafica(
          "Alumnos por género",
          `Alumnos distintos con género asignado · ${d.genero.sa} sin asignar`,
          ["Mujeres", "Hombres", "No binario"],
          [{ nombre: "Alumnos", valores: [d.genero.f, d.genero.m, d.genero.nb], color: 0 }],
          "pastel",
          { coloresCategorias: [0, 1, 2] },
        ),
  ];
  return { titulo: d.titulo, subtitulo: d.rango, indicadores: d.indicadores, bloques, pie: d.pie };
}

// --- Dibujo en un solo lienzo ---------------------------------------------------

const ANCHO = 1600;
const MARGEN = 40;
const SEPARACION = 20;
const ESCALA = 2;
const FILA_TABLA = 30;

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function alturaBloque(b: Bloque): number {
  if (b.clase === "grafica") return b.alto;
  if (b.clase === "texto") return Math.max(160, 64 + b.lineas.length * 24);
  return 64 + (b.filas.length + 1) * FILA_TABLA;
}

/** Arma la lámina completa (encabezado, indicadores, gráficas y tablas) en un PNG. */
async function dibujar(l: Lamina): Promise<string> {
  await document.fonts.ready;
  const t = TEMAS.claro;
  const f = fuente();
  const util = ANCHO - MARGEN * 2;
  const medio = (util - SEPARACION) / 2;

  // Distribución: los bloques "medio" se acomodan de dos en dos.
  type Pos = { b: Bloque; x: number; y: number; w: number; h: number };
  const pos: Pos[] = [];
  let y = MARGEN + 36 + 28 + 96 + 28;
  let pendiente: Bloque | null = null;
  const fila = (a: Bloque, b: Bloque | null) => {
    const h = Math.max(alturaBloque(a), b ? alturaBloque(b) : 0);
    pos.push({ b: a, x: MARGEN, y, w: b ? medio : a.clase !== "tabla" && "ancho" in a && a.ancho === "medio" ? medio : util, h });
    if (b) pos.push({ b, x: MARGEN + medio + SEPARACION, y, w: medio, h });
    y += h + SEPARACION;
  };
  for (const b of l.bloques) {
    const esMedio = b.clase !== "tabla" && b.ancho === "medio";
    if (esMedio && pendiente) {
      fila(pendiente, b);
      pendiente = null;
    } else if (esMedio) {
      pendiente = b;
    } else {
      if (pendiente) fila(pendiente, null);
      pendiente = null;
      fila(b, null);
    }
  }
  if (pendiente) fila(pendiente, null);
  const alto = y + 24;

  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO * ESCALA;
  lienzo.height = alto * ESCALA;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Sin lienzo 2D");
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = t.fondo;
  ctx.fillRect(0, 0, ANCHO, alto);
  ctx.textBaseline = "top";

  // Encabezado
  ctx.fillStyle = t.tinta;
  ctx.font = `600 30px ${f}`;
  ctx.fillText(l.titulo.toUpperCase(), MARGEN, MARGEN);
  ctx.fillStyle = t.tenue;
  ctx.font = `400 16px ${f}`;
  ctx.fillText(l.subtitulo, MARGEN, MARGEN + 40);

  // Indicadores
  const yInd = MARGEN + 36 + 28;
  const n = l.indicadores.length;
  const wInd = (util - SEPARACION * (n - 1)) / n;
  l.indicadores.forEach((ind, i) => {
    const x = MARGEN + i * (wInd + SEPARACION);
    ctx.fillStyle = "#f5f8fc";
    ctx.strokeStyle = t.rejilla;
    ctx.beginPath();
    ctx.roundRect(x, yInd, wInd, 96, 12);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = t.tinta;
    ctx.font = `600 28px ${f}`;
    ctx.fillText(ind.valor, x + wInd / 2, yInd + 16, wInd - 16);
    ctx.fillStyle = t.secundaria;
    ctx.font = `500 12px ${f}`;
    ctx.fillText(ind.etiqueta.toUpperCase(), x + wInd / 2, yInd + 54, wInd - 16);
    if (ind.detalle) {
      ctx.fillStyle = t.tenue;
      ctx.font = `400 12px ${f}`;
      ctx.fillText(ind.detalle, x + wInd / 2, yInd + 72, wInd - 16);
    }
    ctx.textAlign = "left";
  });

  // Bloques
  for (const p of pos) {
    ctx.strokeStyle = t.rejilla;
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.w, p.h, 12);
    ctx.stroke();
    const b = p.b;
    if (b.clase === "grafica") {
      const img = await cargarImagen(exportarPng(b.opcion(), Math.round(p.w), b.alto));
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 12);
      ctx.clip();
      ctx.drawImage(img, p.x, p.y, p.w, b.alto);
      ctx.restore();
    } else if (b.clase === "texto") {
      ctx.fillStyle = t.tinta;
      ctx.font = `500 18px ${f}`;
      ctx.fillText(b.titulo, p.x + 16, p.y + 16);
      ctx.font = `400 15px ${f}`;
      ctx.fillStyle = t.secundaria;
      b.lineas.forEach((linea, i) => ctx.fillText(`• ${linea}`, p.x + 16, p.y + 52 + i * 24, p.w - 32));
    } else {
      ctx.fillStyle = t.tinta;
      ctx.font = `500 18px ${f}`;
      ctx.fillText(b.titulo, p.x + 16, p.y + 16);
      const yT = p.y + 52;
      const anchoCol = (p.w - 32) / b.columnas.length;
      const primeras = b.columnas.length - b.numericas;
      ctx.fillStyle = "#eef3f9";
      ctx.fillRect(p.x + 16, yT, p.w - 32, FILA_TABLA);
      const celda = (texto: string, col: number, yFila: number) => {
        const derecha = col >= primeras;
        ctx.textAlign = derecha ? "right" : "left";
        const x = p.x + 16 + col * anchoCol + (derecha ? anchoCol - 12 : 12);
        ctx.fillText(texto, x, yFila + 8, anchoCol - 24);
      };
      ctx.font = `500 13px ${f}`;
      ctx.fillStyle = t.secundaria;
      b.columnas.forEach((c, i) => celda(c, i, yT));
      ctx.font = `400 13px ${f}`;
      b.filas.forEach((filaT, r) => {
        const yFila = yT + (r + 1) * FILA_TABLA;
        if (r % 2 === 1) {
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(p.x + 16, yFila, p.w - 32, FILA_TABLA);
        }
        ctx.fillStyle = t.tinta;
        filaT.forEach((v, i) => celda(v, i, yFila));
      });
      ctx.textAlign = "left";
    }
  }

  ctx.fillStyle = t.tenue;
  ctx.font = `400 12px ${f}`;
  ctx.fillText(l.pie, MARGEN, alto - 32, util);

  return lienzo.toDataURL("image/png");
}

// --- Componente -------------------------------------------------------------------

export function LaminaGeneral({ datos, nombreArchivo }: { datos: DatosListas | DatosGimnasio; nombreArchivo: string }) {
  const [mostrar, setMostrar] = useState<Mostrar>("asistio");
  const [imagen, setImagen] = useState<{ clave: string; url: string } | null>(null);
  const [error, setError] = useState(false);
  const clave = datos.tipo === "listas" ? mostrar : "gimnasio";

  useEffect(() => {
    let vigente = true;
    const lamina = datos.tipo === "listas" ? laminaListas(datos, mostrar) : laminaGimnasio(datos);
    dibujar(lamina)
      .then((url) => vigente && setImagen({ clave, url }))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [datos, mostrar, clave]);

  const lista = imagen?.clave === clave ? imagen.url : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {datos.tipo === "listas" && (
          <fieldset className="flex items-center gap-1 text-[13px]">
            <legend className="sr-only">Qué mostrar</legend>
            {(["asistio", "falta", "ambas"] as const).map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-full px-3 py-1.5 ${m === mostrar ? "bg-white/10 text-fg" : "text-fg-muted hover:bg-white/5"}`}
              >
                <input type="radio" name="mostrar" value={m} checked={m === mostrar} onChange={() => setMostrar(m)} className="sr-only" />
                {ETIQUETA_MOSTRAR[m]}
              </label>
            ))}
          </fieldset>
        )}
        <Boton
          variante="primario"
          disabled={!lista}
          onClick={() => lista && descargar(lista, `${nombreArchivo}${datos.tipo === "listas" ? `-${mostrar}` : ""}.png`)}
        >
          Descargar imagen (PNG)
        </Boton>
        <Boton onClick={() => window.print()} disabled={!lista}>
          Imprimir o guardar PDF
        </Boton>
      </div>
      {error ? (
        <p className="text-sm text-danger">No se pudo generar la imagen. Recarga la página.</p>
      ) : lista ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador (data URL)
        <img src={lista} alt={`${datos.titulo}. ${datos.rango}`} className="w-full rounded-card bg-white print:rounded-none" />
      ) : (
        <p className="text-sm text-fg-muted">Generando imagen…</p>
      )}
    </div>
  );
}

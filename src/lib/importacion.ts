export const MAX_FILAS_IMPORTACION = 300;

type Celda = unknown;

function normalizarEncabezado(valor: Celda): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export type FilasExtraidas =
  | { ok: true; filas: { fila: number; matricula: string; nombre: string }[] }
  | { ok: false; error: string };

/**
 * Busca la fila de encabezados (entre las primeras 10) con las columnas
 * "Nombre" y "Matrícula" (sin importar mayúsculas ni acentos) y devuelve las
 * filas con datos. Ignora cualquier otra columna (p. ej. "Nivel").
 * `fila` es el número de fila tal como se ve en Excel (empieza en 1).
 */
export function extraerFilas(hoja: Celda[][]): FilasExtraidas {
  for (let i = 0; i < Math.min(hoja.length, 10); i++) {
    const encabezados = hoja[i].map(normalizarEncabezado);
    const colNombre = encabezados.indexOf("nombre");
    const colMatricula = encabezados.findIndex((e) => e === "matricula");
    if (colNombre === -1 || colMatricula === -1) continue;

    const filas = [];
    for (let j = i + 1; j < hoja.length; j++) {
      const nombre = String(hoja[j][colNombre] ?? "").trim();
      const matricula = String(hoja[j][colMatricula] ?? "").trim();
      if (!nombre && !matricula) continue;
      filas.push({ fila: j + 1, matricula, nombre });
    }
    if (filas.length === 0) return { ok: false, error: "El archivo no tiene alumnos debajo de los encabezados." };
    if (filas.length > MAX_FILAS_IMPORTACION) {
      return { ok: false, error: `El archivo tiene ${filas.length} filas; el máximo es ${MAX_FILAS_IMPORTACION}.` };
    }
    return { ok: true, filas };
  }
  return {
    ok: false,
    error: 'No se encontraron las columnas "Nombre" y "Matrícula" en las primeras 10 filas.',
  };
}

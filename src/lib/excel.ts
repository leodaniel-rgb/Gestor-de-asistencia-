import "server-only";
import writeExcelFile, { type Sheet, type SheetData } from "write-excel-file/node";

type Valor = string | number | boolean | null | undefined;

export type Hoja = { nombre: string; encabezados: string[]; filas: Valor[][] };

// Nombres de hoja: máx. 31 caracteres y sin : \ / ? * [ ]
const nombreSeguro = (n: string) => n.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);

/**
 * Genera un .xlsx con encabezados en negritas y la primera fila fija.
 * Los textos se escriben como texto, nunca como fórmulas: un nombre que
 * empiece con "=" no se ejecuta en Excel.
 */
export async function generarExcel(hojas: Hoja[]): Promise<Buffer> {
  const sheets: Sheet<Buffer>[] = hojas.map((h) => {
    const data: SheetData = [
      h.encabezados.map((e) => ({ value: e, fontWeight: "bold" as const })),
      ...h.filas.map((fila) =>
        fila.map((v) =>
          v === null || v === undefined || v === ""
            ? null
            : typeof v === "string"
              ? { value: v, type: String }
              : { value: v },
        ),
      ),
    ];
    const anchos = h.encabezados.map((e, i) =>
      Math.min(48, Math.max(e.length, ...h.filas.slice(0, 200).map((f) => String(f[i] ?? "").length)) + 2),
    );
    return { data, sheet: nombreSeguro(h.nombre), columns: anchos.map((width) => ({ width })), stickyRowsCount: 1 };
  });
  return writeExcelFile(sheets, { fontFamily: "Calibri", fontSize: 11 }).toBuffer();
}

/** Respuesta de descarga sin caché (contiene datos personales). */
export function respuestaExcel(buffer: Buffer, nombreArchivo: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export const ETIQUETA_GENERO_EXCEL: Record<string, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  no_binario: "No binario",
};
export const ETIQUETA_ESTADO_EXCEL: Record<string, string> = { asistio: "Asistió", falta: "Falta" };
export const siNo = (v: unknown) => (v ? "Sí" : "No");

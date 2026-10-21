import { describe, expect, it } from "vitest";
import { extraerFilas, MAX_FILAS_IMPORTACION } from "./importacion";

describe("extraerFilas", () => {
  it("lee el formato actual (Nombre, Nivel, Matricula) e ignora Nivel", () => {
    const r = extraerFilas([
      ["Nombre", "Nivel", "Matricula"],
      ["Ana Pérez", "Profesional", "AL07210101"],
      [null, null, null],
      ["Luis Gómez", "Profesional", 7210102], // Excel guardó la matrícula como número
    ]);
    expect(r).toEqual({
      ok: true,
      filas: [
        { fila: 2, matricula: "AL07210101", nombre: "Ana Pérez" },
        { fila: 4, matricula: "7210102", nombre: "Luis Gómez" },
      ],
    });
  });

  it("encuentra encabezados con acento y en otra fila", () => {
    const r = extraerFilas([["Lista de asistencia"], [], ["MATRÍCULA", "nombre"], ["07210101", "Ana"]]);
    expect(r).toEqual({ ok: true, filas: [{ fila: 4, matricula: "07210101", nombre: "Ana" }] });
  });

  it("falla si no hay encabezados", () => {
    expect(extraerFilas([["a", "b"], ["c", "d"]]).ok).toBe(false);
  });

  it("respeta el máximo de filas", () => {
    const hoja = [["Nombre", "Matricula"], ...Array.from({ length: MAX_FILAS_IMPORTACION + 1 }, () => ["X", "AL07210101"])];
    expect(extraerFilas(hoja).ok).toBe(false);
  });
});

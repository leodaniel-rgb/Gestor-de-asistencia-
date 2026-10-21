import { describe, expect, it } from "vitest";
import { PATRON_MATRICULA, normalizarMatricula } from "./matricula";

describe("normalizarMatricula", () => {
  it.each([
    ["AL07210101", "AL07210101"],
    ["al07210101", "AL07210101"],
    ["07210101", "AL07210101"],
    [" 0721 0101 ", "AL07210101"],
    ["AL-07210101", "AL07210101"],
  ])("acepta %s como %s", (entrada, esperada) => {
    expect(normalizarMatricula(entrada)).toEqual({ estado: "valida", matricula: esperada });
  });

  it.each([
    ["7210101", "AL07210101"],
    ["AL7210101", "AL07210101"],
  ])("pide confirmar %s como %s", (entrada, esperada) => {
    expect(normalizarMatricula(entrada)).toEqual({ estado: "confirmar", matricula: esperada });
  });

  it.each(["", "AL", "0721010", "072101011", "17210101", "AB07210101", "AL0721010X", "0721O101"])(
    "rechaza %j",
    (entrada) => {
      expect(normalizarMatricula(entrada)).toEqual({ estado: "invalida" });
    },
  );

  it("todo resultado válido cumple el patrón de la base de datos", () => {
    for (const entrada of ["07210101", "7210101", "AL7210101"]) {
      const r = normalizarMatricula(entrada);
      if (r.estado === "invalida") throw new Error("inesperado");
      expect(r.matricula).toMatch(PATRON_MATRICULA);
    }
  });
});

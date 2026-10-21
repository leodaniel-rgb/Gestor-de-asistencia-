import { describe, expect, it } from "vitest";
import { matriculaDesdeDigitos, sugerirTurno } from "./gimnasio";

describe("sugerirTurno", () => {
  it.each([
    ["06:30", "manana"],
    ["12:59", "manana"],
    ["13:00", null],
    ["14:59", null],
    ["15:00", "tarde"],
    ["21:10", "tarde"],
  ])("%s → %s", (hora, esperado) => {
    expect(sugerirTurno(hora)).toBe(esperado);
  });
});

describe("matriculaDesdeDigitos", () => {
  it("8 dígitos con 0 son válidos", () => {
    expect(matriculaDesdeDigitos("07210101")).toEqual({ estado: "valida", matricula: "AL07210101" });
  });
  it("7 dígitos piden confirmar el 0", () => {
    expect(matriculaDesdeDigitos("7210101")).toEqual({ estado: "confirmar", matricula: "AL07210101" });
  });
  it.each(["", "072101", "0721010", "17210101"])("%j está incompleta", (d) => {
    expect(matriculaDesdeDigitos(d)).toEqual({ estado: "incompleta" });
  });
});

import { describe, expect, it } from "vitest";
import { ahoraMx, describirFecha, diaSemanaIso, fechasCapturables, sumarDias } from "./fechas";

describe("fechas", () => {
  it("usa la hora de San Luis Potosí, no UTC", () => {
    // 2026-10-20 03:30 UTC = 2026-10-19 21:30 en México (UTC-6, sin horario de verano)
    expect(ahoraMx(new Date("2026-10-20T03:30:00Z"))).toEqual({ fecha: "2026-10-19", hora: "21:30" });
  });

  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-11-01", -1)).toBe("2026-10-31");
    expect(sumarDias("2027-01-02", -3)).toBe("2026-12-30");
  });

  it("calcula el día ISO", () => {
    expect(diaSemanaIso("2026-10-19")).toBe(1); // lunes
    expect(diaSemanaIso("2026-10-25")).toBe(7); // domingo
  });

  it("permite hoy y 3 días atrás", () => {
    expect(fechasCapturables("2026-10-19")).toEqual(["2026-10-19", "2026-10-18", "2026-10-17", "2026-10-16"]);
  });

  it("describe fechas", () => {
    expect(describirFecha("2026-10-19", "2026-10-19")).toBe("Hoy");
    expect(describirFecha("2026-10-18", "2026-10-19")).toBe("Ayer");
    expect(describirFecha("2026-10-16", "2026-10-19")).toBe("Viernes, 16 de octubre");
  });
});

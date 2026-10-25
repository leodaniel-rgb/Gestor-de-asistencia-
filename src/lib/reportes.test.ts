import { describe, expect, it } from "vitest";
import {
  concurrencia,
  entradasPorDiaYTurno,
  horaPico,
  porActividad,
  porDia,
  resumenListas,
  resumenPorActividad,
  sinSalidaPorDia,
  type SesionReporte,
} from "./reportes";

const s = (
  id: string,
  fecha: string,
  disciplina: string,
  asistio: [number, number, number, number],
  falta: [number, number, number, number],
): SesionReporte => ({
  id,
  fecha,
  hora: "16:00",
  disciplina_id: disciplina,
  disciplina,
  asistio: { f: asistio[0], m: asistio[1], nb: asistio[2], sa: asistio[3] },
  falta: { f: falta[0], m: falta[1], nb: falta[2], sa: falta[3] },
});

// Semana del ejemplo del coordinador (lunes 12 a viernes 16 de oct. 2026), simplificada.
const sesiones = [
  s("1", "2026-10-12", "Fútbol", [12, 17, 0, 0], [2, 1, 0, 0]),
  s("2", "2026-10-12", "Tochito", [5, 11, 0, 0], [0, 0, 0, 0]),
  s("3", "2026-10-14", "Cocina", [25, 11, 0, 0], [1, 0, 0, 0]),
  s("4", "2026-10-14", "Fútbol", [8, 15, 0, 0], [0, 3, 0, 0]),
];

describe("resumenListas", () => {
  it("calcula indicadores como en el dashboard actual", () => {
    const r = resumenListas(sesiones, "asistio", "todos");
    expect(r.total).toBe(104);
    expect(r.sesiones).toBe(4);
    expect(r.promedioPorSesion).toBe(26);
    expect(r.pico).toEqual({ fecha: "2026-10-14", total: 59 });
    expect(r.porGenero).toEqual({ f: 50, m: 54, nb: 0, sa: 0 });
    expect(r.faltas).toBe(7);
    expect(r.porcentajeAsistencia).toBe(93.7);
  });

  it("filtra por género y por faltas", () => {
    expect(resumenListas(sesiones, "asistio", "f").total).toBe(50);
    expect(resumenListas(sesiones, "falta", "m").total).toBe(4);
  });

  it("sin sesiones no divide entre cero", () => {
    const r = resumenListas([], "asistio", "todos");
    expect(r.promedioPorSesion).toBeNull();
    expect(r.porcentajeAsistencia).toBeNull();
    expect(r.pico).toBeNull();
  });
});

describe("porActividad y porDia", () => {
  it("agrupa por disciplina de mayor a menor", () => {
    expect(porActividad(sesiones, "asistio", "todos")).toEqual([
      { etiqueta: "Fútbol", valor: 52 },
      { etiqueta: "Cocina", valor: 36 },
      { etiqueta: "Tochito", valor: 16 },
    ]);
  });

  it("incluye días sin datos y respeta el filtro de días", () => {
    expect(porDia(sesiones, "2026-10-12", "2026-10-16", "asistio", "todos", null).map((d) => d.valor)).toEqual([
      45, 0, 59, 0, 0,
    ]);
    expect(porDia(sesiones, "2026-10-12", "2026-10-18", "asistio", "todos", [1, 3]).map((d) => d.fecha)).toEqual([
      "2026-10-12",
      "2026-10-14",
    ]);
  });
});

describe("gimnasio", () => {
  const entradas = [
    { fecha: "2026-10-12", dia: 1, hora: 7, turno: "manana" as const },
    { fecha: "2026-10-12", dia: 1, hora: 7, turno: "manana" as const },
    { fecha: "2026-10-12", dia: 1, hora: 18, turno: "tarde" as const },
    { fecha: "2026-10-13", dia: 2, hora: 14, turno: null },
  ];

  it("separa entradas por turno", () => {
    expect(entradasPorDiaYTurno(entradas, "2026-10-12", "2026-10-13", null)).toEqual([
      { fecha: "2026-10-12", manana: 2, tarde: 1, sinNombre: 0 },
      { fecha: "2026-10-13", manana: 0, tarde: 0, sinNombre: 1 },
    ]);
  });

  it("calcula la concurrencia y la hora pico", () => {
    const c = concurrencia(entradas);
    expect(c.horas).toEqual(Array.from({ length: 12 }, (_, i) => 7 + i));
    expect(c.maximo).toBe(2);
    expect(c.celdas).toHaveLength(7 * 12);
    expect(horaPico(entradas)).toEqual({ dia: 1, hora: 7, valor: 2 });
    expect(horaPico([])).toBeNull();
  });
});

describe("reporte general", () => {
  it("suma las salidas no marcadas por día", () => {
    const turnos = [
      { fecha: "2026-10-12", sin_salida: 2 },
      { fecha: "2026-10-12", sin_salida: 1 },
      { fecha: "2026-10-14", sin_salida: 0 },
    ];
    expect(sinSalidaPorDia(turnos, "2026-10-12", "2026-10-14", null)).toEqual([
      { fecha: "2026-10-12", valor: 3 },
      { fecha: "2026-10-13", valor: 0 },
      { fecha: "2026-10-14", valor: 0 },
    ]);
    expect(sinSalidaPorDia(turnos, "2026-10-12", "2026-10-14", [3]).map((d) => d.fecha)).toEqual(["2026-10-14"]);
  });

  it("resume por actividad con porcentaje de asistencia", () => {
    const r = resumenPorActividad([
      s("a", "2026-10-12", "Fútbol", [3, 1, 0, 0], [0, 1, 0, 0]),
      s("b", "2026-10-13", "Fútbol", [2, 2, 0, 0], [0, 0, 0, 0]),
      s("c", "2026-10-13", "Cocina", [0, 0, 0, 0], [0, 0, 0, 0]),
    ]);
    expect(r).toEqual([
      { disciplina: "Fútbol", sesiones: 2, asistencias: 8, faltas: 1, porcentaje: 88.9 },
      { disciplina: "Cocina", sesiones: 1, asistencias: 0, faltas: 0, porcentaje: null },
    ]);
  });
});

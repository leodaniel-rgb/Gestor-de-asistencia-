import { describe, expect, it } from "vitest";
import { esquemaPassword, generarPasswordTemporal } from "./password";

describe("generarPasswordTemporal", () => {
  it("cumple la política y no usa caracteres ambiguos", () => {
    for (let i = 0; i < 500; i++) {
      const p = generarPasswordTemporal();
      expect(p).toHaveLength(14);
      expect(esquemaPassword.safeParse(p).success).toBe(true);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it("no repite contraseñas", () => {
    const vistas = new Set(Array.from({ length: 500 }, () => generarPasswordTemporal()));
    expect(vistas.size).toBe(500);
  });
});

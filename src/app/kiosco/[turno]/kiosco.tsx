"use client";

import Image from "next/image";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Aviso } from "@/components/ui";
import { matriculaDesdeDigitos, type Dispositivo } from "@/lib/gimnasio";
import { buscarAlumno, registrarMovimiento, salirDelKiosco, type EstadoSalida } from "./acciones";

type Pantalla =
  | { paso: "teclado" }
  | { paso: "confirmarMatricula"; matricula: string }
  | { paso: "confirmarAccion"; matricula: string; accion: "entrada" | "salida"; nombreCorto: string }
  | { paso: "nuevo"; matricula: string }
  | { paso: "listo"; mensaje: string }
  | { paso: "error"; mensaje: string }
  | { paso: "cerrado" };

// Tamaños según el dispositivo elegido al abrir el gimnasio.
const TAMANOS: Record<Dispositivo, { tecla: string; titulo: string; ancho: string; boton: string }> = {
  celular: { tecla: "h-16 text-2xl", titulo: "text-2xl", ancho: "max-w-sm", boton: "h-14 text-lg" },
  tablet: { tecla: "h-20 text-3xl", titulo: "text-4xl", ancho: "max-w-lg", boton: "h-16 text-xl" },
  computadora: { tecla: "h-16 text-2xl", titulo: "text-3xl", ancho: "max-w-md", boton: "h-14 text-lg" },
};

const SEGUNDOS_MENSAJE = 3;
const SEGUNDOS_INACTIVIDAD = 20; // la confirmación no se queda con un nombre a la vista

export function Kiosco({
  turnoId,
  descripcionTurno,
  dispositivo,
}: {
  turnoId: string;
  descripcionTurno: string;
  dispositivo: Dispositivo;
}) {
  const t = TAMANOS[dispositivo];
  const [digitos, setDigitos] = useState("");
  const [pantalla, setPantalla] = useState<Pantalla>({ paso: "teclado" });
  const [nombre, setNombre] = useState("");
  const [saliendo, setSaliendo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [estadoSalida, accionSalida, pendienteSalida] = useActionState<EstadoSalida, FormData>(salirDelKiosco, {});
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reiniciar = useCallback(() => {
    setDigitos("");
    setNombre("");
    setPantalla({ paso: "teclado" });
  }, []);

  // Mensajes y confirmaciones se limpian solos.
  useEffect(() => {
    clearTimeout(temporizador.current);
    const segundos =
      pantalla.paso === "listo" || pantalla.paso === "error"
        ? SEGUNDOS_MENSAJE
        : pantalla.paso === "confirmarAccion" || pantalla.paso === "confirmarMatricula" || pantalla.paso === "nuevo"
          ? SEGUNDOS_INACTIVIDAD
          : 0;
    if (segundos) temporizador.current = setTimeout(reiniciar, segundos * 1000);
    return () => clearTimeout(temporizador.current);
  }, [pantalla, reiniciar]);

  const buscar = useCallback(
    (matricula: string) => {
      iniciar(async () => {
        const r = await buscarAlumno(turnoId, matricula);
        if (r.tipo === "nuevo") setPantalla({ paso: "nuevo", matricula });
        else if (r.tipo === "entrada" || r.tipo === "salida")
          setPantalla({ paso: "confirmarAccion", matricula, accion: r.tipo, nombreCorto: r.nombreCorto });
        else if (r.tipo === "cerrado") setPantalla({ paso: "cerrado" });
        else if (r.tipo === "error") setPantalla({ paso: "error", mensaje: r.mensaje });
      });
    },
    [turnoId],
  );

  const continuar = useCallback(
    (valor: string) => {
      const r = matriculaDesdeDigitos(valor);
      if (r.estado === "valida") buscar(r.matricula);
      else if (r.estado === "confirmar") setPantalla({ paso: "confirmarMatricula", matricula: r.matricula });
    },
    [buscar],
  );

  const teclear = useCallback(
    (tecla: string) => {
      if (pantalla.paso !== "teclado" || pendiente) return;
      if (tecla === "borrar") return setDigitos((d) => d.slice(0, -1));
      if (tecla === "continuar") return continuar(digitos);
      if (!/^\d$/.test(tecla) || digitos.length >= 8) return;
      const nuevo = digitos + tecla;
      setDigitos(nuevo);
      if (nuevo.length === 8) continuar(nuevo); // 8 dígitos: busca sola
    },
    [pantalla.paso, pendiente, digitos, continuar],
  );

  // Teclado físico (computadora).
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (saliendo || pantalla.paso !== "teclado") return;
      if (/^\d$/.test(e.key)) teclear(e.key);
      else if (e.key === "Backspace") teclear("borrar");
      else if (e.key === "Enter") teclear("continuar");
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [teclear, saliendo, pantalla.paso]);

  function registrar(matricula: string, accion: "entrada" | "salida", nombreNuevo?: string) {
    iniciar(async () => {
      const r = await registrarMovimiento(turnoId, matricula, accion, nombreNuevo);
      if (r.tipo === "listo") {
        const nombreVisible = r.nombreCorto.split(" ")[0];
        setPantalla({
          paso: "listo",
          mensaje: r.accion === "entrada" ? `✓ Bienvenido, ${nombreVisible}` : `✓ Hasta luego, ${nombreVisible}`,
        });
      } else if (r.tipo === "cerrado") setPantalla({ paso: "cerrado" });
      else if (r.tipo === "error") setPantalla({ paso: "error", mensaje: r.mensaje });
    });
  }

  const claseBotonPrincipal = `w-full rounded-control bg-accent font-medium text-on-accent disabled:opacity-50 ${t.boton}`;
  const claseBotonSecundario = `w-full rounded-control border border-line text-fg-body ${t.boton}`;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-6">
      <header className="flex w-full max-w-3xl items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/brand/simbolo-tecmilenio.png" alt="" width={28} height={28} />
          <span className="text-sm text-fg-muted">{descripcionTurno}</span>
        </div>
        {dispositivo !== "celular" && (
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            className="rounded-control px-3 py-2 text-[13px] text-fg-muted hover:bg-elevated"
          >
            Pantalla completa
          </button>
        )}
      </header>

      <main className={`flex w-full flex-1 flex-col justify-center gap-6 ${t.ancho}`}>
        {pantalla.paso === "teclado" && (
          <>
            <div className="flex flex-col gap-2 text-center">
              <h1 className={`font-medium tracking-[-0.012em] text-fg ${t.titulo}`}>Escribe tu matrícula</h1>
              <p className="text-base text-fg-body">
                Solo los números, <strong className="font-semibold">con el 0 al inicio</strong> (8 dígitos).
              </p>
            </div>
            <div className="flex justify-center gap-1.5" aria-live="polite" aria-label={`Matrícula: ${digitos}`}>
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className={`flex aspect-[3/4] w-[11%] items-center justify-center rounded-control border font-mono ${t.titulo} ${
                    i === 0 ? "border-accent" : "border-line"
                  } ${digitos[i] ? "text-fg" : "text-fg-faint"}`}
                >
                  {digitos[i] ?? (i === 0 ? "0" : "·")}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => teclear(n)}
                  className={`rounded-control border border-line bg-surface font-medium text-fg active:bg-elevated ${t.tecla}`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => teclear("borrar")}
                className={`rounded-control border border-line text-fg-muted active:bg-elevated ${t.tecla} !text-base`}
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => teclear("0")}
                className={`rounded-control border border-line bg-surface font-medium text-fg active:bg-elevated ${t.tecla}`}
              >
                0
              </button>
              <button
                type="button"
                onClick={() => teclear("continuar")}
                disabled={digitos.length < 7 || pendiente}
                className={`rounded-control bg-accent font-medium text-on-accent disabled:opacity-40 ${t.tecla} !text-base`}
              >
                {pendiente ? "…" : "Continuar"}
              </button>
            </div>
            {dispositivo === "computadora" && (
              <p className="text-center text-[13px] text-fg-muted">También puedes usar el teclado de la computadora.</p>
            )}
          </>
        )}

        {pantalla.paso === "confirmarMatricula" && (
          <div className="flex flex-col gap-4 text-center">
            <h1 className={`font-medium text-fg ${t.titulo}`}>¿Tu matrícula es</h1>
            <p className={`font-mono text-fg ${t.titulo}`}>{pantalla.matricula}?</p>
            <button type="button" className={claseBotonPrincipal} onClick={() => buscar(pantalla.matricula)} disabled={pendiente}>
              Sí, es mi matrícula
            </button>
            <button type="button" className={claseBotonSecundario} onClick={reiniciar}>
              No, corregir
            </button>
          </div>
        )}

        {pantalla.paso === "confirmarAccion" && (
          <div className="flex flex-col gap-4 text-center">
            <h1 className={`font-medium text-fg ${t.titulo}`}>
              {pantalla.accion === "entrada" ? `¿Eres ${pantalla.nombreCorto}?` : `${pantalla.nombreCorto}, ¿registrar tu salida?`}
            </h1>
            <button
              type="button"
              className={claseBotonPrincipal}
              disabled={pendiente}
              onClick={() => registrar(pantalla.matricula, pantalla.accion)}
            >
              {pendiente ? "Registrando…" : pantalla.accion === "entrada" ? "Sí, registrar entrada" : "Sí, registrar salida"}
            </button>
            <button type="button" className={claseBotonSecundario} onClick={reiniciar}>
              {pantalla.accion === "entrada" ? "No soy yo" : "No"}
            </button>
          </div>
        )}

        {pantalla.paso === "nuevo" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              registrar(pantalla.matricula, "entrada", nombre);
            }}
          >
            <div className="flex flex-col gap-1 text-center">
              <h1 className={`font-medium text-fg ${t.titulo}`}>Primera vez en el gimnasio</h1>
              <p className="text-base text-fg-body">
                Escribe tu nombre completo (nombre y apellidos). Matrícula{" "}
                <span className="font-mono">{pantalla.matricula}</span>
              </p>
            </div>
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              minLength={5}
              maxLength={120}
              autoComplete="off"
              aria-label="Nombre completo"
              className={`w-full rounded-control border border-line bg-surface px-4 text-fg outline-none focus:border-fg-muted ${t.boton}`}
            />
            <button type="submit" className={claseBotonPrincipal} disabled={pendiente || nombre.trim().length < 5}>
              {pendiente ? "Registrando…" : "Registrar entrada"}
            </button>
            <button type="button" className={claseBotonSecundario} onClick={reiniciar}>
              Cancelar
            </button>
          </form>
        )}

        {pantalla.paso === "listo" && (
          <p role="status" className={`text-center font-medium text-success ${t.titulo}`}>
            {pantalla.mensaje}
          </p>
        )}

        {pantalla.paso === "error" && (
          <p role="alert" className={`text-center text-danger ${t.titulo}`}>
            {pantalla.mensaje}
          </p>
        )}

        {pantalla.paso === "cerrado" && (
          <div className="flex flex-col gap-2 text-center">
            <h1 className={`font-medium text-fg ${t.titulo}`}>El gimnasio está cerrado</h1>
            <p className="text-base text-fg-muted">Este turno ya terminó.</p>
          </div>
        )}
      </main>

      <footer className="flex w-full max-w-3xl justify-end">
        {saliendo ? (
          <form action={accionSalida} className="flex w-full max-w-sm flex-col gap-2 rounded-card bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
            <input type="hidden" name="turno" value={turnoId} />
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Contraseña del entrenador
              <input
                type="password"
                name="password"
                required
                autoFocus
                autoComplete="current-password"
                className="h-11 rounded-control border border-line bg-canvas px-3 text-[15px] text-fg"
              />
            </label>
            {estadoSalida.error && <Aviso>{estadoSalida.error}</Aviso>}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="cerrar"
                value="si"
                disabled={pendienteSalida}
                className="h-10 flex-1 rounded-control border border-danger/40 px-3 text-sm text-danger"
              >
                Cerrar turno y salir
              </button>
              <button
                type="submit"
                name="cerrar"
                value="no"
                disabled={pendienteSalida}
                className="h-10 flex-1 rounded-control border border-line px-3 text-sm text-fg-body"
              >
                Solo salir
              </button>
            </div>
            <button type="button" onClick={() => setSaliendo(false)} className="text-[13px] text-fg-muted">
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setSaliendo(true)}
            className="rounded-control px-3 py-2 text-[13px] text-fg-faint hover:text-fg-muted"
          >
            Entrenador
          </button>
        )}
      </footer>
    </div>
  );
}

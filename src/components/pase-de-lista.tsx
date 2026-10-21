"use client";

import { useMemo, useState, useTransition } from "react";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { corregirAsistencia, registrarAsistencia } from "@/app/entrenador/acciones-asistencia";
import { describirFecha } from "@/lib/fechas";

type Estado = "asistio" | "falta";

export type FilaLista = {
  clave: string; // id de alumno, solicitud o asistencia (según el modo)
  tipo: "alumno" | "solicitud";
  nombre: string;
  matricula: string;
  estadoInicial?: Estado;
};

type Incidencia = { categoria_id: string; descripcion: string };

type Props = {
  disciplinaId: string;
  filas: FilaLista[];
  categorias: { id: string; nombre: string }[];
  horaInicial: string;
  incidenciasIniciales?: Incidencia[];
} & (
  | { modo: "registrar"; fechas: string[]; hoy: string }
  | { modo: "corregir"; sesionId: string; fechaFija: string; hoy: string }
);

function BotonMarca({
  activo,
  tono,
  onClick,
  children,
}: {
  activo: boolean;
  tono: "asistio" | "falta";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const color = activo
    ? tono === "asistio"
      ? "border-success bg-success text-white"
      : "border-danger bg-danger text-white"
    : "border-line text-fg-body hover:bg-elevated";
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`h-11 min-w-24 flex-1 rounded-control border px-3 text-sm font-medium transition-colors sm:flex-none ${color}`}
    >
      {children}
    </button>
  );
}

export function PaseDeLista(props: Props) {
  const { filas, categorias, disciplinaId } = props;
  const [marcas, setMarcas] = useState<Record<string, Estado | undefined>>(() =>
    Object.fromEntries(filas.map((f) => [f.clave, f.estadoInicial])),
  );
  const [fecha, setFecha] = useState(props.modo === "registrar" ? props.fechas[0] : props.fechaFija);
  const [hora, setHora] = useState(props.horaInicial);
  const [incidencias, setIncidencias] = useState<Incidencia[]>(props.incidenciasIniciales ?? []);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();

  const conteo = useMemo(() => {
    const valores = filas.map((f) => marcas[f.clave]);
    return {
      asistio: valores.filter((v) => v === "asistio").length,
      falta: valores.filter((v) => v === "falta").length,
      sinMarcar: valores.filter((v) => !v).length,
    };
  }, [filas, marcas]);

  const incidenciaIncompleta = incidencias.some((i) => !i.categoria_id);

  function guardar() {
    setError(undefined);
    const incidenciasLimpias = incidencias.map((i) => ({
      categoria_id: i.categoria_id,
      descripcion: i.descripcion.trim() || undefined,
    }));
    iniciar(async () => {
      const r =
        props.modo === "registrar"
          ? await registrarAsistencia({
              disciplina_id: disciplinaId,
              fecha,
              hora,
              marcas: filas.map((f) =>
                f.tipo === "alumno"
                  ? { alumno_id: f.clave, estado: marcas[f.clave]! }
                  : { solicitud_id: f.clave, estado: marcas[f.clave]! },
              ),
              incidencias: incidenciasLimpias,
            })
          : await corregirAsistencia({
              sesion_id: props.sesionId,
              disciplina_id: disciplinaId,
              hora,
              marcas: filas.map((f) => ({ id: f.clave, estado: marcas[f.clave]! })),
              incidencias: incidenciasLimpias,
            });
      // Si todo sale bien, la acción redirige; aquí solo llegan errores.
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          Fecha
          {props.modo === "registrar" ? (
            <select
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-fg"
            >
              {props.fechas.map((f) => (
                <option key={f} value={f}>
                  {describirFecha(f, props.hoy)}
                </option>
              ))}
            </select>
          ) : (
            <span className="flex h-11 items-center text-[15px] text-fg">{describirFecha(fecha, props.hoy)}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          Hora de inicio
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-fg"
          />
        </label>
        {props.modo === "registrar" && fecha !== props.hoy && (
          <p className="text-[13px] text-info sm:col-span-2">Quedará marcada como registro tardío.</p>
        )}
      </Tarjeta>

      <section className="flex flex-col gap-2">
        <p className="sticky top-0 z-10 bg-canvas py-2 text-[13px] text-fg-muted">
          <span className="text-success">Asistieron {conteo.asistio}</span> ·{" "}
          <span className="text-danger">Faltas {conteo.falta}</span> · Sin marcar {conteo.sinMarcar}
        </p>
        <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-[inset_0_0_0_1px_var(--line)]">
          {filas.map((f) => (
            <li key={f.clave} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col">
                <span className="text-[15px] text-fg">{f.nombre}</span>
                <span className="text-[13px] text-fg-muted">
                  <span className="font-mono">{f.matricula}</span>
                  {f.tipo === "solicitud" && <span className="text-info"> · Pendiente de aprobación</span>}
                </span>
              </div>
              <div className="flex gap-2">
                <BotonMarca
                  tono="asistio"
                  activo={marcas[f.clave] === "asistio"}
                  onClick={() => setMarcas((m) => ({ ...m, [f.clave]: "asistio" }))}
                >
                  Asistió
                </BotonMarca>
                <BotonMarca
                  tono="falta"
                  activo={marcas[f.clave] === "falta"}
                  onClick={() => setMarcas((m) => ({ ...m, [f.clave]: "falta" }))}
                >
                  Falta
                </BotonMarca>
              </div>
            </li>
          ))}
        </ul>
        {conteo.sinMarcar > 0 && (
          <div className="flex flex-col gap-1">
            <Boton
              type="button"
              onClick={() =>
                setMarcas((m) => Object.fromEntries(filas.map((f) => [f.clave, m[f.clave] ?? "asistio"])))
              }
              className="w-full sm:w-fit"
            >
              Marcar todos como asistió
            </Boton>
            <p className="text-xs text-fg-faint">Solo marca a los que faltan; no cambia las faltas que ya marcaste.</p>
          </div>
        )}
      </section>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-[15px] font-medium text-fg">Incidencias</h2>
        {incidencias.length === 0 && <p className="text-[13px] text-fg-muted">Sin incidencias.</p>}
        {incidencias.map((inc, i) => (
          <div key={i} className="flex flex-col gap-2 border-t border-line pt-3 first:border-0 first:pt-0">
            <div className="flex gap-2">
              <select
                value={inc.categoria_id}
                onChange={(e) =>
                  setIncidencias((xs) => xs.map((x, j) => (j === i ? { ...x, categoria_id: e.target.value } : x)))
                }
                aria-label="Categoría de la incidencia"
                className="h-11 flex-1 rounded-control border border-line bg-surface px-3 text-[15px] text-fg"
              >
                <option value="" disabled>
                  Elegir categoría…
                </option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <Boton type="button" onClick={() => setIncidencias((xs) => xs.filter((_, j) => j !== i))}>
                Quitar
              </Boton>
            </div>
            <textarea
              value={inc.descripcion}
              maxLength={500}
              rows={2}
              placeholder="Descripción (opcional)"
              onChange={(e) =>
                setIncidencias((xs) => xs.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))
              }
              className="rounded-control border border-line bg-surface px-3 py-2 text-[15px] text-fg"
            />
          </div>
        ))}
        {incidencias.length < 10 && (
          <Boton
            type="button"
            onClick={() => setIncidencias((xs) => [...xs, { categoria_id: "", descripcion: "" }])}
            className="w-fit"
          >
            + Agregar incidencia
          </Boton>
        )}
      </Tarjeta>

      {error && <Aviso>{error}</Aviso>}
      <Boton
        type="button"
        variante="primario"
        onClick={guardar}
        disabled={pendiente || conteo.sinMarcar > 0 || incidenciaIncompleta || !hora}
        className="h-12 w-full sm:w-fit"
      >
        {pendiente
          ? "Guardando…"
          : conteo.sinMarcar > 0
            ? `Faltan ${conteo.sinMarcar} por marcar`
            : props.modo === "registrar"
              ? "Guardar asistencia"
              : "Guardar corrección"}
      </Boton>
    </div>
  );
}

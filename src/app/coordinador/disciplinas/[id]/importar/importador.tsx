"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Aviso, Boton, Tarjeta } from "@/components/ui";
import { ETIQUETA_GENERO, GENEROS, type Genero } from "@/lib/catalogos";
import { extraerFilas } from "@/lib/importacion";
import {
  analizarImportacion,
  confirmarImportacion,
  type FilaAnalizada,
  type ResultadoImportacion,
} from "./actions";

const TAMANO_MAXIMO = 2 * 1024 * 1024; // 2 MB

type Fila = FilaAnalizada & {
  genero: Genero | null;
  usarNombreExcel: boolean;
  omitir: boolean;
};

const claseInput =
  "h-9 rounded-control border border-line bg-surface px-2 text-sm text-fg outline-none focus:border-fg-muted";

function SelectGenero({ valor, onChange }: { valor: Genero | null; onChange: (g: Genero | null) => void }) {
  return (
    <select
      value={valor ?? ""}
      onChange={(e) => onChange((e.target.value || null) as Genero | null)}
      className={claseInput}
      aria-label="Género"
    >
      <option value="">Sin asignar</option>
      {GENEROS.map((g) => (
        <option key={g} value={g}>
          {ETIQUETA_GENERO[g]}
        </option>
      ))}
    </select>
  );
}

export function Importador({ disciplinaId, disciplinaNombre }: { disciplinaId: string; disciplinaNombre: string }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string>();
  const [resultado, setResultado] = useState<ResultadoImportacion["resultado"]>();
  const [pendiente, iniciar] = useTransition();

  const actualizar = (fila: number, cambios: Partial<Fila>) =>
    setFilas((fs) => fs?.map((f) => (f.fila === fila ? { ...f, ...cambios } : f)) ?? null);

  function analizar(leidas: { fila: number; matricula: string; nombre: string }[]) {
    iniciar(async () => {
      const r = await analizarImportacion(disciplinaId, leidas);
      if (r.error || !r.filas) {
        setError(r.error);
        return;
      }
      setError(undefined);
      setFilas((previas) =>
        r.filas!.map((f) => {
          const antes = previas?.find((p) => p.fila === f.fila);
          return {
            ...f,
            genero: antes?.genero ?? f.generoExistente ?? null,
            usarNombreExcel: antes?.usarNombreExcel ?? false,
            omitir: antes?.omitir ?? false,
          };
        }),
      );
    });
  }

  async function alElegirArchivo(archivo: File | undefined) {
    setError(undefined);
    setResultado(undefined);
    setFilas(null);
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith(".xlsx")) {
      setError("Solo se aceptan archivos .xlsx (Excel).");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
      setError("El archivo pesa más de 2 MB.");
      return;
    }
    try {
      // Se lee en el navegador: el archivo nunca se sube ni se guarda.
      const { readSheet } = await import("read-excel-file/browser");
      const hoja = await readSheet(archivo);
      const extraidas = extraerFilas(hoja);
      if (!extraidas.ok) {
        setError(extraidas.error);
        return;
      }
      analizar(extraidas.filas);
    } catch {
      setError("No se pudo leer el archivo. Verifica que sea un Excel válido.");
    }
  }

  function confirmar() {
    if (!filas) return;
    const aImportar = filas
      .filter((f) => !f.omitir && (f.estado === "nuevo" || f.estado === "existente"))
      .map((f) => ({
        matricula: f.matriculaNormalizada!,
        nombre: f.nombre,
        genero: f.genero,
        actualizar_nombre: f.estado === "existente" && f.usarNombreExcel,
      }));
    iniciar(async () => {
      const r = await confirmarImportacion(disciplinaId, aImportar);
      if (r.error) setError(r.error);
      else {
        setResultado(r.resultado);
        setFilas(null);
      }
    });
  }

  if (resultado) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <Aviso tono="exito">Importación completada en {disciplinaNombre}.</Aviso>
        <ul className="text-sm text-fg-body">
          <li>Alumnos nuevos registrados: {resultado.creados}</li>
          <li>Inscritos en la disciplina: {resultado.inscritos}</li>
          <li>Ya estaban inscritos: {resultado.ya_inscritos}</li>
          <li>Nombres actualizados: {resultado.actualizados}</li>
        </ul>
        <Link href={`/coordinador/disciplinas/${disciplinaId}`} className="text-sm text-fg underline underline-offset-4">
          Ver la lista
        </Link>
      </Tarjeta>
    );
  }

  const grupos = {
    revisar: filas?.filter((f) => f.estado === "revisar") ?? [],
    nuevo: filas?.filter((f) => f.estado === "nuevo") ?? [],
    existente: filas?.filter((f) => f.estado === "existente") ?? [],
    inscrito: filas?.filter((f) => f.estado === "inscrito") ?? [],
  };
  const sinResolver = grupos.revisar.filter((f) => !f.omitir).length;
  const totalImportar =
    grupos.nuevo.filter((f) => !f.omitir).length + grupos.existente.filter((f) => !f.omitir).length;

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-sm text-fg-body">
          Archivo de Excel (.xlsx) con las columnas <strong className="font-medium">Nombre</strong> y{" "}
          <strong className="font-medium">Matrícula</strong>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => alElegirArchivo(e.target.files?.[0])}
            className="text-sm text-fg-muted file:mr-3 file:rounded-control file:border file:border-line file:bg-elevated file:px-3 file:py-2 file:text-fg-body"
          />
        </label>
        <p className="text-xs text-fg-faint">
          El archivo se lee en tu navegador; no se sube ni se guarda. Las demás columnas (como Nivel) se ignoran.
        </p>
        {pendiente && <p className="text-sm text-fg-muted">Procesando…</p>}
        {error && <Aviso>{error}</Aviso>}
      </Tarjeta>

      {filas && (
        <>
          {grupos.revisar.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-medium text-fg">⚠️ Requieren revisión ({grupos.revisar.length})</h2>
              <p className="text-[13px] text-fg-muted">
                Corrige y pulsa “Volver a revisar”, o marca “Omitir” para no importarlas.
              </p>
              <ul className="divide-y divide-line rounded-card px-4 shadow-[inset_0_0_0_1px_var(--line)]">
                {grupos.revisar.map((f) => (
                  <li key={f.fila} className="flex flex-col gap-2 py-3">
                    <span className="text-[13px] text-danger">
                      Fila {f.fila}: {f.motivo}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={f.matricula}
                        onChange={(e) => actualizar(f.fila, { matricula: e.target.value })}
                        className={`${claseInput} w-36 font-mono`}
                        aria-label={`Matrícula fila ${f.fila}`}
                      />
                      <input
                        value={f.nombre}
                        onChange={(e) => actualizar(f.fila, { nombre: e.target.value })}
                        className={`${claseInput} min-w-48 flex-1`}
                        aria-label={`Nombre fila ${f.fila}`}
                      />
                      {f.sugerencia && (
                        <Boton
                          type="button"
                          className="h-9 px-3 text-[13px]"
                          onClick={() => actualizar(f.fila, { matricula: f.sugerencia! })}
                        >
                          Usar {f.sugerencia}
                        </Boton>
                      )}
                      <label className="flex items-center gap-1.5 text-[13px] text-fg-muted">
                        <input
                          type="checkbox"
                          checked={f.omitir}
                          onChange={(e) => actualizar(f.fila, { omitir: e.target.checked })}
                        />
                        Omitir
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <Boton
                type="button"
                disabled={pendiente}
                className="w-fit"
                onClick={() => analizar(filas.map(({ fila, matricula, nombre }) => ({ fila, matricula, nombre })))}
              >
                Volver a revisar
              </Boton>
            </section>
          )}

          {grupos.nuevo.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-medium text-fg">✅ Nuevos ({grupos.nuevo.length})</h2>
                <label className="flex items-center gap-2 text-[13px] text-fg-muted">
                  Asignar a los que no tienen género:
                  <SelectGenero
                    valor={null}
                    onChange={(g) =>
                      setFilas((fs) =>
                        fs?.map((f) => (f.estado === "nuevo" && !f.genero ? { ...f, genero: g } : f)) ?? null,
                      )
                    }
                  />
                </label>
              </div>
              <ul className="divide-y divide-line rounded-card px-4 shadow-[inset_0_0_0_1px_var(--line)]">
                {grupos.nuevo.map((f) => (
                  <li key={f.fila} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm text-fg">
                      {f.nombre} <span className="font-mono text-[13px] text-fg-muted">{f.matriculaNormalizada}</span>
                    </span>
                    <SelectGenero valor={f.genero} onChange={(g) => actualizar(f.fila, { genero: g })} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {grupos.existente.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-medium text-fg">🔁 Ya registrados en el portal ({grupos.existente.length})</h2>
              <p className="text-[13px] text-fg-muted">
                Se inscriben con el nombre que ya tienen. Si el del Excel es el correcto, márcalo.
              </p>
              <ul className="divide-y divide-line rounded-card px-4 shadow-[inset_0_0_0_1px_var(--line)]">
                {grupos.existente.map((f) => (
                  <li key={f.fila} className="flex flex-col gap-1 py-2">
                    <span className="text-sm text-fg">
                      {f.nombreExistente}{" "}
                      <span className="font-mono text-[13px] text-fg-muted">{f.matriculaNormalizada}</span>
                    </span>
                    {f.nombreExistente !== f.nombre && (
                      <label className="flex items-center gap-2 text-[13px] text-fg-muted">
                        <input
                          type="checkbox"
                          checked={f.usarNombreExcel}
                          onChange={(e) => actualizar(f.fila, { usarNombreExcel: e.target.checked })}
                        />
                        Usar el nombre del Excel: “{f.nombre}”
                      </label>
                    )}
                    {!f.generoExistente && (
                      <div className="flex items-center gap-2 text-[13px] text-fg-muted">
                        Género:
                        <SelectGenero valor={f.genero} onChange={(g) => actualizar(f.fila, { genero: g })} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {grupos.inscrito.length > 0 && (
            <p className="text-[13px] text-fg-muted">
              ⏭️ {grupos.inscrito.length} ya estaban inscritos en esta disciplina y se omiten.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Boton
              type="button"
              variante="primario"
              disabled={pendiente || sinResolver > 0 || totalImportar === 0}
              onClick={confirmar}
            >
              {pendiente ? "Importando…" : `Importar ${totalImportar} alumnos`}
            </Boton>
            {sinResolver > 0 && (
              <span className="text-[13px] text-fg-muted">
                Resuelve u omite las {sinResolver} filas en revisión para continuar.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

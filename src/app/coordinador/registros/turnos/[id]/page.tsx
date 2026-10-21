import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { AccionConMotivo } from "@/components/accion-con-motivo";
import { Historial } from "@/components/historial";
import { Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearHora } from "@/lib/catalogos";
import { ahoraMx, describirFecha } from "@/lib/fechas";
import { ETIQUETA_TURNO, type NombreTurno } from "@/lib/gimnasio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { anularRegistroGimnasio, cerrarTurnoAdmin, corregirSalida } from "../../acciones";

export const metadata: Metadata = { title: "Turno de gimnasio" };

type Turno = {
  id: string;
  fecha: string;
  nombre: NombreTurno | null;
  abierto_en: string;
  cerrado_en: string | null;
  cierre_automatico: boolean;
  disciplinas: { nombre: string } | null;
  abrio: { nombre: string } | null;
  registros_gimnasio: {
    id: string;
    entrada: string;
    salida: string | null;
    anulado: boolean;
    salida_corregida: boolean;
    alumnos: { id: string; nombre: string; matricula: string } | null;
  }[];
};

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("turnos_gimnasio")
    .select(
      "id, fecha, nombre, abierto_en, cerrado_en, cierre_automatico, disciplinas(nombre), " +
        "abrio:perfiles!turnos_gimnasio_abierto_por_fkey(nombre), " +
        "registros_gimnasio(id, entrada, salida, anulado, salida_corregida, alumnos(id, nombre, matricula))",
    )
    .eq("id", id.data)
    .maybeSingle();
  const t = data as unknown as Turno | null;
  if (!t) notFound();
  const hoy = ahoraMx().fecha;
  const registros = [...t.registros_gimnasio].sort((a, b) => a.entrada.localeCompare(b.entrada));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/coordinador/registros?vista=gimnasio" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Registros del gimnasio
        </Link>
        <h1 className="text-[28px] font-normal tracking-[-0.022em] text-fg">
          {t.disciplinas?.nombre} · {describirFecha(t.fecha, hoy)}
          {t.nombre && ` · ${ETIQUETA_TURNO[t.nombre]}`}
        </h1>
        <p className="text-[13px] text-fg-muted">
          Abrió {t.abrio?.nombre} a las {formatearHora(t.abierto_en)}
          {t.cerrado_en ? ` · cerró ${formatearHora(t.cerrado_en)}` : " · abierto"}
          {t.cierre_automatico && " (automáticamente)"}
        </p>
      </div>

      {!t.cerrado_en && (
        <AccionConMotivo
          accion={cerrarTurnoAdmin}
          campos={{ id: t.id }}
          texto="Cerrar turno"
          textoConfirmar="Cerrar turno"
          peligro
        />
      )}

      <Tarjeta className="flex flex-col gap-2">
        <h2 className="text-[15px] font-medium text-fg">Registros ({registros.filter((r) => !r.anulado).length})</h2>
        {registros.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin registros.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {registros.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <span className="flex flex-col gap-0.5">
                  <Link
                    href={`/coordinador/alumnos/${r.alumnos?.id}`}
                    className={`text-sm hover:underline ${r.anulado ? "text-fg-faint line-through" : "text-fg"}`}
                  >
                    {r.alumnos?.nombre} <span className="font-mono text-[13px] text-fg-muted">{r.alumnos?.matricula}</span>
                  </Link>
                  <span className="text-[13px] text-fg-muted">
                    Entrada {formatearHora(r.entrada)} ·{" "}
                    {r.salida ? (
                      <>
                        Salida {formatearHora(r.salida)}
                        {r.salida_corregida && <span className="text-info"> (corregida)</span>}
                      </>
                    ) : (
                      <span className="text-info">{t.cerrado_en ? "Sin salida" : "Dentro"}</span>
                    )}
                    {r.anulado && <span className="text-danger"> · Anulado</span>}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {t.cerrado_en && !r.salida && !r.anulado && (
                    <AccionConMotivo
                      accion={corregirSalida}
                      campos={{ id: r.id, fecha: t.fecha }}
                      texto="Poner salida"
                      textoConfirmar="Guardar salida"
                    >
                      <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
                        Hora de salida ({describirFecha(t.fecha, hoy).toLowerCase()})
                        <input
                          type="time"
                          name="hora"
                          required
                          className="h-10 rounded-control border border-line bg-surface px-3 text-sm text-fg"
                        />
                      </label>
                    </AccionConMotivo>
                  )}
                  <AccionConMotivo
                    accion={anularRegistroGimnasio}
                    campos={{ id: r.id, anular: String(!r.anulado) }}
                    texto={r.anulado ? "Restaurar" : "Anular"}
                    textoConfirmar={r.anulado ? "Restaurar" : "Anular"}
                    peligro={!r.anulado}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Historial entidad="turnos_gimnasio" id={t.id} />
    </div>
  );
}

export default function PaginaTurnoAdmin({ params }: PageProps<"/coordinador/registros/turnos/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

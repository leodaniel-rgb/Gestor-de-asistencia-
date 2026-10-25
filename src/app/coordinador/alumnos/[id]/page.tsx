import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Historial } from "@/components/historial";
import { NotaAlumno } from "@/components/nota-alumno";
import { PuntoSinGenero, Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearFecha, type Genero } from "@/lib/catalogos";
import { leerNota } from "@/lib/notas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { FormularioAlumno } from "./formulario";

export const metadata: Metadata = { title: "Alumno" };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario("coordinador");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("alumnos")
    .select(
      "id, matricula, nombre, genero, alumnos_coordinacion(nota, excluido_reportes), " +
        "inscripciones(id, fecha_alta, fecha_baja, disciplinas(id, nombre))",
    )
    .eq("id", id.data)
    .maybeSingle();
  const a = data as unknown as {
    id: string;
    matricula: string;
    nombre: string;
    genero: Genero | null;
    alumnos_coordinacion: { nota: string | null; excluido_reportes: boolean } | null;
    inscripciones: {
      id: string;
      fecha_alta: string;
      fecha_baja: string | null;
      disciplinas: { id: string; nombre: string } | null;
    }[];
  } | null;
  if (!a) notFound();
  const n = leerNota(a.alumnos_coordinacion);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/coordinador/alumnos" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Alumnos
        </Link>
        <h1 className="text-[28px] font-normal tracking-[-0.022em] text-fg">{a.nombre}</h1>
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <span className="font-mono">{a.matricula}</span>
          {!a.genero && (
            <span className="flex items-center gap-1.5">
              <PuntoSinGenero /> Sin género asignado
            </span>
          )}
          {n.excluido && <span>· No cuenta en reportes</span>}
        </p>
      </div>

      <Tarjeta>
        <FormularioAlumno alumno={a} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <h2 className="text-[15px] font-medium text-fg">Nota de coordinación</h2>
        <p className="text-[13px] text-fg-muted">
          Solo la ve la coordinación. Si no lo cuentas en reportes, sus registros se conservan y vuelven a contar al
          desmarcarlo.
        </p>
        <NotaAlumno alumnoId={a.id} nota={n.nota} excluido={n.excluido} siempreAbierto />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2">
        <h2 className="text-[15px] font-medium text-fg">Disciplinas con lista</h2>
        {a.inscripciones.length === 0 ? (
          <p className="text-sm text-fg-muted">No está inscrito en ninguna (puede asistir solo al gimnasio).</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {a.inscripciones.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-2 text-sm">
                <Link href={`/coordinador/disciplinas/${i.disciplinas?.id}`} className="text-fg hover:underline">
                  {i.disciplinas?.nombre}
                </Link>
                <span className="text-[13px] text-fg-muted">
                  Desde {formatearFecha(i.fecha_alta)}
                  {i.fecha_baja && <span className="text-danger"> · Baja {formatearFecha(i.fecha_baja)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Historial entidad="alumnos" id={a.id} />
    </div>
  );
}

export default function PaginaAlumno({ params }: PageProps<"/coordinador/alumnos/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

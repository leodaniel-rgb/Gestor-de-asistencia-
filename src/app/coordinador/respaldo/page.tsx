import type { Metadata } from "next";
import { Suspense } from "react";
import { Tarjeta } from "@/components/ui";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearMomento } from "@/lib/catalogos";
import { diasDesde, DIAS_RECORDATORIO_RESPALDO } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Respaldo" };

async function Estado() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("ultimo_respaldo");
  const ultimo = data as string | null;
  const dias = ultimo ? diasDesde(ultimo) : null;
  const vencido = dias === null || dias >= DIAS_RECORDATORIO_RESPALDO;

  return (
    <p className={`text-sm ${vencido ? "text-info" : "text-success"}`}>
      {ultimo
        ? `Último respaldo: ${formatearMomento(ultimo)} (hace ${dias} ${dias === 1 ? "día" : "días"}).`
        : "Aún no se ha descargado ningún respaldo."}
      {vencido && ` Se recomienda uno cada ${DIAS_RECORDATORIO_RESPALDO} días.`}
    </p>
  );
}

export default function PaginaRespaldo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Respaldo</h1>
        <p className="text-sm text-fg-muted">
          Un Excel con todos los datos del portal: disciplinas, entrenadores, alumnos, inscripciones, asistencias,
          incidencias, días sin clase, gimnasio y solicitudes.
        </p>
      </div>

      <Tarjeta className="flex flex-col gap-4">
        <Suspense fallback={<p className="text-sm text-fg-muted">Revisando…</p>}>
          <Estado />
        </Suspense>
        {/* Enlace normal (GET): el servidor genera el archivo al vuelo y queda en la bitácora. */}
        <a
          href="/coordinador/respaldo/descargar"
          className="inline-flex h-11 w-fit items-center rounded-control bg-accent px-5 text-sm font-medium text-on-accent hover:opacity-90"
        >
          Descargar respaldo completo
        </a>
        <ul className="list-disc pl-5 text-[13px] text-fg-muted">
          <li>Contiene datos personales de todos los alumnos.</li>
          <li>
            Guárdalo <strong className="font-medium text-fg-body">solo</strong> en el almacenamiento institucional
            (OneDrive o SharePoint). No lo envíes por correo ni por WhatsApp.
          </li>
          <li>El archivo no se guarda en el portal; cada descarga queda registrada en la bitácora.</li>
          <li>Si necesitas restaurar datos desde un respaldo, pide ayuda técnica: es un proceso manual.</li>
        </ul>
      </Tarjeta>
    </div>
  );
}

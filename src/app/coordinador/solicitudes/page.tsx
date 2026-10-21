import type { Metadata } from "next";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { ETIQUETA_GENERO, formatearMomento, type Genero } from "@/lib/catalogos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ResolverSolicitud } from "./resolver";

export const metadata: Metadata = { title: "Solicitudes" };

type Solicitud = {
  id: string;
  tipo: "alta" | "baja";
  estado: "pendiente" | "aprobada" | "rechazada";
  matricula: string | null;
  nombre: string | null;
  genero: Genero | null;
  nota: string | null;
  motivo_rechazo: string | null;
  creado_en: string;
  resuelto_en: string | null;
  disciplinas: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  inscripciones: { alumnos: { nombre: string; matricula: string } | null } | null;
};

const SELECT =
  "id, tipo, estado, matricula, nombre, genero, nota, motivo_rechazo, creado_en, resuelto_en, " +
  "disciplinas(nombre), solicitante:perfiles!solicitudes_solicitado_por_fkey(nombre), " +
  "inscripciones(alumnos(nombre, matricula))";

function Descripcion({ s, existente }: { s: Solicitud; existente?: string }) {
  if (s.tipo === "baja") {
    const a = s.inscripciones?.alumnos;
    return (
      <>
        <span className="text-[15px] text-fg">
          Baja: {a?.nombre} <span className="font-mono text-[13px] text-fg-muted">{a?.matricula}</span>
        </span>
        {s.nota && <span className="text-[13px] text-fg-muted">Nota: {s.nota}</span>}
      </>
    );
  }
  return (
    <>
      <span className="text-[15px] text-fg">
        Alta: {s.nombre} <span className="font-mono text-[13px] text-fg-muted">{s.matricula}</span>
      </span>
      <span className="text-[13px] text-fg-muted">
        {s.genero ? ETIQUETA_GENERO[s.genero] : "Género sin asignar"}
      </span>
      {existente && (
        <span className="text-[13px] text-info">
          Esta matrícula ya está registrada como “{existente}”. Se conservará ese nombre y solo se inscribirá.
        </span>
      )}
    </>
  );
}

async function Pendientes() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("solicitudes")
    .select(SELECT)
    .eq("estado", "pendiente")
    .order("creado_en");
  if (error) return <p className="text-sm text-danger">No se pudieron cargar las solicitudes.</p>;

  const pendientes = (data ?? []) as unknown as Solicitud[];
  if (pendientes.length === 0) return <p className="text-sm text-fg-muted">No hay solicitudes pendientes.</p>;

  // Para las altas: ¿la matrícula ya existe? (el entrenador no puede saberlo)
  const matriculas = pendientes.filter((s) => s.tipo === "alta").map((s) => s.matricula!);
  const { data: existentes } = matriculas.length
    ? await supabase.from("alumnos").select("matricula, nombre").in("matricula", matriculas)
    : { data: [] };
  const nombrePorMatricula = new Map((existentes ?? []).map((a) => [a.matricula as string, a.nombre as string]));

  return (
    <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
      {pendientes.map((s) => (
        <li key={s.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <Descripcion s={s} existente={s.matricula ? nombrePorMatricula.get(s.matricula) : undefined} />
            <span className="text-xs text-fg-faint">
              {s.disciplinas?.nombre} · {s.solicitante?.nombre} · {formatearMomento(s.creado_en)}
            </span>
          </div>
          <ResolverSolicitud id={s.id} textoAprobar={s.tipo === "alta" ? "Aprobar e inscribir" : "Aprobar baja"} />
        </li>
      ))}
    </ul>
  );
}

async function Historial() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("solicitudes")
    .select(SELECT)
    .neq("estado", "pendiente")
    .order("resuelto_en", { ascending: false })
    .limit(20);
  const resueltas = (data ?? []) as unknown as Solicitud[];
  if (resueltas.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-normal tracking-[-0.012em] text-fg">Resueltas recientemente</h2>
      <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
        {resueltas.map((s) => (
          <li key={s.id} className="flex flex-col gap-1 px-4 py-3">
            <Descripcion s={s} />
            <span className="text-xs text-fg-faint">
              <span className={s.estado === "aprobada" ? "text-success" : "text-danger"}>
                {s.estado === "aprobada" ? "Aprobada" : "Rechazada"}
              </span>
              {s.motivo_rechazo && ` (${s.motivo_rechazo})`} · {s.disciplinas?.nombre} · {s.solicitante?.nombre}
              {s.resuelto_en && ` · ${formatearMomento(s.resuelto_en)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PaginaSolicitudes() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Solicitudes</h1>
        <p className="text-sm text-fg-muted">Altas y bajas sugeridas por los entrenadores.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
        <Pendientes />
      </Suspense>
      <Suspense>
        <Historial />
      </Suspense>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccionConMotivo } from "@/components/accion-con-motivo";
import { requerirUsuario } from "@/lib/auth/dal";
import { formatearHora } from "@/lib/catalogos";
import { ahoraMx, describirFecha, sumarDias } from "@/lib/fechas";
import { ETIQUETA_TURNO, type NombreTurno } from "@/lib/gimnasio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { anularSinClase } from "./acciones";

export const metadata: Metadata = { title: "Registros" };

type Params = Record<string, string | string[] | undefined>;
const VISTAS = [
  { valor: "sesiones", etiqueta: "Selecciones y talleres" },
  { valor: "gimnasio", etiqueta: "Gimnasio" },
  { valor: "sin-clase", etiqueta: "Días sin clase" },
] as const;

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const esFecha = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const esUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

const Badge = ({ children, tono = "muted" }: { children: React.ReactNode; tono?: "muted" | "info" | "danger" }) => (
  <span
    className={`rounded-badge bg-white/5 px-1.5 text-xs ${
      tono === "info" ? "text-info" : tono === "danger" ? "text-danger" : "text-fg-muted"
    }`}
  >
    {children}
  </span>
);

async function Contenido({ searchParams }: { searchParams: Promise<Params> }) {
  await requerirUsuario("coordinador");
  const p = await searchParams;
  const hoy = ahoraMx().fecha;
  const vista = VISTAS.find((v) => v.valor === texto(p.vista))?.valor ?? "sesiones";
  const desde = esFecha(texto(p.desde)) ? texto(p.desde) : sumarDias(hoy, -14);
  const hasta = esFecha(texto(p.hasta)) ? texto(p.hasta) : hoy;
  const disciplina = esUuid(texto(p.disciplina)) ? texto(p.disciplina) : "";

  const supabase = await crearClienteServidor();
  const { data: disciplinas } = await supabase.from("disciplinas").select("id, nombre, tipo").order("nombre");
  const opciones = (disciplinas ?? []).filter((d) => (vista === "gimnasio" ? d.tipo === "acceso_libre" : d.tipo === "lista"));

  let lista: React.ReactNode = null;

  if (vista === "sesiones") {
    let q = supabase
      .from("sesiones")
      .select(
        "id, fecha, hora_inicio, anulada, registro_tardio, capturada_por_coordinacion, disciplinas(nombre), " +
          "entrenador:perfiles!sesiones_entrenador_id_fkey(nombre), asistencias(estado), incidencias(id)",
      )
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false })
      .limit(300);
    if (disciplina) q = q.eq("disciplina_id", disciplina);
    const { data, error } = await q;
    const filas = (data ?? []) as unknown as {
      id: string;
      fecha: string;
      hora_inicio: string;
      anulada: boolean;
      registro_tardio: boolean;
      capturada_por_coordinacion: boolean;
      disciplinas: { nombre: string } | null;
      entrenador: { nombre: string } | null;
      asistencias: { estado: string }[];
      incidencias: { id: string }[];
    }[];
    lista = error ? (
      <p className="text-sm text-danger">No se pudieron cargar las sesiones.</p>
    ) : filas.length === 0 ? (
      <p className="text-sm text-fg-muted">No hay sesiones en ese periodo.</p>
    ) : (
      <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
        {filas.map((s) => {
          const asistieron = s.asistencias.filter((a) => a.estado === "asistio").length;
          return (
            <li key={s.id}>
              <Link
                href={`/coordinador/registros/sesiones/${s.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-0.5">
                  <span className={`text-sm ${s.anulada ? "text-fg-faint line-through" : "text-fg"}`}>
                    {s.disciplinas?.nombre} · {describirFecha(s.fecha, hoy)}, {s.hora_inicio.slice(0, 5)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
                    {asistieron} de {s.asistencias.length} asistieron · {s.entrenador?.nombre}
                    {s.incidencias.length > 0 && <Badge tono="info">{s.incidencias.length} incidencias</Badge>}
                    {s.registro_tardio && <Badge tono="info">Tardía</Badge>}
                    {s.capturada_por_coordinacion && <Badge>Capturada por coordinación</Badge>}
                    {s.anulada && <Badge tono="danger">Anulada</Badge>}
                  </span>
                </span>
                <span className="text-[13px] text-fg-muted">Ver →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  } else if (vista === "gimnasio") {
    let q = supabase
      .from("turnos_gimnasio")
      .select("id, fecha, nombre, abierto_en, cerrado_en, cierre_automatico, disciplinas(nombre), registros_gimnasio(salida, anulado)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("abierto_en", { ascending: false })
      .limit(300);
    if (disciplina) q = q.eq("disciplina_id", disciplina);
    const { data, error } = await q;
    const filas = (data ?? []) as unknown as {
      id: string;
      fecha: string;
      nombre: NombreTurno | null;
      abierto_en: string;
      cerrado_en: string | null;
      cierre_automatico: boolean;
      disciplinas: { nombre: string } | null;
      registros_gimnasio: { salida: string | null; anulado: boolean }[];
    }[];
    lista = error ? (
      <p className="text-sm text-danger">No se pudieron cargar los turnos.</p>
    ) : filas.length === 0 ? (
      <p className="text-sm text-fg-muted">No hay turnos en ese periodo.</p>
    ) : (
      <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
        {filas.map((t) => {
          const validos = t.registros_gimnasio.filter((r) => !r.anulado);
          const sinSalida = validos.filter((r) => !r.salida).length;
          return (
            <li key={t.id}>
              <Link
                href={`/coordinador/registros/turnos/${t.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-fg">
                    {t.disciplinas?.nombre} · {describirFecha(t.fecha, hoy)}
                    {t.nombre && ` · ${ETIQUETA_TURNO[t.nombre]}`} · {formatearHora(t.abierto_en)}
                    {t.cerrado_en ? ` – ${formatearHora(t.cerrado_en)}` : ""}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-muted">
                    {validos.length} entradas
                    {!t.cerrado_en && <Badge tono="info">Abierto</Badge>}
                    {t.cerrado_en && sinSalida > 0 && <Badge tono="info">{sinSalida} sin salida</Badge>}
                    {t.cierre_automatico && <Badge tono="info">Cerrado automáticamente</Badge>}
                  </span>
                </span>
                <span className="text-[13px] text-fg-muted">Ver →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  } else {
    let q = supabase
      .from("dias_sin_clase")
      .select("id, fecha, anulado, disciplinas(nombre), catalogo_opciones(nombre), perfiles(nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(300);
    if (disciplina) q = q.eq("disciplina_id", disciplina);
    const { data, error } = await q;
    const filas = (data ?? []) as unknown as {
      id: string;
      fecha: string;
      anulado: boolean;
      disciplinas: { nombre: string } | null;
      catalogo_opciones: { nombre: string } | null;
      perfiles: { nombre: string } | null;
    }[];
    lista = error ? (
      <p className="text-sm text-danger">No se pudieron cargar los días sin clase.</p>
    ) : filas.length === 0 ? (
      <p className="text-sm text-fg-muted">No hay días sin clase en ese periodo.</p>
    ) : (
      <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
        {filas.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <span className="flex flex-col gap-0.5">
              <span className={`text-sm ${d.anulado ? "text-fg-faint line-through" : "text-fg"}`}>
                {d.disciplinas?.nombre} · {describirFecha(d.fecha, hoy)}
              </span>
              <span className="text-[13px] text-fg-muted">
                {d.catalogo_opciones?.nombre ?? "Sin motivo"} · {d.perfiles?.nombre}
                {d.anulado && <span className="text-danger"> · Anulado</span>}
              </span>
            </span>
            <AccionConMotivo
              accion={anularSinClase}
              campos={{ id: d.id, anular: String(!d.anulado) }}
              texto={d.anulado ? "Restaurar" : "Anular"}
              textoConfirmar={d.anulado ? "Restaurar" : "Anular"}
              peligro={!d.anulado}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <nav className="flex flex-wrap gap-1 text-[13px]" aria-label="Tipo de registro">
        {VISTAS.map((v) => (
          <Link
            key={v.valor}
            href={`/coordinador/registros?vista=${v.valor}&desde=${desde}&hasta=${hasta}`}
            className={`rounded-full px-3 py-1.5 ${
              v.valor === vista ? "bg-white/10 text-fg" : "text-fg-muted hover:bg-white/5"
            }`}
          >
            {v.etiqueta}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <input type="hidden" name="vista" value={vista} />
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Disciplina
          <select
            name="disciplina"
            defaultValue={disciplina}
            className="h-10 min-w-48 rounded-control border border-line bg-surface px-3 text-sm text-fg"
          >
            <option value="">Todas</option>
            {opciones.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Desde
          <input type="date" name="desde" defaultValue={desde} max={hoy} className="h-10 rounded-control border border-line bg-surface px-3 text-sm text-fg" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} max={hoy} className="h-10 rounded-control border border-line bg-surface px-3 text-sm text-fg" />
        </label>
        <button type="submit" className="h-10 rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated">
          Filtrar
        </button>
      </form>
      {lista}
    </>
  );
}

export default function PaginaRegistros({ searchParams }: PageProps<"/coordinador/registros">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Registros</h1>
          <p className="text-sm text-fg-muted">
            Revisa y corrige asistencias. Toda corrección pide un motivo y queda en el historial.
          </p>
        </div>
        <Link
          href="/coordinador/registros/capturar"
          className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm text-fg-body hover:bg-elevated"
        >
          Capturar sesión
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

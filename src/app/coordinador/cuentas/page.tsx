import type { Metadata } from "next";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AccionesCuenta, FormularioNuevaCuenta } from "./componentes";

export const metadata: Metadata = { title: "Cuentas" };

type FilaEntrenador = {
  id: string;
  nombre: string;
  correo: string;
  activo: boolean;
  debe_cambiar_password: boolean;
  creado_en: string;
};

const fecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" });

function Estado({ fila }: { fila: FilaEntrenador }) {
  const [texto, clase] = !fila.activo
    ? ["Desactivada", "text-fg-faint"]
    : fila.debe_cambiar_password
      ? ["Pendiente de primer acceso", "text-info"]
      : ["Activa", "text-success"];
  return <span className={`rounded-badge bg-white/5 px-1.5 text-xs ${clase}`}>{texto}</span>;
}

async function ListaEntrenadores() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("perfiles")
    .select("id, nombre, correo, activo, debe_cambiar_password, creado_en")
    .eq("rol", "entrenador")
    .order("activo", { ascending: false })
    .order("nombre");

  if (error) return <p className="text-sm text-danger">No se pudieron cargar las cuentas.</p>;
  const filas = (data ?? []) as FilaEntrenador[];
  if (filas.length === 0) {
    return <p className="text-sm text-fg-muted">Aún no hay cuentas de entrenadores.</p>;
  }

  return (
    <ul className="divide-y divide-line rounded-card shadow-[inset_0_0_0_1px_var(--line)]">
      {filas.map((fila) => (
        <li key={fila.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[15px] ${fila.activo ? "text-fg" : "text-fg-faint line-through"}`}>
                {fila.nombre}
              </span>
              <Estado fila={fila} />
            </div>
            <span className="font-mono text-xs text-fg-muted">{fila.correo}</span>
            <span className="text-xs text-fg-faint">Creada el {fecha.format(new Date(fila.creado_en))}</span>
          </div>
          {fila.activo && <AccionesCuenta id={fila.id} nombre={fila.nombre} />}
        </li>
      ))}
    </ul>
  );
}

export default function PaginaCuentas() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Cuentas</h1>
        <p className="text-sm text-fg-muted">
          Entrenadores con acceso al portal. Las cuentas desactivadas conservan sus registros.
        </p>
      </div>
      <FormularioNuevaCuenta />
      <Suspense fallback={<p className="text-sm text-fg-muted">Cargando cuentas…</p>}>
        <ListaEntrenadores />
      </Suspense>
    </div>
  );
}

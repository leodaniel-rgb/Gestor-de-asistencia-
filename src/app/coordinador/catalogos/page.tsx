import type { Metadata } from "next";
import { Suspense } from "react";
import { requerirUsuario } from "@/lib/auth/dal";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Catalogo } from "./componentes";

export const metadata: Metadata = { title: "Catálogos" };

async function Contenido() {
  await requerirUsuario("coordinador");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("catalogo_opciones")
    .select("id, tipo, nombre, activa")
    .order("activa", { ascending: false })
    .order("creado_en");
  if (error) return <p className="text-sm text-danger">No se pudieron cargar los catálogos.</p>;

  const opciones = data ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Catalogo
        tipo="motivo_sin_clase"
        titulo="Motivos de “No hubo clase”"
        descripcion="Opciones que ve el entrenador al indicar que no hubo clase."
        opciones={opciones.filter((o) => o.tipo === "motivo_sin_clase")}
      />
      <Catalogo
        tipo="categoria_incidencia"
        titulo="Categorías de incidencias"
        descripcion="Opciones para clasificar las incidencias de cada sesión."
        opciones={opciones.filter((o) => o.tipo === "categoria_incidencia")}
      />
    </div>
  );
}

export default function PaginaCatalogos() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[32px] font-normal leading-tight tracking-[-0.022em] text-fg">Catálogos</h1>
        <p className="text-sm text-fg-muted">
          Máximo 6 opciones activas por catálogo. Las que quites se conservan en los registros anteriores.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-fg-muted">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </div>
  );
}

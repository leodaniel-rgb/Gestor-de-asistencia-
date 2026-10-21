import { DIAS } from "@/lib/catalogos";
import type { Filtros } from "./filtros";

const claseControl = "h-10 rounded-control border border-line bg-surface px-3 text-sm text-fg";

/** Una sola fila de filtros arriba de todo lo que afecta (formulario GET: sin JavaScript). */
export function BarraFiltros({
  f,
  disciplinas,
}: {
  f: Filtros;
  disciplinas: { id: string; nombre: string }[];
}) {
  return (
    <form method="get" className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)] print:hidden">
      <input type="hidden" name="vista" value={f.vista} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Periodo
          <select name="periodo" defaultValue={f.periodo} className={claseControl}>
            <option value="semana">Semana actual</option>
            <option value="semana-pasada">Semana pasada</option>
            <option value="mes">Este mes</option>
            <option value="libre">Rango libre (máx. 3 meses)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Desde
          <input type="date" name="desde" defaultValue={f.desde} className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Hasta
          <input type="date" name="hasta" defaultValue={f.hasta} className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Disciplina
          <select name="disciplina" defaultValue={f.disciplina ?? ""} className={`${claseControl} min-w-44`}>
            <option value="">Todas</option>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        {f.vista === "listas" ? (
          <>
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Mostrar
              <select name="estado" defaultValue={f.estado} className={claseControl}>
                <option value="asistio">Asistencias</option>
                <option value="falta">Faltas</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
              Género
              <select name="genero" defaultValue={f.genero} className={claseControl}>
                <option value="todos">Todos</option>
                <option value="f">Mujeres</option>
                <option value="m">Hombres</option>
                <option value="nb">No binario</option>
                <option value="sa">Sin asignar</option>
              </select>
            </label>
          </>
        ) : (
          <label className="flex h-10 items-center gap-2 text-[13px] text-fg-muted">
            <input type="checkbox" name="corregidas" value="1" defaultChecked={f.corregidas} />
            Incluir salidas corregidas en el tiempo promedio
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-fg-muted">Días:</span>
        {DIAS.map((d) => (
          <label
            key={d.valor}
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-[13px] text-fg-body has-checked:border-fg-muted has-checked:bg-white/10 has-checked:text-fg"
          >
            <input
              type="checkbox"
              name="dias"
              value={d.valor}
              defaultChecked={!f.dias || f.dias.includes(d.valor)}
              className="sr-only"
            />
            {d.largo}
          </label>
        ))}
        <button type="submit" className="ml-auto h-10 rounded-control bg-white px-4 text-sm font-medium text-canvas hover:opacity-90">
          Aplicar filtros
        </button>
      </div>
      <p className="text-xs text-fg-faint">
        Las fechas Desde/Hasta solo se usan con “Rango libre”. No cuentan los registros anulados ni las asistencias de
        alumnos pendientes de aprobación.
      </p>
    </form>
  );
}

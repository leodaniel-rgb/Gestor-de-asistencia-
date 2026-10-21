"use client";

import { useActionState } from "react";
import { Aviso, Boton, Campo, Tarjeta } from "@/components/ui";
import {
  DIAS,
  ETIQUETA_GENERO,
  ETIQUETA_TIPO,
  GENEROS,
  TIPOS_DISCIPLINA,
} from "@/lib/catalogos";
import { AYUDA_MATRICULA } from "@/lib/matricula";
import {
  actualizarDisciplina,
  asignarEntrenador,
  crearDisciplina,
  inscribirAlumno,
  type EstadoForm,
} from "./actions";

const claseSelect =
  "h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-fg-muted";

function SelectorDias({ seleccionados = [] }: { seleccionados?: number[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[13px] text-fg-muted">Días habituales de clase (opcional)</legend>
      <div className="flex flex-wrap gap-2">
        {DIAS.map((d) => (
          <label
            key={d.valor}
            title={d.largo}
            className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-[13px] text-fg-body has-checked:border-accent has-checked:bg-accent/10 has-checked:text-fg"
          >
            <input
              type="checkbox"
              name="dias"
              value={d.valor}
              defaultChecked={seleccionados.includes(d.valor)}
              className="sr-only"
            />
            {d.largo}
          </label>
        ))}
      </div>
      <p className="text-xs text-fg-faint">
        Solo define cuándo se recuerda registrar asistencia. Se puede registrar cualquier día.
      </p>
    </fieldset>
  );
}

function Mensajes({ estado }: { estado: EstadoForm }) {
  const error =
    estado.error ?? Object.values(estado.errores ?? {}).flat()[0];
  return (
    <>
      {error && <Aviso>{error}</Aviso>}
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
    </>
  );
}

export function FormularioNuevaDisciplina() {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(crearDisciplina, {});
  return (
    <Tarjeta className="flex flex-col gap-4">
      <h2 className="text-base font-medium text-fg">Nueva disciplina</h2>
      <form action={accion} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="nombre-disciplina" name="nombre" etiqueta="Nombre" placeholder="Ej. Voleibol" required />
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
            Tipo
            <select name="tipo" defaultValue="lista" className={claseSelect}>
              {TIPOS_DISCIPLINA.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <SelectorDias />
        <Mensajes estado={estado} />
        <Boton type="submit" variante="primario" disabled={pendiente} className="w-fit">
          {pendiente ? "Creando…" : "Crear disciplina"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

export function FormularioEditarDisciplina({
  disciplina,
}: {
  disciplina: { id: string; nombre: string; dias_clase: number[]; activa: boolean };
}) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(actualizarDisciplina, {});
  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={disciplina.id} />
      <Campo id="nombre-edicion" name="nombre" etiqueta="Nombre" defaultValue={disciplina.nombre} required />
      <SelectorDias seleccionados={disciplina.dias_clase} />
      <label className="flex items-center gap-2 text-sm text-fg-body">
        <input type="checkbox" name="activa" defaultChecked={disciplina.activa} className="size-4 accent-[var(--accent)]" />
        Disciplina activa
      </label>
      <Mensajes estado={estado} />
      <Boton type="submit" disabled={pendiente} className="w-fit">
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </Boton>
    </form>
  );
}

export function FormularioAsignar({
  disciplinaId,
  entrenadores,
}: {
  disciplinaId: string;
  entrenadores: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(asignarEntrenador, {});
  if (entrenadores.length === 0) {
    return <p className="text-[13px] text-fg-muted">No hay más entrenadores activos para asignar.</p>;
  }
  return (
    <form action={accion} className="flex flex-col gap-2">
      <input type="hidden" name="disciplina_id" value={disciplinaId} />
      <div className="flex flex-wrap gap-2">
        <select name="entrenador_id" defaultValue="" className={`${claseSelect} min-w-56 flex-1`} aria-label="Entrenador">
          <option value="" disabled>
            Elegir entrenador…
          </option>
          {entrenadores.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <Boton type="submit" disabled={pendiente}>
          Asignar
        </Boton>
      </div>
      <Mensajes estado={estado} />
    </form>
  );
}

export function FormularioInscribir({ disciplinaId }: { disciplinaId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(inscribirAlumno, {});
  const v = estado.valores;

  return (
    // React reinicia el formulario tras cada envío: se vuelve a montar con lo
    // escrito cuando hay que corregir, y vacío cuando la inscripción fue exitosa.
    <form key={JSON.stringify(estado)} action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="disciplina_id" value={disciplinaId} />
      {estado.confirmarMatricula && <input type="hidden" name="confirmada" value={estado.confirmarMatricula} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo
          id="matricula-nueva"
          name="matricula"
          etiqueta="Matrícula"
          inputMode="text"
          autoComplete="off"
          placeholder="AL07210101"
          required
          autoFocus={Boolean(estado.ok)}
          defaultValue={v?.matricula}
          className="font-mono"
        />
        <Campo id="nombre-alumno" name="nombre" etiqueta="Nombre completo" autoComplete="off" defaultValue={v?.nombre} />
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
          Género
          <select name="genero" defaultValue={v?.genero ?? ""} className={claseSelect}>
            <option value="">Sin asignar</option>
            {GENEROS.map((g) => (
              <option key={g} value={g}>
                {ETIQUETA_GENERO[g]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-fg-faint">
        {AYUDA_MATRICULA} Si el alumno ya existe, se usa su registro y no hace falta el nombre.
      </p>
      {estado.confirmarMatricula && (
        <Aviso>¿La matrícula es {estado.confirmarMatricula}? Si es correcta, pulsa “Confirmar e inscribir”.</Aviso>
      )}
      <Mensajes estado={estado} />
      <Boton type="submit" variante="primario" disabled={pendiente} className="w-fit">
        {pendiente ? "Inscribiendo…" : estado.confirmarMatricula ? "Confirmar e inscribir" : "Inscribir"}
      </Boton>
    </form>
  );
}

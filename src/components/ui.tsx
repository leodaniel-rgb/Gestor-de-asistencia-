import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

type Variante = "primario" | "secundario" | "peligro";

const estilosBoton: Record<Variante, string> = {
  // Único botón de acento por vista (docs/diseno.md).
  primario:
    "bg-accent text-on-accent font-medium hover:opacity-90 disabled:opacity-50",
  secundario:
    "border border-line text-fg-body hover:bg-elevated disabled:opacity-50",
  peligro:
    "border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50",
};

export function Boton({
  variante = "secundario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-control px-4 text-sm tracking-[-0.011em] transition-colors disabled:cursor-not-allowed ${estilosBoton[variante]} ${className}`}
      {...props}
    />
  );
}

export function Campo({
  etiqueta,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  error?: string;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-fg-muted">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 rounded-control border border-line bg-surface px-3.5 text-[15px] text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-fg-muted aria-invalid:border-danger"
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Tarjeta({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card bg-surface p-6 shadow-[inset_0_0_0_1px_var(--line)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Aviso({
  tono = "error",
  children,
}: {
  tono?: "error" | "exito";
  children: ReactNode;
}) {
  const color =
    tono === "error"
      ? "border-danger/40 text-danger"
      : "border-success/40 text-success";
  return (
    <p role="status" className={`rounded-control border px-3 py-2 text-sm ${color}`}>
      {children}
    </p>
  );
}

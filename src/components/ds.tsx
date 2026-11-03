import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/lib/utils";

/** Variantes de estado: sempre acompanhadas de texto, nunca só cor. */
export type TagTone = "free" | "booked" | "imported" | "conflict" | "neutral";

const TAG_TONE: Record<TagTone, string> = {
  free: "bg-occ-free border-line-free",
  booked: "bg-occ-booked border-line-booked",
  imported: "bg-occ-imported border-line-imported",
  conflict: "bg-occ-conflict border-line-conflict",
  neutral: "bg-surface-2 border-border",
};

/** Fundo suave de cada estado, para cartões de contagem e blocos (mesma paleta da Tag). */
export const TONE_SURFACE: Record<TagTone, string> = {
  free: "bg-occ-free",
  booked: "bg-occ-booked",
  imported: "bg-occ-imported",
  conflict: "bg-occ-conflict",
  neutral: "bg-surface-2",
};

/** Etiqueta em pílula (11,5 px, peso 600) com linha colorida e rótulo textual. */
export function Tag({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: TagTone }) {
  return (
    <span
      data-slot="tag"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] leading-[1.45] font-semibold whitespace-nowrap text-foreground",
        TAG_TONE[tone],
        className,
      )}
      {...props}
    />
  );
}

type DataTableProps = {
  /** Nome acessível da região rolável (leitores de tela anunciam que ela rola). */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Moldura de tabela: borda fina e cantos de 16 px; em telas estreitas rola na horizontal dentro
 * do próprio contêiner (a página nunca rola de lado). Use com `DataTable.head`/`row` nas classes.
 */
export function DataTable({ label, children, className }: DataTableProps) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: região rolável precisa ser alcançável pelo teclado
      tabIndex={0}
      className={cn(
        "max-w-full overflow-x-auto rounded-2xl border bg-background focus-visible:ring-[3px] focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Classes padrão de células: cabeçalho em superfície suave e linhas separadas por fio fino. */
export const TABLE = {
  table: "w-full border-collapse text-left text-sm",
  head: "bg-surface text-xs font-semibold tracking-wide text-muted-foreground uppercase",
  th: "border-b px-3 py-2.5 font-semibold",
  td: "border-b px-3 py-2.5 align-top last:border-b-0",
} as const;

type FieldProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Campo de formulário: rótulo 13 px/600, dica opcional e erro no estilo da mensagem de erro. */
export function Field({ id, label, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type ChoiceCardProps = Omit<ComponentProps<"input">, "type" | "title"> & {
  type?: "checkbox" | "radio";
  title: ReactNode;
  description?: ReactNode;
};

/** Escolha em cartão (como o .radio do protótipo): borda e realce de destaque quando marcada. */
export function ChoiceCard({
  type = "radio",
  title,
  description,
  className,
  ...props
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors hover:border-muted-foreground has-[:checked]:border-primary has-[:checked]:bg-surface-2 has-[:checked]:shadow-[inset_0_0_0_1px_var(--accent)] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        className,
      )}
    >
      <input type={type} className="mt-0.5 size-[18px] shrink-0 accent-primary" {...props} />
      <span className="grid gap-0.5">
        <span className="font-semibold">{title}</span>
        {description !== undefined && (
          <span className="text-[13px] text-muted-foreground">{description}</span>
        )}
      </span>
    </label>
  );
}

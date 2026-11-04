import { cn } from "#/lib/utils";

/** Visualizações da página `/`: uma sala na semana ou as salas em colunas, livres ou na semana. */
export type PageView = "sala" | "colunas" | "livres" | "geral";

const VIEWS: ReadonlyArray<{ value: PageView; label: string }> = [
  { value: "sala", label: "Sala" },
  { value: "colunas", label: "Colunas" },
  { value: "livres", label: "Livres" },
  { value: "geral", label: "Visão geral" },
];

type Props = {
  value: PageView;
  onChange: (view: PageView) => void;
  className?: string;
};

/** Botões de visualização; o escolhido fica marcado com `aria-pressed`. */
export function ViewSwitcher({ value, onChange, className }: Props) {
  return (
    <fieldset
      aria-label="Visualização"
      className={cn("flex rounded-md border bg-surface p-0.5", className)}
    >
      {VIEWS.map((view) => (
        <button
          key={view.value}
          type="button"
          aria-pressed={value === view.value}
          onClick={() => onChange(view.value)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            value === view.value && "bg-background text-foreground shadow-xs",
          )}
        >
          {view.label}
        </button>
      ))}
    </fieldset>
  );
}

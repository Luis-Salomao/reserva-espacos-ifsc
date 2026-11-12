import { cn } from "#/lib/utils";

/** Visualizações da página `/`: uma sala na semana ou as salas em colunas, livres ou na semana. */
export type PageView = "sala" | "colunas" | "livres" | "geral";

const VIEWS: ReadonlyArray<{ value: PageView; label: string }> = [
  { value: "sala", label: "Sala" },
  { value: "colunas", label: "Colunas" },
  { value: "livres", label: "Livres" },
  { value: "geral", label: "Visão geral" },
];

const VIEW_HELP: Record<PageView, string> = {
  sala: "Veja a semana de uma sala. Use o seletor para trocar de ambiente.",
  colunas: "Compare a ocupação das salas em um dia.",
  livres: "Encontre apenas salas livres no intervalo selecionado.",
  geral: "Confira a ocupação semanal dos espaços.",
};

type Props = {
  value: PageView;
  onChange: (view: PageView) => void;
  className?: string;
};

/** Botões de visualização; o escolhido fica marcado com `aria-pressed`. */
export function ViewSwitcher({ value, onChange, className }: Props) {
  return (
    <div className={cn("grid gap-1", className)}>
      <fieldset
        aria-label="Visualização"
        className="flex w-full max-w-full flex-wrap rounded-md border bg-surface p-0.5 sm:w-fit"
      >
        {VIEWS.map((view) => (
          <button
            key={view.value}
            type="button"
            aria-pressed={value === view.value}
            title={VIEW_HELP[view.value]}
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
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {VIEW_HELP[value]}
      </p>
    </div>
  );
}

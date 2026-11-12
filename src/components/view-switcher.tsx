import { CalendarDays, DoorOpen, Info, LayoutGrid, type LucideIcon, Rows3, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/** Visualizações da página `/`: uma sala na semana ou as salas em colunas, livres ou na semana. */
export type PageView = "sala" | "colunas" | "livres" | "geral";

const VIEWS: ReadonlyArray<{ value: PageView; label: string; icon: LucideIcon }> = [
  { value: "sala", label: "Uma sala", icon: CalendarDays },
  { value: "colunas", label: "Salas por horário", icon: Rows3 },
  { value: "livres", label: "Salas livres", icon: DoorOpen },
  { value: "geral", label: "Visão geral", icon: LayoutGrid },
];

const VIEW_HELP: Record<PageView, string> = {
  sala: "Veja a semana de uma sala. Use o seletor para trocar de ambiente.",
  colunas: "Compare a ocupação das salas em um dia.",
  livres: "Encontre apenas salas livres no intervalo selecionado.",
  geral: "Confira a ocupação semanal dos espaços.",
};

/** Texto dos cartões do modal (a Visão geral também tem o modo por dia). */
const CARD_HELP: Record<PageView, string> = {
  ...VIEW_HELP,
  geral: "Todas as salas, por dia ou por semana, em quadradinhos por bloco de horário.",
};

type Props = {
  value: PageView;
  onChange: (view: PageView) => void;
  className?: string;
};

/** Botão (i) que abre o modal com os modos de visualização, em cartões. */
function ViewsInfo({ value, onChange }: Pick<Props, "value" | "onChange">) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sobre as visualizações"
          title="Sobre as visualizações"
          className="size-8 shrink-0 rounded-full"
        >
          <Info className="size-4" aria-hidden="true" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[50%] left-[50%] z-50 grid max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-2xl border bg-background p-5 shadow-lg"
        >
          <div className="flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-foreground">
              Modos de visualização
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Fechar"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {VIEWS.map((view) => {
              const Icon = view.icon;
              const current = value === view.value;
              return (
                <button
                  key={view.value}
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => {
                    onChange(view.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "grid gap-1.5 rounded-xl border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    current && "border-primary bg-primary/10",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-md border bg-background text-primary"
                    >
                      <Icon className="size-5" />
                    </span>
                    {view.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{CARD_HELP[view.value]}</span>
                </button>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Barra de abas de visualização; a escolhida fica marcada com `aria-pressed`. */
export function ViewSwitcher({ value, onChange, className }: Props) {
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex items-center gap-1">
        <fieldset
          aria-label="Visualização"
          className="flex w-full max-w-full flex-wrap gap-1 rounded-lg border bg-surface p-1 sm:w-fit"
        >
          {VIEWS.map((view) => (
            <button
              key={view.value}
              type="button"
              aria-pressed={value === view.value}
              title={VIEW_HELP[view.value]}
              onClick={() => onChange(view.value)}
              className={cn(
                "min-h-10 flex-1 rounded-md sm:flex-none px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                value === view.value &&
                  "bg-primary font-semibold text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {view.label}
            </button>
          ))}
        </fieldset>
        <ViewsInfo value={value} onChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {VIEW_HELP[value]}
      </p>
    </div>
  );
}

import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Switch } from "#/components/ui/switch";
import { OTHER_BLOCK, type RoomFilter, windowIssue } from "#/domain/room-filter";
import { cn } from "#/lib/utils";

export type RoomsFiltersProps = {
  /** Blocos com pelo menos uma sala (`blocksOf`). */
  blocks: readonly string[];
  filter: RoomFilter;
  total: number;
  shown: number;
  hiddenNoCapacity: number;
  /** Celular: blocos, capacidade, busca e "Só livres" ficam no botão "Filtros". */
  compact: boolean;
  onChange: (filter: RoomFilter) => void;
};

function blockLabel(block: string): string {
  return block === OTHER_BLOCK ? "Outros espaços" : `Bloco ${block}`;
}

function parseCapacity(text: string): number | null {
  const value = Number(text);
  return /^\d{1,3}$/.test(text.trim()) && value >= 1 ? value : null;
}

/**
 * Texto do campo guardado localmente (o usuário pode digitar "sala " ou "0" no caminho) e
 * realinhado só quando o valor de fora muda para algo que o texto atual não produz.
 */
function useFieldText(value: string, toValue: (text: string) => string) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (toValue(text) !== value) setText(value);
  }
  return [text, setText] as const;
}

function activeCount(filter: RoomFilter, blocks: readonly string[]): number {
  return [
    filter.blocks.some((block) => blocks.includes(block)),
    filter.minCapacity !== null,
    filter.query.trim() !== "",
    filter.onlyFree,
  ].filter(Boolean).length;
}

function WindowFields({ filter, onChange }: Pick<RoomsFiltersProps, "filter" | "onChange">) {
  const id = useId();
  const issue = windowIssue(filter.window);
  const setWindow = (key: "start" | "end", value: string) => {
    if (value !== "") onChange({ ...filter, window: { ...filter.window, [key]: value } });
  };
  return (
    <div className="grid gap-1">
      <div className="flex items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-ini`}>Início</Label>
          <Input
            id={`${id}-ini`}
            type="time"
            step={300}
            className="h-9 w-[7.5rem]"
            value={filter.window.start}
            onChange={(event) => setWindow("start", event.target.value)}
          />
        </div>
        <span className="pb-2 text-muted-foreground" aria-hidden="true">
          –
        </span>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-fim`}>Fim</Label>
          <Input
            id={`${id}-fim`}
            type="time"
            step={300}
            className="h-9 w-[7.5rem]"
            value={filter.window.end}
            aria-invalid={issue !== null}
            aria-describedby={issue === null ? undefined : `${id}-erro`}
            onChange={(event) => setWindow("end", event.target.value)}
          />
        </div>
      </div>
      {issue !== null && (
        <p id={`${id}-erro`} role="alert" className="text-[13px] text-destructive">
          {issue}
        </p>
      )}
    </div>
  );
}

function OtherFields({
  blocks,
  filter,
  onChange,
  stacked,
}: Pick<RoomsFiltersProps, "blocks" | "filter" | "onChange"> & { stacked: boolean }) {
  const id = useId();
  const [query, setQuery] = useFieldText(filter.query, (text) => text.trim());
  const capacityValue = filter.minCapacity === null ? "" : String(filter.minCapacity);
  const [capacity, setCapacity] = useFieldText(capacityValue, (text) => {
    const parsed = parseCapacity(text);
    return parsed === null ? "" : String(parsed);
  });
  const toggleBlock = (block: string) => {
    const next = filter.blocks.includes(block)
      ? filter.blocks.filter((item) => item !== block)
      : [...filter.blocks, block];
    onChange({ ...filter, blocks: next });
  };
  return (
    <div className={cn("flex gap-3", stacked ? "flex-col" : "flex-wrap items-end")}>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-busca`}>Buscar sala</Label>
        <Input
          id={`${id}-busca`}
          type="search"
          className={cn("h-9", stacked ? "w-full" : "w-48")}
          placeholder="Nome da sala"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange({ ...filter, query: event.target.value });
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-cap`}>Capacidade mínima</Label>
        <Input
          id={`${id}-cap`}
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          className={cn("h-9", stacked ? "w-full" : "w-32")}
          placeholder="Lugares"
          value={capacity}
          onChange={(event) => {
            setCapacity(event.target.value);
            onChange({ ...filter, minCapacity: parseCapacity(event.target.value) });
          }}
        />
      </div>
      <div className="flex h-9 items-center gap-2">
        <Switch
          id={`${id}-livres`}
          checked={filter.onlyFree}
          onCheckedChange={(checked) => onChange({ ...filter, onlyFree: checked })}
        />
        <Label htmlFor={`${id}-livres`}>Só livres</Label>
      </div>
      {blocks.length > 0 && (
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Blocos</legend>
          {blocks.map((block) => {
            const pressed = filter.blocks.includes(block);
            return (
              <button
                key={block}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggleBlock(block)}
                className={cn(
                  "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  pressed
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {blockLabel(block)}
              </button>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

/** Filtros de `/salas`: janela, blocos, capacidade mínima, busca, "Só livres" e o contador. */
export function RoomsFilters(props: RoomsFiltersProps) {
  const { blocks, filter, total, shown, hiddenNoCapacity, compact, onChange } = props;
  const count = activeCount(filter, blocks);
  return (
    <section aria-label="Filtros das salas" className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <WindowFields filter={filter} onChange={onChange} />
        {compact ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-9">
                <SlidersHorizontal aria-hidden="true" />
                {count > 0 ? `Filtros (${count})` : "Filtros"}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label="Filtros"
              className="w-[min(20rem,calc(100vw-2rem))]"
            >
              <OtherFields blocks={blocks} filter={filter} onChange={onChange} stacked />
            </PopoverContent>
          </Popover>
        ) : (
          <OtherFields blocks={blocks} filter={filter} onChange={onChange} stacked={false} />
        )}
      </div>
      <div className="grid gap-0.5 text-[13px]" aria-live="polite">
        <p className="text-muted-foreground">{`${shown} de ${total} ${total === 1 ? "sala" : "salas"}`}</p>
        {hiddenNoCapacity > 0 && (
          <p>
            {hiddenNoCapacity === 1
              ? "1 sala sem capacidade cadastrada ficou de fora"
              : `${hiddenNoCapacity} salas sem capacidade cadastrada ficaram de fora`}
          </p>
        )}
      </div>
    </section>
  );
}

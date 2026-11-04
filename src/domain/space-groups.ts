import { blockOf } from "./room-filter";

const OTHER_BLOCK_LABEL = "Outros espaços";
const NO_FLOOR_LABEL = "Sem andar identificado";

/** Andar = primeiro dígito do código de 3 dígitos depois da letra (`A-202` → `2`); `null` sem código. */
export function floorOf(name: string): string | null {
  return /(?:^|\s)[A-Z]\s*[-.]?\s*(\d{3})(?!\d)/i.exec(name)?.[1]?.[0] ?? null;
}

type FloorGroup<T> = { label: string; spaces: T[] };
type BlockGroup<T> = { label: string; floors: FloorGroup<T>[] };

const collator = new Intl.Collator("pt-BR", { numeric: true });

function byLabelWithLast(last: string) {
  return ([a]: [string, unknown], [b]: [string, unknown]) => {
    if (a === last || b === last) return a === last ? (b === last ? 0 : 1) : -1;
    return collator.compare(a, b);
  };
}

/**
 * Agrupa por bloco ("Bloco A"… e "Outros espaços" por último) e, dentro do bloco, por andar
 * ("Andar 1"… e "Sem andar identificado" por último), com nomes em ordem natural.
 */
export function groupSpaces<T extends { name: string }>(spaces: readonly T[]): BlockGroup<T>[] {
  const blocks = new Map<string, Map<string, T[]>>();
  for (const space of spaces) {
    const block = blockOf(space.name);
    const floor = floorOf(space.name);
    const blockLabel = block === null ? OTHER_BLOCK_LABEL : `Bloco ${block}`;
    const floorLabel = floor === null ? NO_FLOOR_LABEL : `Andar ${floor}`;
    const floors = blocks.get(blockLabel) ?? new Map<string, T[]>();
    floors.set(floorLabel, [...(floors.get(floorLabel) ?? []), space]);
    blocks.set(blockLabel, floors);
  }
  return [...blocks].sort(byLabelWithLast(OTHER_BLOCK_LABEL)).map(([label, floors]) => ({
    label,
    floors: [...floors].sort(byLabelWithLast(NO_FLOOR_LABEL)).map(([floorLabel, list]) => ({
      label: floorLabel,
      spaces: [...list].sort((a, b) => collator.compare(a.name, b.name)),
    })),
  }));
}

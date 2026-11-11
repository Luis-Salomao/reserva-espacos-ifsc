/**
 * Catálogo dos equipamentos de um espaço. `presence` guarda 1 = tem e 0 = não tem; `count` guarda
 * a quantidade (0 = não tem). Tipo novo entra aqui, sem migração (AD-003).
 */
export const EQUIPMENT = [
  { kind: "projetor", label: "Projetor", measure: "presence" },
  { kind: "computadores", label: "Computadores", measure: "count" },
  { kind: "som", label: "Aparelho de som", measure: "presence" },
] as const;

export type EquipmentKind = (typeof EQUIPMENT)[number]["kind"];

/**
 * Equipamentos cadastrados. Tipo ausente em `items` = não informado; `notes` null = não informado.
 * `computersInMaintenance` é independente da contagem de `computadores` em `items`: quantos deles
 * estão fora de uso; `null` = não informado.
 */
export type SpaceEquipment = {
  items: Partial<Record<EquipmentKind, number>>;
  notes: string | null;
  /** Ausente nas leituras antigas (coluna recém-criada); presente e `null` = não informado. */
  computersInMaintenance?: number | null;
};

const KINDS: ReadonlySet<string> = new Set(EQUIPMENT.map((item) => item.kind));

export function isEquipmentKind(value: string): value is EquipmentKind {
  return KINDS.has(value);
}

type Texts = { has: (quantity: number) => string; none: string; unknown: string };

const TEXTS: Record<EquipmentKind, Texts> = {
  projetor: { has: () => "Projetor", none: "Sem projetor", unknown: "Projetor não informado" },
  computadores: {
    has: (quantity) => (quantity === 1 ? "1 computador" : `${quantity} computadores`),
    none: "Sem computadores",
    unknown: "Computadores não informados",
  },
  som: {
    has: () => "Aparelho de som",
    none: "Sem aparelho de som",
    unknown: "Aparelho de som não informado",
  },
};

/** Rótulo do equipamento no estado cadastrado; `known` é falso só quando não foi informado. */
export function describeEquipment(
  kind: EquipmentKind,
  quantity: number | undefined,
): { text: string; known: boolean } {
  const texts = TEXTS[kind];
  if (quantity === undefined) return { text: texts.unknown, known: false };
  return { text: quantity > 0 ? texts.has(quantity) : texts.none, known: true };
}

import type { TimeRange } from "./availability";
import type { SpaceEquipment } from "./equipment";

/** Bloco das salas sem código no nome ("Auditório", "ADM 2"). */
export const OTHER_BLOCK = "Outros";

const WINDOW_ISSUE = "O fim precisa ser depois do início";
const STEP = 30;
const LAST_MINUTE = 23 * 60 + 59;

/** O que o filtro precisa de cada sala: o dia, os trechos livres do expediente e o cadastro. */
type FilterableRoom = {
  date: string;
  free: readonly TimeRange[];
  space: { name: string; capacity: number | null; equipment?: SpaceEquipment };
};

export type RoomFilter = {
  /** Vazio = todos; `OTHER_BLOCK` = salas sem bloco. Blocos sem nenhuma sala são ignorados. */
  blocks: readonly string[];
  /** Vazio = todos; senão só as salas desses andares. Andares sem nenhuma sala são ignorados. */
  floors: readonly number[];
  minCapacity: number | null;
  /** Só salas com projetor informado e quantidade maior que zero. */
  withProjector: boolean;
  /** `null` = qualquer quantidade; senão, computadores informados e pelo menos este número. */
  minComputers: number | null;
  query: string;
  onlyFree: boolean;
  window: TimeRange;
};

/** Letra do bloco no nome (`A-202` → `A`, `Lab. A102` → `A`); `null` sem código. */
export function blockOf(name: string): string | null {
  return /(?:^|\s)([A-Z])\s*[-.]?\s*\d/i.exec(name)?.[1]?.toUpperCase() ?? null;
}

/** Andar pelo código da sala (letra + três dígitos): o primeiro dígito (`A-202` → 2); `null` sem código. */
export function floorOf(name: string): number | null {
  const code = /(?:^|\s)[A-Z]\s*[-.]?\s*(\d{3})(?!\d)/i.exec(name)?.[1];
  return code === undefined ? null : Number(code[0]);
}

/** Andares com pelo menos uma sala, em ordem crescente. */
export function floorsOf(rooms: readonly FilterableRoom[]): number[] {
  const found = new Set<number>();
  for (const room of rooms) {
    const floor = floorOf(room.space.name);
    if (floor !== null) found.add(floor);
  }
  return [...found].sort((a, b) => a - b);
}

function groupOf(name: string): string {
  return blockOf(name) ?? OTHER_BLOCK;
}

/** Blocos com pelo menos uma sala, em ordem alfabética, com `OTHER_BLOCK` por último. */
export function blocksOf(rooms: readonly FilterableRoom[]): string[] {
  const found = new Set(rooms.map((room) => groupOf(room.space.name)));
  const letters = [...found].filter((block) => block !== OTHER_BLOCK).sort();
  return found.has(OTHER_BLOCK) ? [...letters, OTHER_BLOCK] : letters;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Livre quando a janela cabe inteira num trecho livre do expediente e não começa no passado
 * (`data + início` até `now` conta como ocupado, como na reserva).
 */
export function isFreeIn(
  day: Pick<FilterableRoom, "date" | "free">,
  window: TimeRange,
  now: string,
): boolean {
  if (`${day.date}T${window.start}` <= now) return false;
  return day.free.some((range) => range.start <= window.start && window.end <= range.end);
}

/**
 * Por que a sala não está livre na janela: cada ocupação que a cruza (só título e horário),
 * `past` quando a janela já começou e `closed` quando nada a ocupa mas ela sai do expediente.
 */
export type BusyReason =
  | { kind: "occupation"; title: string; start: string; end: string }
  | { kind: "past" }
  | { kind: "closed" };

type Occupied = Pick<FilterableRoom, "date" | "free"> & {
  occupations: readonly { title: string; start: string; end: string }[];
};

/** Salas livres na janela (ordem recebida) e, depois, as ocupadas com o motivo. */
export function availabilityIn<R extends Occupied>(
  rooms: readonly R[],
  window: TimeRange,
  now: string,
): { free: R[]; busy: Array<{ room: R; reasons: BusyReason[] }> } {
  const free: R[] = [];
  const busy: Array<{ room: R; reasons: BusyReason[] }> = [];
  for (const room of rooms) {
    if (isFreeIn(room, window, now)) {
      free.push(room);
      continue;
    }
    const reasons: BusyReason[] = room.occupations
      .filter((item) => item.start < window.end && item.end > window.start)
      .map((item) => ({ kind: "occupation", title: item.title, start: item.start, end: item.end }));
    if (`${room.date}T${window.start}` <= now) reasons.unshift({ kind: "past" });
    busy.push({ room, reasons: reasons.length > 0 ? reasons : [{ kind: "closed" }] });
  }
  return { free, busy };
}

/** Texto do motivo na tela ("Cálculo I, 14:00–15:40", "Horário já passou"...). */
export function busyReasonText(reason: BusyReason): string {
  if (reason.kind === "past") return "Horário já passou";
  if (reason.kind === "closed") return "Fora do horário de funcionamento";
  return `${reason.title}, ${reason.start}–${reason.end}`;
}

/** Mensagem da tela para janela com fim antes do início (ou igual); `null` se a janela vale. */
export function windowIssue(window: TimeRange): string | null {
  return window.end <= window.start ? WINDOW_ISSUE : null;
}

/**
 * Aplica bloco, andar, capacidade mínima, busca (sem acento nem caixa) e "só livres", na ordem recebida.
 * `hiddenNoCapacity` conta as salas sem capacidade cadastrada que só ficaram de fora por isso.
 */
export function filterRooms<R extends FilterableRoom>(
  rooms: readonly R[],
  filter: RoomFilter,
  now: string,
): { rooms: R[]; hiddenNoCapacity: number } {
  const present = new Set(blocksOf(rooms));
  const blocks = new Set(filter.blocks.filter((block) => present.has(block)));
  const presentFloors = new Set(floorsOf(rooms));
  const floors = new Set(filter.floors.filter((floor) => presentFloors.has(floor)));
  const query = normalize(filter.query);
  const passesOthers = (room: R) =>
    (blocks.size === 0 || blocks.has(groupOf(room.space.name))) &&
    (floors.size === 0 || floors.has(floorOf(room.space.name) ?? -1)) &&
    normalize(room.space.name).includes(query) &&
    (!filter.withProjector || (room.space.equipment?.items.projetor ?? 0) > 0) &&
    (filter.minComputers === null ||
      (room.space.equipment?.items.computadores ?? -1) >= filter.minComputers) &&
    (!filter.onlyFree || isFreeIn(room, filter.window, now));
  const kept: R[] = [];
  let hiddenNoCapacity = 0;
  for (const room of rooms) {
    if (!passesOthers(room)) continue;
    const { capacity } = room.space;
    if (filter.minCapacity === null || (capacity !== null && capacity >= filter.minCapacity)) {
      kept.push(room);
    } else if (capacity === null) {
      hiddenNoCapacity++;
    }
  }
  return { rooms: kept, hiddenNoCapacity };
}

function toTime(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Próxima 1 h depois de agora, com início no meio horário seguinte; não passa de 23:59. */
export function defaultWindow(now: string): TimeRange {
  const current = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16));
  const start = Math.min((Math.floor(current / STEP) + 1) * STEP, 23 * 60);
  return { start: toTime(start), end: toTime(Math.min(start + 60, LAST_MINUTE)) };
}

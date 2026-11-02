import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import type { ImportRowStatus } from "#/domain/import-batch";
import type { Semester } from "#/domain/semester";
import type { PreviewView } from "#/server/import-preview-view";

export const IGNORE_VALUE = "ignore";
export const CREATE_VALUE = "create";
const SPACE_PREFIX = "space:";
const USER_PREFIX = "user:";

/** Durações (posições) que o arquivo usa e o semestre não tem datas para elas, e quantos horários isso afeta. */
export function termsWithoutDates(
  termsUsed: PreviewView["termsUsed"],
  semester: Pick<Semester, "terms">,
): { positions: number[]; slots: number } {
  const configured = new Set(semester.terms.map((term) => term.position));
  const missing = new Set<number>();
  let slots = 0;
  for (const term of termsUsed) {
    const absent: number[] = [];
    for (let index = 0; index < term.mask.length; index++) {
      if (term.mask[index] === "1" && !configured.has(index + 1)) absent.push(index + 1);
    }
    if (absent.length === 0) continue;
    for (const position of absent) missing.add(position);
    slots += term.slots;
  }
  return { positions: [...missing].sort((a, b) => a - b), slots };
}

/** Valor do seletor de sala: "" = sem vínculo; "ignore"; "create"; "space:<id>". */
export function roomChoiceOf(suggestion: RoomSuggestion): string {
  const target = suggestion.saved ?? suggestion.suggestion?.target ?? null;
  if (target === null) return "";
  if (target.ignored) return IGNORE_VALUE;
  return target.spaceId === null ? "" : `${SPACE_PREFIX}${target.spaceId}`;
}

export function spaceValue(spaceId: string): string {
  return `${SPACE_PREFIX}${spaceId}`;
}

export function userValue(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

/** Valor do seletor de docente: "" = sem vínculo; "user:<id>". */
export function teacherChoiceOf(suggestion: TeacherSuggestion): string {
  const userId = suggestion.saved
    ? suggestion.saved.userId
    : (suggestion.suggestion?.userId ?? null);
  return userId === null ? "" : `${USER_PREFIX}${userId}`;
}

export type RoomMappingItem = {
  sourceRoomId: string;
  sourceShort: string;
  spaceId: string | null;
  ignored: boolean;
};

/** Salas a criar como espaço novo (nome = nome da sala no arquivo, ou a sigla). */
export function roomsToCreate(
  rooms: ReadonlyArray<{ id: string; short: string; name: string }>,
  choices: Readonly<Record<string, string>>,
): Array<{ sourceId: string; name: string }> {
  return rooms
    .filter((room) => choices[room.id] === CREATE_VALUE)
    .map((room) => ({ sourceId: room.id, name: room.name.trim() || room.short }));
}

/**
 * Vínculos a gravar. Sala sem escolha não é gravada (continua sem vínculo e suas aulas ficam não
 * aplicáveis); "criar" usa o espaço recém-criado de `created` (por id da sala no arquivo).
 */
export function roomMappingsToSave(
  rooms: ReadonlyArray<{ id: string; short: string }>,
  choices: Readonly<Record<string, string>>,
  created: ReadonlyMap<string, string>,
): RoomMappingItem[] {
  const items: RoomMappingItem[] = [];
  for (const room of rooms) {
    const choice = choices[room.id] ?? "";
    const base = { sourceRoomId: room.id, sourceShort: room.short };
    if (choice === IGNORE_VALUE) items.push({ ...base, spaceId: null, ignored: true });
    else if (choice === CREATE_VALUE) {
      const spaceId = created.get(room.id);
      if (spaceId !== undefined) items.push({ ...base, spaceId, ignored: false });
    } else if (choice.startsWith(SPACE_PREFIX)) {
      items.push({ ...base, spaceId: choice.slice(SPACE_PREFIX.length), ignored: false });
    }
  }
  return items;
}

/** Todos os docentes com a escolha atual; "sem vínculo" grava `userId: null` de forma explícita. */
export function teacherMappingsToSave(
  teachers: ReadonlyArray<{ id: string; short: string }>,
  choices: Readonly<Record<string, string>>,
): Array<{ sourceTeacherId: string; sourceShort: string; userId: string | null }> {
  return teachers.map((teacher) => {
    const choice = choices[teacher.id] ?? "";
    return {
      sourceTeacherId: teacher.id,
      sourceShort: teacher.short,
      userId: choice.startsWith(USER_PREFIX) ? choice.slice(USER_PREFIX.length) : null,
    };
  });
}

export const STATUS_LABELS: Record<ImportRowStatus, string> = {
  pendente: "Pendente",
  aplicada: "Aplicada",
  nao_aplicavel: "Não aplicável",
  conflito: "Conflito",
  conflito_interno: "Conflito no arquivo",
  falha: "Falha ao gravar",
};

export const STATUS_ORDER: readonly ImportRowStatus[] = [
  "aplicada",
  "pendente",
  "nao_aplicavel",
  "conflito",
  "conflito_interno",
  "falha",
];

/** Classe de fundo por situação; o texto do rótulo sempre acompanha a cor. */
export const STATUS_TONE: Record<ImportRowStatus, string> = {
  pendente: "bg-surface-2",
  aplicada: "bg-occ-imported",
  nao_aplicavel: "bg-surface-2",
  conflito: "bg-occ-conflict",
  conflito_interno: "bg-occ-conflict",
  falha: "bg-occ-conflict",
};

export const BATCH_STATUS_LABELS = {
  preparando: "Preparando",
  rascunho: "Aguardando aplicação",
  aplicando: "Aplicando",
  aplicado: "Aplicado",
  falhou: "Interrompido por falha",
} as const;

/** "2026-08-03" -> "03/08/2026". */
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

/** "2026-08-03T08:00" -> "03/08 08:00". */
export function formatDateTime(value: string): string {
  const [date = "", time = ""] = value.split("T");
  const [, month, day] = date.split("-");
  return month && day ? `${day}/${month} ${time}` : value;
}

/**
 * ISO UTC -> "03/11/2026 10:30" no fuso informado (TIMEZONE do servidor). Nunca usa o fuso do
 * processo, para a página renderizada no servidor ser idêntica à do navegador (sem divergência na
 * hidratação).
 */
export function formatInstant(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const part = (type: Intl.DateTimeFormatPartTypes, parts: Intl.DateTimeFormatPart[]): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return `${part("day", parts)}/${part("month", parts)}/${part("year", parts)} ${part("hour", parts)}:${part("minute", parts)}`;
}

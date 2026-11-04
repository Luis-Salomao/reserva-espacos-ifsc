import type { RoomSuggestion, TeacherSuggestion } from "#/application/import-mappings";
import type { TagTone } from "#/components/ds";
import type {
  ImportBatch,
  ImportChangeKind,
  ImportRowCounts,
  ImportRowStatus,
  VersionSummary,
} from "#/domain/import-batch";
import type { Semester } from "#/domain/semester";
import type { PreviewView } from "#/server/import-preview-view";

export const IGNORE_VALUE = "ignore";
export const CREATE_VALUE = "create";
export const PLACEHOLDER_VALUE = "placeholder";
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

/** Valor do seletor de docente: "" = sem vínculo; "placeholder" = criar conta fantasma; "user:<id>". */
export function teacherChoiceOf(suggestion: TeacherSuggestion): string {
  if (suggestion.saved === null && suggestion.defaultAction === "fantasma") {
    return PLACEHOLDER_VALUE;
  }
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

type TeacherMappingItem = {
  sourceTeacherId: string;
  sourceShort: string;
  userId: string | null;
  createPlaceholder?: { name: string };
};

/**
 * Todos os docentes com a escolha atual; "sem vínculo" grava `userId: null` de forma explícita e
 * "criar conta fantasma" leva o nome do docente no arquivo.
 */
export function teacherMappingsToSave(
  teachers: ReadonlyArray<{ id: string; short: string; name: string }>,
  choices: Readonly<Record<string, string>>,
): TeacherMappingItem[] {
  return teachers.map((teacher) => {
    const choice = choices[teacher.id] ?? "";
    const base = { sourceTeacherId: teacher.id, sourceShort: teacher.short };
    if (choice === PLACEHOLDER_VALUE) {
      return { ...base, userId: null, createPlaceholder: { name: teacher.name } };
    }
    return {
      ...base,
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
  inalterada: "Inalterada",
  mantida_cancelada: "Cancelada mantida",
  cancelar: "A cancelar",
  cancelada_versao: "Cancelada pela nova versão",
  responsavel: "Responsável a trocar",
  responsavel_atualizado: "Responsável trocado",
  alteracao_bloqueada: "Alteração bloqueada",
};

export const STATUS_ORDER: readonly ImportRowStatus[] = [
  "aplicada",
  "pendente",
  "nao_aplicavel",
  "conflito",
  "conflito_interno",
  "falha",
];

/** Situações próprias de uma nova versão da grade (só aparecem em lotes sobre uma versão vigente). */
export const VERSION_STATUS_ORDER: readonly ImportRowStatus[] = [
  "inalterada",
  "mantida_cancelada",
  "cancelar",
  "cancelada_versao",
  "responsavel",
  "responsavel_atualizado",
  "alteracao_bloqueada",
];

/** Classe de fundo por situação; o texto do rótulo sempre acompanha a cor. */
export const STATUS_TONE: Record<ImportRowStatus, TagTone> = {
  pendente: "neutral",
  aplicada: "imported",
  nao_aplicavel: "neutral",
  conflito: "conflict",
  conflito_interno: "conflict",
  falha: "conflict",
  inalterada: "neutral",
  mantida_cancelada: "neutral",
  cancelar: "neutral",
  cancelada_versao: "imported",
  responsavel: "neutral",
  responsavel_atualizado: "imported",
  alteracao_bloqueada: "conflict",
};

export const CHANGE_KIND_LABELS: Record<ImportChangeKind, string> = {
  inclusao: "Inclusão",
  alteracao: "Alteração",
  remocao: "Remoção",
  inalterada: "Inalterada",
  mantida_cancelada: "Cancelada mantida",
  responsavel: "Troca de responsável",
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

/** Visão da nova versão: um tipo de mudança, ou as alterações seguradas por conflito. */
export type VersionView = ImportChangeKind | "bloqueada";

export type VersionCard = {
  view: VersionView;
  label: string;
  count: number;
  /** Texto do número no cartão (Inclusões acrescenta "(M em conflito)"). */
  display: string;
};

/** Cartões da conferência de uma nova versão, na ordem em que a tela os mostra. */
export function versionCards(version: VersionSummary): VersionCard[] {
  const conflicts = version.inclusoesEmConflito ?? 0;
  const cards: Array<[VersionView, string, number]> = [
    ["inclusao", "Inclusões", version.inclusoes],
    ["alteracao", "Alterações", version.alteracoes],
    ["bloqueada", "Bloqueadas", version.bloqueadas],
    ["remocao", "Remoções", version.remocoes],
    ["inalterada", "Inalteradas", version.inalteradas],
    ["mantida_cancelada", "Canceladas mantidas", version.mantidasCanceladas],
    ["responsavel", "Troca de responsável", version.responsaveis],
  ];
  return cards.map(([view, label, count]) => ({
    view,
    label,
    count,
    display:
      view === "inclusao" && conflicts > 0 ? `${count} (${conflicts} em conflito)` : `${count}`,
  }));
}

/** Filtro do servidor para uma visão ("" = todas as linhas). */
export function viewFilter(view: VersionView | ""): {
  changeKind?: ImportChangeKind;
  status?: ImportRowStatus;
} {
  if (view === "") return {};
  if (view === "bloqueada") return { changeKind: "alteracao", status: "alteracao_bloqueada" };
  return { changeKind: view };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Frase da confirmação "Aplicar mudanças": quantas ocupações saem, quantas entram, trocas de responsável. */
export function applySentence(
  counts: Pick<ImportRowCounts, "cancelar" | "pendente" | "responsavel">,
): string {
  const swaps =
    counts.responsavel > 0
      ? plural(counts.responsavel, "troca de responsável", "trocas de responsável")
      : null;
  if (counts.cancelar === 0 && counts.pendente === 0) {
    return swaps === null
      ? "Nenhuma ocupação será cancelada ou criada."
      : `Nenhuma ocupação será cancelada ou criada; ${swaps}.`;
  }
  const cancelled =
    counts.cancelar === 1
      ? "Será cancelada 1 ocupação"
      : `Serão canceladas ${counts.cancelar} ocupações`;
  const base = `${cancelled} e criadas ${counts.pendente}`.replace(/criadas 1$/, "criada 1");
  return swaps === null ? `${base}.` : `${base}; ${swaps}.`;
}

/** Grupo de uma alteração: o que havia (antes) e o que passa a valer (depois), por aula + data. */
export type AlterationGroup<T> = {
  title: string;
  date: string | null;
  before: T[];
  after: T[];
  blocked: boolean;
};

type GroupableRow = { rowKey: string; title: string; date: string | null; status: string };

/** Linhas que representam a ocupação anterior: cancelar (`c:`) ou mantida por bloqueio (`b:`, `h:`). */
function isBefore(rowKey: string): boolean {
  return rowKey.startsWith("c:") || rowKey.startsWith("b:") || rowKey.startsWith("h:");
}

/**
 * Pareia as linhas de alteração por (título, data): as de ocupações anteriores ficam em `before`
 * e as novas em `after`. Linhas sem data (não aplicáveis) formam um grupo cada uma. A ordem do
 * primeiro aparecimento é mantida.
 */
export function groupAlterations<T extends GroupableRow>(rows: readonly T[]): AlterationGroup<T>[] {
  const groups = new Map<string, AlterationGroup<T>>();
  for (const row of rows) {
    const key = row.date ? `${row.date}|${row.title}` : `sem-data|${row.rowKey}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { title: row.title, date: row.date || null, before: [], after: [], blocked: false };
      groups.set(key, group);
    }
    (isBefore(row.rowKey) ? group.before : group.after).push(row);
    if (row.status === "alteracao_bloqueada") group.blocked = true;
  }
  return [...groups.values()];
}

export type DiscardState = { visible: boolean; allowed: boolean; reason: string | null };

const DISCARD_PARTIAL_HINT =
  "Este lote já aplicou parte das mudanças; retome a aplicação para concluir em vez de descartar.";

/** Quando o botão "Descartar" aparece e se pode ser usado (espelha a regra do servidor). */
export function discardState(batch: {
  status: ImportBatch["status"];
  summary: { counts: ImportRowCounts };
}): DiscardState {
  if (batch.status === "rascunho" || batch.status === "preparando") {
    return { visible: true, allowed: true, reason: null };
  }
  if (batch.status !== "falhou") return { visible: false, allowed: false, reason: null };
  const { counts } = batch.summary;
  const applied = counts.aplicada + counts.cancelada_versao + counts.responsavel_atualizado;
  return applied > 0
    ? { visible: true, allowed: false, reason: DISCARD_PARTIAL_HINT }
    : { visible: true, allowed: true, reason: null };
}

/** Números finais de uma nova versão aplicada (o texto acompanha toda cor). */
export function resultCards(
  counts: ImportRowCounts,
): Array<{ label: string; count: number; tone: TagTone }> {
  return [
    {
      label: "Ocupações canceladas",
      count: counts.cancelada_versao,
      tone: STATUS_TONE.cancelada_versao,
    },
    { label: "Ocupações criadas", count: counts.aplicada, tone: STATUS_TONE.aplicada },
    {
      label: "Responsáveis trocados",
      count: counts.responsavel_atualizado,
      tone: STATUS_TONE.responsavel_atualizado,
    },
    {
      label: "Alterações bloqueadas",
      count: counts.alteracao_bloqueada,
      tone: STATUS_TONE.alteracao_bloqueada,
    },
    {
      label: "Conflitos",
      count: counts.conflito + counts.conflito_interno,
      tone: STATUS_TONE.conflito,
    },
    { label: "Falhas", count: counts.falha, tone: STATUS_TONE.falha },
  ];
}

/**
 * Casa, dentro de um grupo (aula + data), as ocupações de antes e de depois uma a uma, na ordem
 * recebida (horário, depois chave): a 1ª de antes com a 1ª de depois, e assim por diante. Sobra de
 * um lado fica sem par (cancelamento sem substituta ou inclusão extra).
 */
export function pairBeforeAfter<T>(
  before: readonly T[],
  after: readonly T[],
): Array<{ before: T | null; after: T | null }> {
  const length = Math.max(before.length, after.length);
  return Array.from({ length }, (_, index) => ({
    before: before[index] ?? null,
    after: after[index] ?? null,
  }));
}

/** Motivos pelos quais um horário do arquivo não vira ocupação (emitidos pelo planejador). */
export type NotApplicableReason =
  | "no_room"
  | "multiple_rooms"
  | "room_unmapped"
  | "room_ignored"
  | "term_without_dates"
  | "weeks_unsupported"
  | "never_scheduled"
  | "duplicate_occurrence"
  | "no_dates";

/** Motivos gravados na aplicação (conflitos e falha de gravação). */
type ApplyReason =
  | "conflito_existente"
  | "conflito_concorrente"
  | "conflito_interno"
  | "erro_gravacao"
  | "ja_cancelada"
  | "cancelada_sem_correspondente"
  | "cancelada_alterada"
  | "alteracao_bloqueada";

export type ReasonCode = NotApplicableReason | ApplyReason;

// `Record` completo: um código novo sem rótulo não compila.
const LABELS: Record<ReasonCode, string> = {
  no_room: "Aula sem sala",
  multiple_rooms: "Aula com várias salas",
  room_unmapped: "Sala sem vínculo",
  room_ignored: "Sala ignorada",
  term_without_dates: "Duração sem datas no semestre",
  weeks_unsupported: "Semanas alternadas não suportadas",
  never_scheduled: "Aula sem duração marcada",
  duplicate_occurrence: "Card duplicado da mesma aula",
  no_dates: "Nenhuma data no semestre",
  conflito_existente: "Conflito com ocupação existente",
  conflito_concorrente: "Conflito surgido durante a aplicação",
  conflito_interno: "Conflito com outra aula do arquivo",
  erro_gravacao: "Erro de gravação",
  ja_cancelada: "Já estava cancelada",
  cancelada_sem_correspondente: "Cancelada e fora da nova versão",
  cancelada_alterada: "Cancelada antes; mudou na nova versão",
  alteracao_bloqueada: "Alteração bloqueada por conflito",
};

/** Todos os códigos de motivo que o planejador e a aplicação podem gravar numa linha. */
export const REASON_CODES = Object.keys(LABELS) as readonly ReasonCode[];

export type ReasonView = { label: string; detail: string | null; known: boolean };

const UNKNOWN_LABEL = "Motivo não reconhecido";
const MISSING_LABEL = "Sem motivo informado";

function isKnown(code: string): code is ReasonCode {
  return Object.hasOwn(LABELS, code);
}

/**
 * Texto em pt-BR de um motivo: rótulo curto fixo por código e o detalhe que o servidor gravou
 * (já em pt-BR). Código desconhecido não quebra a tela: aparece com o rótulo genérico.
 */
export function describeReason(code: string | null, detail: string | null): ReasonView {
  if (code === null) return { label: MISSING_LABEL, detail, known: false };
  if (!isKnown(code)) return { label: UNKNOWN_LABEL, detail, known: false };
  return { label: LABELS[code], detail, known: true };
}

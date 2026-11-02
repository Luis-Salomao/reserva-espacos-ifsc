import type { SlotIssue } from "./slots.ts";

export type WarningCode =
  | "section_missing"
  | "invalid_time"
  | "invalid_number"
  | "invalid_mask"
  | "duplicate_id"
  | "unknown_reference"
  | "missing_attribute"
  | "lesson_without_class"
  | "duplicate_card"
  | "section_repeated"
  | "too_many_cards";

export type ImportWarning = {
  code: WarningCode;
  section: string;
  ref?: string;
  detail?: string;
};

const MESSAGES: Record<WarningCode, string> = {
  section_missing: "A seção não existe no arquivo.",
  invalid_time: "Horário inválido; o item foi ignorado.",
  invalid_number: "Número inválido ou ausente.",
  invalid_mask: "Máscara inválida; foi descartada.",
  duplicate_id: "Identificador duplicado; o primeiro foi mantido.",
  unknown_reference: "Referência a um item que não existe.",
  missing_attribute: "Atributo obrigatório ausente; o item foi ignorado.",
  lesson_without_class: "Aula sem turma; confira o cadastro no aSc.",
  duplicate_card: "Card idêntico repetido; só o primeiro foi mantido.",
  section_repeated: "A seção aparece mais de uma vez; só a primeira foi lida.",
  too_many_cards:
    "O arquivo tem cards demais; só os primeiros foram lidos e a prévia está incompleta.",
};

const SLOT_ISSUE_MESSAGES: Record<SlotIssue["code"], string> = {
  missing_period: "Card aponta para um período que não existe; não gera horário.",
  never_scheduled: "Card com máscara de durações ou semanas sem nenhuma marca; nunca é agendado.",
  invalid_period: "Período com número repetido ou fim antes do início; foi ignorado.",
  invalid_days: "Card sem dia marcado ou com máscara de dias inválida; não gera horário.",
  lesson_without_cards: "Aula sem nenhum card; não gera horário.",
  incomplete_block: "Bloco com menos períodos seguidos do que a aula pede; verifique o horário.",
};

export function describeWarningCode(code: WarningCode): string {
  return MESSAGES[code];
}

export function describeSlotIssue(code: SlotIssue["code"]): string {
  return SLOT_ISSUE_MESSAGES[code];
}

export function describeWarning(warning: ImportWarning): string {
  return `${warning.section}: ${MESSAGES[warning.code]}`;
}

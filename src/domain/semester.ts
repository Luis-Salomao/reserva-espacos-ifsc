import type { Period } from "./timetable";

/** Duração (bimestre etc.) do semestre: posição 1..4 no aSc, com início e fim em datas. */
type SemesterTerm = { position: number; start: string; end: string };

/** Bloco de horário do dia (ex.: "Noite 12"): número do aSc, rótulos e hora de início e fim. */
export type SemesterBlock = {
  number: number;
  name: string;
  short: string;
  start: string;
  end: string;
};

export type Semester = {
  id: string;
  name: string;
  /** "YYYY-MM-DD". */
  start: string;
  end: string;
  terms: SemesterTerm[];
  blocks: SemesterBlock[];
};

/** Problema de validação; `field` identifica o campo para a tela (ex.: `term-1-start`, `block-0-end`). */
export type SemesterIssue = { field: string; message: string };

export const MAX_TERM_POSITION = 4;
export const MAX_BLOCKS = 30;
export const MAX_BLOCK_NAME = 40;
export const MAX_BLOCK_SHORT = 10;

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Data de calendário "YYYY-MM-DD" válida (ano de 2000 a 2100, mês e dia existentes, com ano
 * bissexto). Cálculo puro, sem `Date`: nada depende de fuso nem de normalização automática
 * (`new Date("2026-02-30")` viraria março).
 */
export function isValidDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Hora do dia "HH:MM" (00:00 a 23:59). */
export function isValidTime(value: string): boolean {
  const match = TIME.exec(value);
  if (match === null) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function validateTerms(semester: Semester, datesOk: boolean, issues: SemesterIssue[]): void {
  const seen = new Set<number>();
  for (const term of semester.terms) {
    const prefix = `term-${term.position}`;
    if (
      !Number.isInteger(term.position) ||
      term.position < 1 ||
      term.position > MAX_TERM_POSITION
    ) {
      issues.push({
        field: "terms",
        message: `A posição da duração deve ser de 1 a ${MAX_TERM_POSITION}.`,
      });
      continue;
    }
    if (seen.has(term.position)) {
      issues.push({
        field: `${prefix}-start`,
        message: `A duração ${term.position} está repetida.`,
      });
      continue;
    }
    seen.add(term.position);
    const startOk = isValidDate(term.start);
    const endOk = isValidDate(term.end);
    if (!startOk) {
      issues.push({
        field: `${prefix}-start`,
        message: `Início da duração ${term.position} inválido.`,
      });
    }
    if (!endOk) {
      issues.push({ field: `${prefix}-end`, message: `Fim da duração ${term.position} inválido.` });
    }
    if (!startOk || !endOk) continue;
    if (term.end < term.start) {
      issues.push({
        field: `${prefix}-end`,
        message: `O fim da duração ${term.position} não pode ser anterior ao início.`,
      });
    }
    if (datesOk && (term.start < semester.start || term.start > semester.end)) {
      issues.push({
        field: `${prefix}-start`,
        message: `O início da duração ${term.position} deve estar dentro da vigência do semestre.`,
      });
    }
    if (datesOk && (term.end < semester.start || term.end > semester.end)) {
      issues.push({
        field: `${prefix}-end`,
        message: `O fim da duração ${term.position} deve estar dentro da vigência do semestre.`,
      });
    }
  }
}

function validateBlocks(blocks: SemesterBlock[], issues: SemesterIssue[]): void {
  if (blocks.length > MAX_BLOCKS) {
    issues.push({ field: "blocks", message: `Use no máximo ${MAX_BLOCKS} blocos.` });
  }
  const seen = new Set<number>();
  blocks.forEach((block, index) => {
    const prefix = `block-${index}`;
    if (!Number.isInteger(block.number) || block.number < 1) {
      issues.push({
        field: `${prefix}-number`,
        message: "O número do bloco deve ser um inteiro positivo.",
      });
    } else if (seen.has(block.number)) {
      issues.push({
        field: `${prefix}-number`,
        message: `O número de bloco ${block.number} está repetido.`,
      });
    } else {
      seen.add(block.number);
    }
    if (block.name.length < 1 || block.name.length > MAX_BLOCK_NAME) {
      issues.push({
        field: `${prefix}-name`,
        message: `O nome do bloco deve ter de 1 a ${MAX_BLOCK_NAME} caracteres.`,
      });
    }
    if (block.short.length < 1 || block.short.length > MAX_BLOCK_SHORT) {
      issues.push({
        field: `${prefix}-short`,
        message: `A sigla do bloco deve ter de 1 a ${MAX_BLOCK_SHORT} caracteres.`,
      });
    }
    const startOk = isValidTime(block.start);
    const endOk = isValidTime(block.end);
    if (!startOk)
      issues.push({ field: `${prefix}-start`, message: "Hora de início do bloco inválida." });
    if (!endOk) issues.push({ field: `${prefix}-end`, message: "Hora de fim do bloco inválida." });
    if (startOk && endOk && block.end <= block.start) {
      issues.push({
        field: `${prefix}-end`,
        message: "A hora de fim deve ser posterior à de início.",
      });
    }
  });
}

/**
 * Valida datas (fim > início), durações dentro da vigência (com fim >= início; podem se
 * sobrepor) e blocos (número único, fim > início; podem se sobrepor, como "N123" e "N12").
 * Nome do semestre (texto livre) é conferido na camada de aplicação.
 */
export function validateSemesterIssues(semester: Semester): SemesterIssue[] {
  const issues: SemesterIssue[] = [];
  const startOk = isValidDate(semester.start);
  const endOk = isValidDate(semester.end);
  if (!startOk) issues.push({ field: "start", message: "Data de início inválida." });
  if (!endOk) issues.push({ field: "end", message: "Data de fim inválida." });
  const datesOk = startOk && endOk;
  if (datesOk && semester.end <= semester.start) {
    issues.push({ field: "end", message: "A data de fim deve ser posterior à de início." });
  }
  validateTerms(semester, datesOk, issues);
  validateBlocks(semester.blocks, issues);
  return issues;
}

/** Mensagens de validação (lista vazia = válido). */
export function validateSemester(semester: Semester): string[] {
  return validateSemesterIssues(semester).map((issue) => issue.message);
}

/**
 * Blocos a partir dos períodos de uma prévia do XML ("usar blocos do XML"). Só pré-carrega o
 * formulário; nome e sigla longos são cortados para caber nos limites.
 */
export function blocksFromPeriods(periods: readonly Period[]): SemesterBlock[] {
  return periods.map((period) => ({
    number: period.number,
    name: period.name.trim().slice(0, MAX_BLOCK_NAME),
    short: period.short.trim().slice(0, MAX_BLOCK_SHORT),
    start: period.start,
    end: period.end,
  }));
}

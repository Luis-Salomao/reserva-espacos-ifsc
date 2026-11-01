export type WarningCode =
  | "section_missing"
  | "invalid_time"
  | "invalid_number"
  | "invalid_mask"
  | "duplicate_id"
  | "unknown_reference"
  | "missing_attribute";

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
};

export function describeWarning(warning: ImportWarning): string {
  return `${warning.section}: ${MESSAGES[warning.code]}`;
}

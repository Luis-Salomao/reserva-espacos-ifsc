export type ImportRejectionCode =
  | "too_large"
  | "unsupported_encoding"
  | "dtd_forbidden"
  | "malformed"
  | "not_timetable";

export type ImportRejection = { code: ImportRejectionCode; message: string };

const MESSAGES: Record<ImportRejectionCode, string> = {
  too_large: "O arquivo é maior que o limite de 10 MB.",
  unsupported_encoding:
    "A codificação do arquivo não é suportada. Exporte novamente em UTF-8 ou UTF-16.",
  dtd_forbidden: "O arquivo contém declarações DOCTYPE ou ENTITY, que não são permitidas.",
  malformed: "O arquivo não é um XML válido.",
  not_timetable:
    "O arquivo não parece ser uma exportação de horários (raiz diferente de timetable).",
};

export function rejection(code: ImportRejectionCode): ImportRejection {
  return { code, message: MESSAGES[code] };
}

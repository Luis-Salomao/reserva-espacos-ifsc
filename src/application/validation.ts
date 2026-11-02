/** Resultado tipado dos casos de uso: erros esperados não são lançados. */
export type FailureKind = "validation" | "conflict" | "not_found" | "last_admin";

export type Failure = { ok: false; kind: FailureKind; message: string; field?: string };

export type Result<T> = { ok: true; value: T } | Failure;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(kind: FailureKind, message: string, field?: string): Failure {
  return field === undefined ? { ok: false, kind, message } : { ok: false, kind, message, field };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: recusa caracteres de controle de propósito
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Nome livre: aparado, de 1 a `max` caracteres e sem caracteres de controle. */
export function parseText(raw: string, max: number, label: string, field: string): Result<string> {
  const value = raw.trim();
  if (value.length === 0) return fail("validation", `${label} é obrigatório.`, field);
  if (value.length > max) {
    return fail("validation", `${label} deve ter no máximo ${max} caracteres.`, field);
  }
  if (CONTROL_CHARS.test(value)) {
    return fail("validation", `${label} contém caracteres inválidos.`, field);
  }
  return ok(value);
}

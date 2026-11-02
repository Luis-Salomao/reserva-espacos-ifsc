import { isValidEmail, normalizeEmail, type Role } from "#/domain/user.ts";

export type CreateAdminInput = {
  email: string;
  name: string;
  code: string | undefined;
  passwordHash: string;
  target: "local" | "cloudflare";
  id: string;
  now: string;
};

export type CreateAdminRow = {
  email: string;
  name: string;
  code: string | null;
  roles: Role[];
  passwordHash: string;
};

export type CreateAdminPlan =
  | { ok: true; row: CreateAdminRow; command?: string }
  | { ok: false; errors: string[] };

// biome-ignore lint/suspicious/noControlCharactersInRegex: detecta caracteres de controle de propósito
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CODE_PATTERN = /^[\p{L}\p{N}._-]{1,20}$/u;
const HASH_PATTERN = /^(scrypt|pbkdf2)\$[0-9A-Za-z+/=$]+$/;

/** Literal SQL entre aspas simples (aspas internas dobradas). */
export function escapeSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Texto entre aspas duplas para shell POSIX (bash/zsh): escapa \, ", $, crase e !. */
export function shellDoubleQuote(value: string): string {
  return `"${value.replace(/[\\"$`!]/g, "\\$&")}"`;
}

function buildInsert(row: CreateAdminRow, id: string, now: string): string {
  const values = [
    escapeSqlLiteral(id),
    escapeSqlLiteral(row.email),
    escapeSqlLiteral(row.name),
    row.code === null ? "NULL" : escapeSqlLiteral(row.code),
    escapeSqlLiteral(row.roles.join(",")),
    escapeSqlLiteral(row.passwordHash),
    "1",
    escapeSqlLiteral(now),
    escapeSqlLiteral(now),
  ];
  return `INSERT INTO users (id, email, name, code, roles, password_hash, active, created_at, updated_at) VALUES (${values.join(", ")});`;
}

/** Valida os dados e monta a conta admin; para Cloudflare também o comando do wrangler. */
export function planCreateAdmin(input: CreateAdminInput): CreateAdminPlan {
  const errors: string[] = [];
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const code = input.code?.trim();

  if (!isValidEmail(email)) errors.push("Email inválido.");
  if (name === "") errors.push("Nome não pode ser vazio.");
  else if (CONTROL_CHARS.test(name)) errors.push("Nome contém caracteres de controle.");
  else if (name.length > 120) errors.push("Nome muito longo (máximo 120).");
  if (code !== undefined && code !== "" && !CODE_PATTERN.test(code)) {
    errors.push("Sigla inválida (use letras, números, ponto, hífen ou sublinhado; até 20).");
  }
  if (!HASH_PATTERN.test(input.passwordHash)) errors.push("Hash de senha em formato inesperado.");
  if (errors.length > 0) return { ok: false, errors };

  const row: CreateAdminRow = {
    email,
    name,
    code: code === undefined || code === "" ? null : code,
    roles: ["admin"],
    passwordHash: input.passwordHash,
  };
  if (input.target === "local") return { ok: true, row };

  const sql = buildInsert(row, input.id, input.now);
  return {
    ok: true,
    row,
    command: `wrangler d1 execute DB --remote --config wrangler.jsonc --command ${shellDoubleQuote(sql)}`,
  };
}

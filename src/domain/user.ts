const ROLES = ["admin", "horarios", "docente"] as const;

export type Role = (typeof ROLES)[number];

/** Conta local. `code` é a sigla do docente (opcional). Sem dados de senha. */
export type User = {
  id: string;
  email: string;
  name: string;
  code: string | null;
  roles: Role[];
  active: boolean;
};

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Lê papéis de uma lista separada por vírgula; descarta desconhecidos (menor privilégio). */
export function parseRoles(raw: string): Role[] {
  const found = raw
    .split(",")
    .map((part) => part.trim())
    .filter(isRole);
  return [...new Set(found)];
}

export function serializeRoles(roles: readonly Role[]): string {
  return [...new Set(roles)].join(",");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@,'"`$\\]+@[^\s@,'"`$\\]+\.[^\s@,'"`$\\]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

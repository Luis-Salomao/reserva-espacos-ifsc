const DOMAIN = "ifsc.edu.br";
/** Abaixo do limite de 64 da parte local, com folga para o sufixo de colisão. */
const MAX_LOCAL_LENGTH = 60;

/** Minúsculas, sem acentos e só com letras e dígitos ASCII (apóstrofos somem; o resto separa). */
function words(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

/**
 * E-mail presumido de um docente do XML: `primeiro.ultimo@ifsc.edu.br` (uma palavra só vira
 * `palavra@`; nome sem letras vira `docente.ID@`). Se já estiver em `taken` (e-mails normalizados),
 * acrescenta `2`, `3`… à parte local.
 */
export function guessEmail(name: string, fallbackId: string, taken: ReadonlySet<string>): string {
  const parts = words(name);
  const first = parts[0];
  const last = parts.at(-1);
  let local: string;
  if (first === undefined || last === undefined) {
    local = `docente.${words(fallbackId).join("") || "sem.id"}`;
  } else {
    local = parts.length === 1 ? first : `${first}.${last}`;
  }
  local = local.slice(0, MAX_LOCAL_LENGTH).replace(/\.$/, "");
  let email = `${local}@${DOMAIN}`;
  for (let suffix = 2; taken.has(email); suffix += 1) email = `${local}${suffix}@${DOMAIN}`;
  return email;
}

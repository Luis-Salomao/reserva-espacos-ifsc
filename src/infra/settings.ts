/**
 * Configuração versionada e NÃO secreta. Prioridade: variável de ambiente (.env incluído) >
 * este arquivo > padrão do código. Segredos (PASSWORD_PEPPER, RESEND_API_KEY, EMAIL_PAYLOAD_KEY,
 * PUBLIC_ORIGIN) nunca entram aqui.
 */
export const settings = {
  /** Alvo padrão: desenvolvimento local (Bun + SQLite). */
  DEPLOY_TARGET: "local",
  /** Só vale no alvo local fora de produção (NODE_ENV=production exige DATABASE_PATH explícita). */
  DATABASE_PATH: "./data/dev.sqlite",
  TIMEZONE: "America/Sao_Paulo",
  PUBLIC_READ: "true",
  AGENDA_OPENS_AT: "06:00",
  AGENDA_CLOSES_AT: "23:00",
  PASSWORD_HASH: "scrypt",
  PASSWORD_SCRYPT_N: "16384",
  COOKIE_SECURE: "auto",
} as const;

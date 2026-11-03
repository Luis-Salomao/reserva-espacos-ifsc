import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export type AppEnv = {
  DEPLOY_TARGET: "local" | "cloudflare";
  DATABASE_PATH?: string;
  TIMEZONE: string;
  PUBLIC_READ: boolean;
  PASSWORD_HASH: "scrypt" | "pbkdf2";
  PASSWORD_SCRYPT_N: number;
  PASSWORD_PEPPER?: string;
  /** Origem pública (ex.: https://reservas.campus.edu.br), sem caminho; ver README (proxy reverso). */
  PUBLIC_ORIGIN?: string;
  /** Com PUBLIC_ORIGIN definida, é derivada dela: "true" se https, "false" se http. */
  COOKIE_SECURE: "auto" | "true" | "false";
  /** Expediente da agenda ("HH:MM"): janela em que se pode reservar. Padrão 06:00 a 23:00. */
  AGENDA_OPENS_AT: string;
  AGENDA_CLOSES_AT: string;
};

const HOUR_MINUTE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Origem canônica (esquema + host, sem caminho/consulta); `null` se o valor não for assim. */
function parsePublicOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname === "" || url.username !== "" || url.password !== "") return null;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;
  return url.origin;
}

type EnvSource = Record<string, string | undefined>;

/**
 * Valida o ambiente a partir de uma fonte explícita. Função pura (não uma
 * constante de módulo) porque em Cloudflare Workers o env só existe por requisição.
 * Erros listam apenas os nomes das variáveis inválidas, nunca os valores.
 */
export function getEnv(source: EnvSource): AppEnv {
  const parsed = createEnv({
    server: {
      DEPLOY_TARGET: z.enum(["local", "cloudflare"]),
      DATABASE_PATH: z.string().min(1).optional(),
      TIMEZONE: z.string().min(1).default("America/Sao_Paulo"),
      PUBLIC_READ: z.stringbool().default(true),
      PASSWORD_HASH: z.enum(["scrypt", "pbkdf2"]).default("scrypt"),
      PASSWORD_SCRYPT_N: z.coerce
        .number()
        .int()
        .min(1024)
        .max(65536)
        .refine((n) => (n & (n - 1)) === 0, "deve ser potência de 2")
        .default(16384),
      PASSWORD_PEPPER: z.string().min(1).optional(),
      PUBLIC_ORIGIN: z
        .string()
        .min(1)
        .refine((value) => parsePublicOrigin(value) !== null, "origem inválida")
        .optional(),
      COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
      AGENDA_OPENS_AT: z.string().regex(HOUR_MINUTE, "use HH:MM").default("06:00"),
      AGENDA_CLOSES_AT: z.string().regex(HOUR_MINUTE, "use HH:MM").default("23:00"),
    },
    runtimeEnv: source,
    isServer: true,
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      const names = issues.flatMap((issue) => (issue.path?.length ? [String(issue.path[0])] : []));
      throw new Error(`Variáveis de ambiente inválidas: ${[...new Set(names)].join(", ")}`);
    },
  });

  if (parsed.DEPLOY_TARGET === "local" && parsed.DATABASE_PATH === undefined) {
    throw new Error(
      "Variáveis de ambiente inválidas: DATABASE_PATH (obrigatória quando DEPLOY_TARGET=local)",
    );
  }

  if (parsed.AGENDA_OPENS_AT >= parsed.AGENDA_CLOSES_AT) {
    throw new Error(
      "Variáveis de ambiente inválidas: AGENDA_OPENS_AT, AGENDA_CLOSES_AT (a abertura deve ser antes do fechamento)",
    );
  }

  const publicOrigin =
    parsed.PUBLIC_ORIGIN === undefined
      ? undefined
      : (parsePublicOrigin(parsed.PUBLIC_ORIGIN) ?? undefined);
  // Com origem pública, o Secure do cookie segue o esquema dela (o servidor só vê HTTP interno).
  const cookieSecure =
    publicOrigin === undefined
      ? parsed.COOKIE_SECURE
      : publicOrigin.startsWith("https:")
        ? "true"
        : "false";

  return {
    DEPLOY_TARGET: parsed.DEPLOY_TARGET,
    TIMEZONE: parsed.TIMEZONE,
    PUBLIC_READ: parsed.PUBLIC_READ,
    PASSWORD_HASH: parsed.PASSWORD_HASH,
    PASSWORD_SCRYPT_N: parsed.PASSWORD_SCRYPT_N,
    COOKIE_SECURE: cookieSecure,
    AGENDA_OPENS_AT: parsed.AGENDA_OPENS_AT,
    AGENDA_CLOSES_AT: parsed.AGENDA_CLOSES_AT,
    ...(publicOrigin === undefined ? {} : { PUBLIC_ORIGIN: publicOrigin }),
    ...(parsed.PASSWORD_PEPPER === undefined ? {} : { PASSWORD_PEPPER: parsed.PASSWORD_PEPPER }),
    ...(parsed.DATABASE_PATH === undefined ? {} : { DATABASE_PATH: parsed.DATABASE_PATH }),
  };
}

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
};

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

  return {
    DEPLOY_TARGET: parsed.DEPLOY_TARGET,
    TIMEZONE: parsed.TIMEZONE,
    PUBLIC_READ: parsed.PUBLIC_READ,
    PASSWORD_HASH: parsed.PASSWORD_HASH,
    PASSWORD_SCRYPT_N: parsed.PASSWORD_SCRYPT_N,
    ...(parsed.PASSWORD_PEPPER === undefined ? {} : { PASSWORD_PEPPER: parsed.PASSWORD_PEPPER }),
    ...(parsed.DATABASE_PATH === undefined ? {} : { DATABASE_PATH: parsed.DATABASE_PATH }),
  };
}

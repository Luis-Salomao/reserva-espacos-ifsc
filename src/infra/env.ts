import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export type AppEnv = {
  DEPLOY_TARGET: "local" | "cloudflare";
  DATABASE_PATH?: string;
  TIMEZONE: string;
  PUBLIC_READ: boolean;
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
    ...(parsed.DATABASE_PATH === undefined ? {} : { DATABASE_PATH: parsed.DATABASE_PATH }),
  };
}

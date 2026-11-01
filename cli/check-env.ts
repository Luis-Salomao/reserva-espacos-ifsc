#!/usr/bin/env bun
import { getEnv } from "#/infra/env";

// Falha cedo (antes de subir o servidor local) se a configuração for inválida.
try {
  getEnv({ ...process.env, DEPLOY_TARGET: process.env.DEPLOY_TARGET || "local" });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Variáveis de ambiente inválidas.");
  console.error("Defina as variáveis no .env (veja .env.example).");
  process.exit(1);
}

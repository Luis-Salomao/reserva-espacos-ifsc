import { drainEmailOutbox } from "#/server/email-context";

/** Drena uma rodada, sem daemon. Segredos vêm somente do ambiente. */
export async function runEmailDrain(argv: string[]): Promise<number> {
  if (argv.some((arg) => arg !== "--once") || argv.length > 1) {
    console.error("Uso: email:drain [--once]");
    return 1;
  }
  try {
    const result = await drainEmailOutbox();
    console.log(`E-mails enviados: ${result.sent}; tentativas sem sucesso: ${result.failed}.`);
    return result.failed > 0 ? 1 : 0;
  } catch {
    console.error("Não foi possível processar a fila de e-mails. Verifique a configuração.");
    return 1;
  }
}

if (import.meta.main) process.exitCode = await runEmailDrain(process.argv.slice(2));

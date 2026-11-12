import { getEmailConfig } from "#/infra/email/config";

/** Diagnóstico de configuração, sem banco ou rede. Nunca imprime valores de segredos. */
export function emailConfigurationReport(source: Record<string, string | undefined>) {
  try {
    const config = getEmailConfig(source);
    if (config === null)
      return {
        code: 0,
        enabled: false,
        lines: [
          "E-mail desabilitado nesta instalação.",
          "Para ativar, configure EMAIL_PROVIDER=resend, EMAIL_FROM, PUBLIC_ORIGIN, RESEND_API_KEY e EMAIL_PAYLOAD_KEY.",
        ],
      };
    return {
      code: 0,
      enabled: true,
      lines: [
        "Configuração de e-mail válida. Provedor: Resend.",
        `Remetente: ${config.from}`,
        `Origem usada nos links: ${config.publicOrigin}`,
        source.DEPLOY_TARGET === "cloudflare"
          ? "No Worker, configure os secrets em produção e habilite o cron para processar a outbox. .dev.vars não configura produção."
          : "Agende bun run cli email:drain --once a cada minuto, com o mesmo banco e ambiente do servidor.",
        "Este diagnóstico não envia e-mail nem verifica domínio, credenciais no provedor ou entrega. Confira o domínio no Resend.",
      ],
    };
  } catch (error) {
    return {
      code: 1,
      enabled: false,
      lines: [error instanceof Error ? error.message : "Configuração de e-mail inválida."],
    };
  }
}

export function runEmailCheck(argv: string[]): number {
  if (argv.length > 0) {
    console.error("Uso: email:check");
    return 1;
  }
  const report = emailConfigurationReport(process.env);
  for (const line of report.lines) console.log(line);
  return report.code;
}

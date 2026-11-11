import type { EmailSender } from "#/application/email-ports";

type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** POST /emails; a mesma mensagem mantém sua chave durante todas as tentativas. */
export function createResendSender(
  config: { apiKey: string; from: string },
  transport: Transport = fetch,
  timeoutMs = 10_000,
): EmailSender {
  return {
    async send(message, idempotencyKey) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await transport("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        await response.body?.cancel();
      } catch {
        throw new Error("Falha no envio de e-mail.");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

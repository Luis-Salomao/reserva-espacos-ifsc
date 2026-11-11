import { expect, mock, test } from "bun:test";
import { getEmailConfig } from "./config";
import { createEmailPayloadCodec } from "./payload-codec";
import { createResendSender } from "./resend";

const key = btoa("a".repeat(32)).replace(/=/g, "");
const source = {
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "secret",
  EMAIL_FROM: "IFSC <reservas@example.com>",
  PUBLIC_ORIGIN: "https://reservas.example.com",
  EMAIL_PAYLOAD_KEY: key,
};
const message = { to: "someone@example.com", subject: "Recuperação", text: "token-secret" };

test("config desabilitada dispensa segredos e rejeita origens e chaves inválidas", () => {
  expect(getEmailConfig({})).toBeNull();
  expect(getEmailConfig(source)).toMatchObject({
    provider: "resend",
    publicOrigin: source.PUBLIC_ORIGIN,
  });
  for (const origin of [
    "http://example.com",
    "https://name:password@example.com",
    "https://example.com/path",
    "javascript:secret",
  ])
    expect(() => getEmailConfig({ ...source, PUBLIC_ORIGIN: origin })).toThrow("PUBLIC_ORIGIN");
  expect(getEmailConfig({ ...source, PUBLIC_ORIGIN: "http://localhost:3000" })).not.toBeNull();
  expect(() => getEmailConfig({ ...source, EMAIL_PAYLOAD_KEY: "secret-invalid-key" })).toThrow(
    "EMAIL_PAYLOAD_KEY",
  );
  expect(() => getEmailConfig({ ...source, EMAIL_PROVIDER: "invalid-secret" })).toThrow(
    "EMAIL_PROVIDER",
  );
});

test("AES-GCM usa nonce aleatório, autentica payload e não guarda token legível", async () => {
  const codec = createEmailPayloadCodec(key);
  const a = await codec.seal(message);
  expect(a).not.toBe(await codec.seal(message));
  expect(a).not.toContain(message.text);
  expect(await codec.open(a)).toEqual(message);
  const parts = a.split(".");
  parts[2] = `${parts[2]?.slice(0, 3)}AAAA${parts[2]?.slice(7)}`;
  await expect(codec.open(parts.join("."))).rejects.toThrow("Payload de e-mail inválido.");
  await expect(
    createEmailPayloadCodec(btoa("x".repeat(32)).replace(/=/g, "")).open(a),
  ).rejects.toThrow("Payload de e-mail inválido.");
});

test("Resend usa chave estável e timeout sem propagar resposta sensível", async () => {
  const requests: RequestInit[] = [];
  const transport = mock(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init) requests.push(init);
    return new Response("{}", { status: 200 });
  });
  await createResendSender({ apiKey: "secret", from: source.EMAIL_FROM }, transport).send(
    message,
    "outbox-1",
  );
  expect(transport.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
  expect(new Headers(requests[0]?.headers).get("Idempotency-Key")).toBe("outbox-1");
  expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(String(requests[0]?.body))).toEqual({
    ...message,
    to: [message.to],
    from: source.EMAIL_FROM,
  });
  const failing = createResendSender(
    { apiKey: "secret", from: source.EMAIL_FROM },
    async () => new Response("secret-token", { status: 429 }),
  );
  await expect(failing.send(message, "outbox-1")).rejects.toThrow("Falha no envio de e-mail.");
});

test("Resend aborta requisição pendente no timeout", async () => {
  let aborted = false;
  const sender = createResendSender(
    { apiKey: "secret", from: source.EMAIL_FROM },
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("sensitive"));
        });
      }),
    5,
  );
  await expect(sender.send(message, "stable")).rejects.toThrow("Falha no envio de e-mail.");
  expect(aborted).toBe(true);
});

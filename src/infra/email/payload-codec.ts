import type { EmailMessage, EmailPayloadCodec } from "#/application/email-ports";

const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));

/** Envelope v1: nonce de 96 bits + AES-256-GCM com tag de autenticação. */
export function createEmailPayloadCodec(payloadKey: string): EmailPayloadCodec {
  const key = crypto.subtle.importKey("raw", decode(payloadKey), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return {
    async seal(message) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key, bytes);
      return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
    },
    async open(payload) {
      try {
        const [version, nonce, ciphertext, extra] = payload.split(".");
        if (version !== "v1" || !nonce || !ciphertext || extra !== undefined) throw new Error();
        const iv = decode(nonce);
        if (iv.length !== 12) throw new Error();
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          await key,
          decode(ciphertext),
        );
        const value: unknown = JSON.parse(new TextDecoder().decode(decrypted));
        if (
          typeof value !== "object" ||
          value === null ||
          !("to" in value) ||
          !("subject" in value) ||
          !("text" in value) ||
          typeof value.to !== "string" ||
          typeof value.subject !== "string" ||
          typeof value.text !== "string"
        )
          throw new Error();
        return value as EmailMessage;
      } catch {
        throw new Error("Payload de e-mail inválido.");
      }
    },
  };
}

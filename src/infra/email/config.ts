export type EmailConfig = {
  provider: "resend";
  apiKey: string;
  from: string;
  publicOrigin: string;
  payloadKey: string;
};

/** Valida apenas nomes de configuração; nunca inclui valores sensíveis na mensagem. */
export function getEmailConfig(source: Record<string, string | undefined>): EmailConfig | null {
  const provider = source.EMAIL_PROVIDER ?? "disabled";
  if (provider === "disabled") return null;
  if (provider !== "resend") throw new Error("Configuração inválida: EMAIL_PROVIDER");
  const required = (name: string) => {
    const value = source[name]?.trim();
    if (!value || /[\r\n]/.test(value)) throw new Error(`Configuração inválida: ${name}`);
    return value;
  };
  const apiKey = required("RESEND_API_KEY");
  const from = required("EMAIL_FROM");
  if (
    !/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(from) &&
    !/^[^<>]+<[^<>\s]+@[^<>\s]+\.[^<>\s]+>$/.test(from)
  )
    throw new Error("Configuração inválida: EMAIL_FROM");
  const linkOriginName = source.PUBLIC_LINK_ORIGIN?.trim() ? "PUBLIC_LINK_ORIGIN" : "PUBLIC_ORIGIN";
  const publicOrigin = required(linkOriginName);
  try {
    const url = new URL(publicOrigin);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("origin");
  } catch {
    throw new Error(`Configuração inválida: ${linkOriginName}`);
  }
  const payloadKey = required("EMAIL_PAYLOAD_KEY");
  if (!/^[A-Za-z0-9_-]{43}$/.test(payloadKey))
    throw new Error("Configuração inválida: EMAIL_PAYLOAD_KEY");
  const bytes = atob(payloadKey.replace(/-/g, "+").replace(/_/g, "/"));
  if (
    bytes.length !== 32 ||
    btoa(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") !== payloadKey
  )
    throw new Error("Configuração inválida: EMAIL_PAYLOAD_KEY");
  return { provider, apiKey, from, publicOrigin: new URL(publicOrigin).origin, payloadKey };
}

export type LengthCheck = { ok: true } | { ok: false; status: 411 | 413; message: string };

export const TOO_LARGE_MESSAGE = "O arquivo é maior que o limite de 10 MB.";

/**
 * Decide, só pelos cabeçalhos, se o envio pode ser lido. Exige `Content-Length` válido e dentro do
 * limite. Isso evita começar a ler corpos declaradamente grandes; o limite real durante a leitura
 * é garantido por `readBodyWithLimit`.
 */
export function checkContentLength(headers: Headers, limit: number): LengthCheck {
  const raw = headers.get("content-length");
  if (raw === null || !/^\d+$/.test(raw)) {
    return { ok: false, status: 411, message: "Não foi possível determinar o tamanho do arquivo." };
  }
  if (Number(raw) > limit) return { ok: false, status: 413, message: TOO_LARGE_MESSAGE };
  return { ok: true };
}

/**
 * Lê o corpo em pedaços contando bytes e cancela o fluxo ao passar de `limit`
 * (devolve `null`). Nunca acumula mais que `limit` + um pedaço.
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | null> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();

/** Nonce de CSP: 16 bytes aleatórios em base64, novo a cada requisição. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Executa `fn` com o nonce disponível (inclusive após `await`) para quem renderiza o HTML. */
export function runWithNonce<T>(nonce: string, fn: () => T): T {
  return storage.run(nonce, fn);
}

/** Nonce da requisição em curso, ou `undefined` fora de uma. */
export function currentNonce(): string | undefined {
  return storage.getStore();
}

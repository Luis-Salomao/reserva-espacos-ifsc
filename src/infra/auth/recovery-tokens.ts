import { toBase64Url } from "#/application/auth";
import type { RecoveryTokens } from "#/application/password-recovery-ports";

export const recoveryTokens: RecoveryTokens = {
  create() {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  },
  async hash(value) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  },
};

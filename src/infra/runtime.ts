import type { Clock, RandomSource } from "#/application/ports";

/** Relógio real. */
export const systemClock: Clock = { now: () => new Date() };

/** Fonte aleatória criptográfica (Web Crypto). Nunca usa Math.random. */
export const cryptoRandom: RandomSource = {
  bytes(length) {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  },
};

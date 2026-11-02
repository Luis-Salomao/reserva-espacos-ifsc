export type StepOutput = { done: boolean; remaining: number };

type StepFailure = { message: string; conflict: boolean };

export type StepResponse<T extends StepOutput> =
  | { ok: true; data: T }
  | { ok: false; status?: number; message: string };

export type RunOutcome<T extends StepOutput> =
  | { ok: true; last: T; steps: number }
  | { ok: false; failure: StepFailure; last: T | null; steps: number };

const STALLED =
  "O processo parou de avançar e foi interrompido. Verifique o resultado e tente de novo.";
const TOO_MANY = "O processo passou do número máximo de passos e foi interrompido.";

/**
 * Chama `step` até `done`. Nunca roda para sempre: para após `maxStalls` passos seguidos sem
 * reduzir `remaining` e após `maxSteps` passos no total. Erro de um passo encerra e devolve a
 * mensagem (`conflict` marca falha de comparar-e-trocar, que o usuário pode tentar de novo).
 */
export async function runSteps<T extends StepOutput>(
  step: () => Promise<StepResponse<T>>,
  options: { maxSteps: number; maxStalls: number; onProgress?: (output: T) => void },
): Promise<RunOutcome<T>> {
  let last: T | null = null;
  let best = Number.POSITIVE_INFINITY;
  let stalls = 0;
  for (let steps = 1; steps <= options.maxSteps; steps++) {
    const response = await step();
    if (!response.ok) {
      return {
        ok: false,
        failure: { message: response.message, conflict: response.status === 409 },
        last,
        steps,
      };
    }
    last = response.data;
    options.onProgress?.(last);
    if (last.done) return { ok: true, last, steps };
    if (last.remaining < best) {
      best = last.remaining;
      stalls = 0;
    } else {
      stalls++;
      if (stalls >= options.maxStalls) {
        return { ok: false, failure: { message: STALLED, conflict: false }, last, steps };
      }
    }
  }
  return {
    ok: false,
    failure: { message: TOO_MANY, conflict: false },
    last,
    steps: options.maxSteps,
  };
}

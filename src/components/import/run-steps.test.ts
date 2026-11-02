import { describe, expect, test } from "bun:test";
import { runSteps, type StepResponse } from "./run-steps";

type Out = { done: boolean; remaining: number };

function script(responses: Array<StepResponse<Out>>) {
  let index = 0;
  const calls = { count: 0 };
  const step = async (): Promise<StepResponse<Out>> => {
    calls.count++;
    const response = responses[Math.min(index, responses.length - 1)];
    index++;
    if (response === undefined) throw new Error("sem resposta");
    return response;
  };
  return { step, calls };
}

const out = (remaining: number, done = false): StepResponse<Out> => ({
  ok: true,
  data: { done, remaining },
});

describe("runSteps", () => {
  test("repete até concluir e informa o progresso de cada passo", async () => {
    const { step } = script([out(100), out(40), out(0, true)]);
    const seen: number[] = [];
    const result = await runSteps(step, {
      maxSteps: 10,
      maxStalls: 3,
      onProgress: (output) => seen.push(output.remaining),
    });
    expect(result).toMatchObject({ ok: true, steps: 3 });
    expect(seen).toEqual([100, 40, 0]);
  });

  test("para depois de N passos sem avançar, em vez de repetir para sempre", async () => {
    const { step, calls } = script([out(50), out(50)]);
    const result = await runSteps(step, { maxSteps: 100, maxStalls: 3 });
    expect(result.ok).toBe(false);
    expect(calls.count).toBe(4);
    if (!result.ok) expect(result.failure.message).toContain("parou de avançar");
  });

  test("um passo que avança zera a contagem de parados", async () => {
    const { step } = script([out(50), out(50), out(40), out(40), out(0, true)]);
    const result = await runSteps(step, { maxSteps: 10, maxStalls: 2 });
    expect(result.ok).toBe(true);
  });

  test("respeita o máximo de passos", async () => {
    let remaining = 1000;
    const result = await runSteps(
      async () => {
        remaining -= 1;
        return { ok: true, data: { done: false, remaining } } as StepResponse<Out>;
      },
      { maxSteps: 5, maxStalls: 99 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.steps).toBe(5);
      expect(result.failure.message).toContain("máximo de passos");
    }
  });

  test("erro do servidor encerra; 409 é marcado como conflito (tentar de novo)", async () => {
    const conflict = await runSteps(
      script([out(10), { ok: false, status: 409, message: "O lote foi alterado." }]).step,
      { maxSteps: 5, maxStalls: 3 },
    );
    expect(conflict).toMatchObject({
      ok: false,
      failure: { message: "O lote foi alterado.", conflict: true },
      last: { remaining: 10 },
    });
    const other = await runSteps(script([{ ok: false, status: 400, message: "Ruim." }]).step, {
      maxSteps: 5,
      maxStalls: 3,
    });
    expect(other).toMatchObject({ ok: false, failure: { conflict: false }, last: null });
  });
});

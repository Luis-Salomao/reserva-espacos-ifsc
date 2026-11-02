import type { SpaceRepository } from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import type { Space } from "#/domain/space";

const MAX_NAME_LENGTH = 80;
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 2000;

/** Capacidade: `null` ou vazio = não informada; número inteiro de 1 a 2000. */
type CapacityInput = number | string | null;

export type SpaceInput = { name: string; capacity: CapacityInput };

function parseCapacity(raw: CapacityInput): Result<number | null> {
  if (raw === null) return ok(null);
  let value: number;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return ok(null);
    value = /^\d{1,6}$/.test(text) ? Number(text) : Number.NaN;
  } else {
    value = raw;
  }
  return Number.isInteger(value) && value >= MIN_CAPACITY && value <= MAX_CAPACITY
    ? ok(value)
    : fail(
        "validation",
        `A capacidade deve ser um número inteiro de ${MIN_CAPACITY} a ${MAX_CAPACITY}.`,
        "capacity",
      );
}

const DUPLICATE = "Já existe um espaço com este nome.";

export function createSpacesService(deps: { spaces: SpaceRepository }) {
  const { spaces } = deps;

  async function nameTaken(name: string, ownId: string | null): Promise<boolean> {
    const lower = name.toLocaleLowerCase("pt-BR");
    return (await spaces.list()).some(
      (space) => space.id !== ownId && space.name.toLocaleLowerCase("pt-BR") === lower,
    );
  }

  function parse(input: SpaceInput): Result<{ name: string; capacity: number | null }> {
    const name = parseText(input.name, MAX_NAME_LENGTH, "O nome", "name");
    if (!name.ok) return name;
    const capacity = parseCapacity(input.capacity);
    if (!capacity.ok) return capacity;
    return ok({ name: name.value, capacity: capacity.value });
  }

  return {
    list(): Promise<Space[]> {
      return spaces.list();
    },

    async create(input: SpaceInput): Promise<Result<Space>> {
      const parsed = parse(input);
      if (!parsed.ok) return parsed;
      if (await nameTaken(parsed.value.name, null)) return fail("conflict", DUPLICATE, "name");
      try {
        return ok(await spaces.create(parsed.value));
      } catch (error) {
        // Corrida entre a checagem e a gravação: a restrição de unicidade do banco decide.
        if (await nameTaken(parsed.value.name, null)) return fail("conflict", DUPLICATE, "name");
        throw error;
      }
    },

    async update(id: string, input: SpaceInput): Promise<Result<Space>> {
      const parsed = parse(input);
      if (!parsed.ok) return parsed;
      if (await nameTaken(parsed.value.name, id)) return fail("conflict", DUPLICATE, "name");
      try {
        const updated = await spaces.update(id, parsed.value);
        return updated === null ? fail("not_found", "Espaço não encontrado.") : ok(updated);
      } catch (error) {
        if (await nameTaken(parsed.value.name, id)) return fail("conflict", DUPLICATE, "name");
        throw error;
      }
    },
  };
}

export type SpacesService = ReturnType<typeof createSpacesService>;

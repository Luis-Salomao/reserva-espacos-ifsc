import type { EquipmentWrite, SpaceRepository, SpaceWrite } from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import {
  EQUIPMENT,
  type EquipmentKind,
  isEquipmentKind,
  type SpaceEquipment,
} from "#/domain/equipment";
import type { Space } from "#/domain/space";

const MAX_NAME_LENGTH = 80;
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 2000;
const MAX_COUNT = 999;
const MAX_NOTES_LENGTH = 500;

/** Capacidade: `null` ou vazio = não informada; número inteiro de 1 a 2000. */
type CapacityInput = number | string | null;

/**
 * Equipamentos vindos do formulário: tipo → valor. Vazio ou nulo = não informado; presença usa
 * 1 (tem) e 0 (não tem); contagem aceita inteiro de 0 a 999.
 */
type EquipmentInput = { items?: Record<string, number | string | null>; notes?: string | null };

/**
 * Na edição, `items` e `notes` são independentes: o que vier substitui o gravado e o que faltar
 * fica como está (sem `equipment`, os dois ficam).
 */
export type SpaceInput = { name: string; capacity: CapacityInput; equipment?: EquipmentInput };

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

const CATALOG = new Map(EQUIPMENT.map((item) => [item.kind, item]));

function parseItem(kind: EquipmentKind, raw: number | string | null): Result<number | undefined> {
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) return ok(undefined);
  const item = CATALOG.get(kind);
  if (item?.measure === "presence") {
    return raw === 0 || raw === 1
      ? ok(raw)
      : fail("validation", "Escolha sim, não ou não informado.", kind);
  }
  const value =
    typeof raw === "string"
      ? /^\d{1,4}$/.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN
      : raw;
  return Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? ok(value)
    : fail(
        "validation",
        `A quantidade de ${item?.label.toLocaleLowerCase("pt-BR")} deve ser um número inteiro de 0 a ${MAX_COUNT}.`,
        kind,
      );
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: recusa caracteres de controle de propósito
const NOTES_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

/** Observações: aparadas, até 500 caracteres; quebra de linha e tabulação valem; vazio = `null`. */
function parseNotes(raw: string | null): Result<string | null> {
  const value = raw?.trim() ?? "";
  if (value === "") return ok(null);
  if (value.length > MAX_NOTES_LENGTH) {
    return fail(
      "validation",
      `As observações devem ter no máximo ${MAX_NOTES_LENGTH} caracteres.`,
      "notes",
    );
  }
  if (NOTES_CONTROL_CHARS.test(value)) {
    return fail("validation", "As observações contêm caracteres inválidos.", "notes");
  }
  return ok(value);
}

function parseItems(input: NonNullable<EquipmentInput["items"]>): Result<SpaceEquipment["items"]> {
  const items: SpaceEquipment["items"] = {};
  for (const [kind, raw] of Object.entries(input)) {
    if (!isEquipmentKind(kind)) return fail("validation", "Tipo de equipamento desconhecido.");
    const parsed = parseItem(kind, raw);
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined) items[kind] = parsed.value;
  }
  return ok(items);
}

function parseEquipment(input: EquipmentInput): Result<EquipmentWrite> {
  const equipment: EquipmentWrite = {};
  if (input.items !== undefined) {
    const items = parseItems(input.items);
    if (!items.ok) return items;
    equipment.items = items.value;
  }
  if (input.notes !== undefined) {
    const notes = parseNotes(input.notes);
    if (!notes.ok) return notes;
    equipment.notes = notes.value;
  }
  return ok(equipment);
}

const DUPLICATE = "Já existe um espaço com este nome.";
const NOT_FOUND = "Espaço não encontrado.";
const IN_USE = "Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído.";

export function createSpacesService(deps: { spaces: SpaceRepository }) {
  const { spaces } = deps;

  async function nameTaken(name: string, ownId: string | null): Promise<boolean> {
    const lower = name.toLocaleLowerCase("pt-BR");
    return (await spaces.list()).some(
      (space) => space.id !== ownId && space.name.toLocaleLowerCase("pt-BR") === lower,
    );
  }

  function parse(input: SpaceInput): Result<SpaceWrite> {
    const name = parseText(input.name, MAX_NAME_LENGTH, "O nome", "name");
    if (!name.ok) return name;
    const capacity = parseCapacity(input.capacity);
    if (!capacity.ok) return capacity;
    if (input.equipment === undefined) return ok({ name: name.value, capacity: capacity.value });
    const equipment = parseEquipment(input.equipment);
    if (!equipment.ok) return equipment;
    return ok({ name: name.value, capacity: capacity.value, equipment: equipment.value });
  }

  return {
    list(): Promise<Space[]> {
      return spaces.list();
    },

    /** Espaços com equipamentos e observações (administração). */
    listWithEquipment(): Promise<Space[]> {
      return spaces.listWithEquipment();
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
        return updated === null ? fail("not_found", NOT_FOUND) : ok(updated);
      } catch (error) {
        if (await nameTaken(parsed.value.name, id)) return fail("conflict", DUPLICATE, "name");
        throw error;
      }
    },

    /** Só exclui espaço sem ocupações (mesmo canceladas), vínculo de sala ou linha de importação. */
    async remove(id: string): Promise<Result<null>> {
      const outcome = await spaces.remove(id);
      if (outcome === "in_use") return fail("conflict", IN_USE);
      if (outcome === "not_found") return fail("not_found", NOT_FOUND);
      return ok(null);
    },
  };
}

export type SpacesService = ReturnType<typeof createSpacesService>;

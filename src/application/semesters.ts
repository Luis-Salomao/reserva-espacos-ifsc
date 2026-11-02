import type { SemesterRepository } from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import {
  MAX_BLOCK_NAME,
  MAX_BLOCK_SHORT,
  type Semester,
  validateSemesterIssues,
} from "#/domain/semester";

const MAX_NAME_LENGTH = 80;
const DUPLICATE = "Já existe um semestre com este nome.";

export type SemesterInput = {
  name: string;
  start: string;
  end: string;
  /** Posições 1..4; as com início e fim em branco são ignoradas. */
  terms: Array<{ position: number; start: string; end: string }>;
  blocks: Array<{
    number: number | string;
    name: string;
    short: string;
    start: string;
    end: string;
  }>;
};

type Data = Omit<Semester, "id">;

function parseNumber(raw: number | string): number {
  if (typeof raw === "number") return raw;
  const text = raw.trim();
  return /^\d{1,6}$/.test(text) ? Number(text) : Number.NaN;
}

function parseTerms(input: SemesterInput["terms"]): Result<Data["terms"]> {
  const terms: Data["terms"] = [];
  for (const term of input) {
    const start = term.start.trim();
    const end = term.end.trim();
    if (start === "" && end === "") continue;
    if (start === "") {
      return fail(
        "validation",
        `Informe o início da duração ${term.position}.`,
        `term-${term.position}-start`,
      );
    }
    if (end === "") {
      return fail(
        "validation",
        `Informe o fim da duração ${term.position}.`,
        `term-${term.position}-end`,
      );
    }
    terms.push({ position: term.position, start, end });
  }
  return ok(terms);
}

function parseBlocks(input: SemesterInput["blocks"]): Result<Data["blocks"]> {
  const blocks: Data["blocks"] = [];
  for (const [index, block] of input.entries()) {
    const name = parseText(block.name, MAX_BLOCK_NAME, "O nome do bloco", `block-${index}-name`);
    if (!name.ok) return name;
    const short = parseText(
      block.short,
      MAX_BLOCK_SHORT,
      "A sigla do bloco",
      `block-${index}-short`,
    );
    if (!short.ok) return short;
    blocks.push({
      number: parseNumber(block.number),
      name: name.value,
      short: short.value,
      start: block.start.trim(),
      end: block.end.trim(),
    });
  }
  return ok(blocks);
}

/** Normaliza a entrada (aparar, converter números, ignorar durações em branco) e valida. */
function parse(input: SemesterInput): Result<Data> {
  const name = parseText(input.name, MAX_NAME_LENGTH, "O nome", "name");
  if (!name.ok) return name;
  const terms = parseTerms(input.terms);
  if (!terms.ok) return terms;
  const blocks = parseBlocks(input.blocks);
  if (!blocks.ok) return blocks;

  const data: Data = {
    name: name.value,
    start: input.start.trim(),
    end: input.end.trim(),
    terms: terms.value,
    blocks: blocks.value,
  };
  const [issue] = validateSemesterIssues({ id: "", ...data });
  if (issue !== undefined) return fail("validation", issue.message, issue.field);
  return ok({
    ...data,
    terms: [...data.terms].sort((a, b) => a.position - b.position),
    blocks: [...data.blocks].sort((a, b) => a.number - b.number),
  });
}

export function createSemestersService(deps: { semesters: SemesterRepository }) {
  const { semesters } = deps;

  async function nameTaken(name: string, ownId: string | null): Promise<boolean> {
    const lower = name.toLocaleLowerCase("pt-BR");
    return (await semesters.list()).some(
      (semester) => semester.id !== ownId && semester.name.toLocaleLowerCase("pt-BR") === lower,
    );
  }

  return {
    list(): Promise<Semester[]> {
      return semesters.list();
    },

    get(id: string): Promise<Semester | null> {
      return semesters.findById(id);
    },

    async create(input: SemesterInput): Promise<Result<Semester>> {
      const parsed = parse(input);
      if (!parsed.ok) return parsed;
      if (await nameTaken(parsed.value.name, null)) return fail("conflict", DUPLICATE, "name");
      try {
        return ok(await semesters.create(parsed.value));
      } catch (error) {
        // Corrida entre a checagem e a gravação: a restrição de unicidade do banco decide.
        if (await nameTaken(parsed.value.name, null)) return fail("conflict", DUPLICATE, "name");
        throw error;
      }
    },

    async update(id: string, input: SemesterInput): Promise<Result<Semester>> {
      const parsed = parse(input);
      if (!parsed.ok) return parsed;
      if (await nameTaken(parsed.value.name, id)) return fail("conflict", DUPLICATE, "name");
      try {
        const updated = await semesters.replace(id, parsed.value);
        return updated === null ? fail("not_found", "Semestre não encontrado.") : ok(updated);
      } catch (error) {
        if (await nameTaken(parsed.value.name, id)) return fail("conflict", DUPLICATE, "name");
        throw error;
      }
    },
  };
}

export type SemestersService = ReturnType<typeof createSemestersService>;

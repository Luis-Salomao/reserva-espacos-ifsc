import { describe, expect, test } from "bun:test";
import type { SemesterRepository } from "#/application/ports";
import { createSemestersService, type SemesterInput } from "#/application/semesters";
import type { Semester } from "#/domain/semester";

type FakeRepo = SemesterRepository & { rows: Semester[] };

function fakeRepo(options: { failOnce?: boolean } = {}): FakeRepo {
  const rows: Semester[] = [];
  let failures = options.failOnce === true ? 1 : 0;
  return {
    rows,
    async list() {
      return rows.map((row) => structuredClone(row));
    },
    async findById(id) {
      const found = rows.find((row) => row.id === id);
      return found === undefined ? null : structuredClone(found);
    },
    async create(input) {
      if (failures > 0) {
        failures -= 1;
        rows.push({ id: "corrida", ...input });
        throw new Error("UNIQUE constraint failed");
      }
      const row = { id: `s${rows.length + 1}`, ...input };
      rows.push(row);
      return structuredClone(row);
    },
    async replace(id, input) {
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return null;
      if (failures > 0) {
        failures -= 1;
        const other = rows.find((row) => row.id !== id);
        if (other !== undefined) other.name = input.name;
        throw new Error("UNIQUE constraint failed");
      }
      rows[index] = { id, ...input };
      return structuredClone(rows[index] as Semester);
    },
  };
}

const valid: SemesterInput = {
  name: "  2026.2 ",
  start: "2026-08-03",
  end: "2026-12-19",
  terms: [
    { position: 2, start: "2026-10-05", end: "2026-12-19" },
    { position: 1, start: "2026-08-03", end: "2026-10-03" },
    { position: 3, start: "", end: "" },
    { position: 4, start: " ", end: "" },
  ],
  blocks: [
    { number: "2", name: "Noite 123", short: "N123", start: "19:00", end: "22:00" },
    { number: 1, name: " Noite 12 ", short: "N12", start: "18:00", end: "19:50" },
  ],
};

describe("createSemestersService", () => {
  test("cria: apara texto, ignora durações em branco, ordena e converte números", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    const result = await service.create(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("2026.2");
    expect(result.value.terms.map((t) => t.position)).toEqual([1, 2]);
    expect(result.value.blocks.map((b) => [b.number, b.name])).toEqual([
      [1, "Noite 12"],
      [2, "Noite 123"],
    ]);
    expect(await service.get(result.value.id)).toEqual(result.value);
    expect(await service.list()).toHaveLength(1);
    expect(await service.get("nao-existe")).toBeNull();
  });

  test("nome: obrigatório, até 80 e único sem diferenciar maiúsculas", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    expect(await service.create({ ...valid, name: "   " })).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(await service.create({ ...valid, name: "x".repeat(81) })).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(await service.create({ ...valid, name: "x".repeat(80) })).toMatchObject({ ok: true });
    await service.create({ ...valid, name: "Semestre A" });
    expect(await service.create({ ...valid, name: "semestre a" })).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "name",
      message: "Já existe um semestre com este nome.",
    });
  });

  test("validação do domínio vira falha com campo", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    expect(await service.create({ ...valid, start: "2026-02-30" })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "start",
      message: "Data de início inválida.",
    });
    expect(
      await service.create({
        ...valid,
        terms: [{ position: 1, start: "2026-07-01", end: "2026-09-01" }],
      }),
    ).toMatchObject({ ok: false, field: "term-1-start" });
    expect(
      await service.create({
        ...valid,
        blocks: [
          { number: 1, name: "A", short: "A", start: "08:00", end: "09:00" },
          { number: "1", name: "B", short: "B", start: "09:00", end: "10:00" },
        ],
      }),
    ).toMatchObject({ ok: false, field: "block-1-number" });
    expect(
      await service.create({
        ...valid,
        blocks: [{ number: "abc", name: "A", short: "A", start: "08:00", end: "09:00" }],
      }),
    ).toMatchObject({ ok: false, field: "block-0-number" });
  });

  test("duração com só um dos lados preenchido", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    expect(
      await service.create({ ...valid, terms: [{ position: 1, start: "2026-08-03", end: "" }] }),
    ).toMatchObject({ ok: false, field: "term-1-end" });
    expect(
      await service.create({ ...valid, terms: [{ position: 2, start: "", end: "2026-09-03" }] }),
    ).toMatchObject({ ok: false, field: "term-2-start" });
  });

  test("texto de bloco com caracteres de controle é recusado", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    expect(
      await service.create({
        ...valid,
        blocks: [{ number: 1, name: "A\u0007", short: "A", start: "08:00", end: "09:00" }],
      }),
    ).toMatchObject({ ok: false, field: "block-0-name" });
  });

  test("corrida na unicidade do nome vira conflito; outro erro é propagado", async () => {
    const racing = createSemestersService({ semesters: fakeRepo({ failOnce: true }) });
    expect(await racing.create({ ...valid, name: "corrida" })).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "name",
    });
    const broken = createSemestersService({
      semesters: {
        ...fakeRepo(),
        async create() {
          throw new Error("disco cheio");
        },
      },
    });
    await expect(broken.create({ ...valid, name: "outro" })).rejects.toThrow("disco cheio");
  });
});

function racingRepo(repo: FakeRepo): SemesterRepository {
  return {
    ...repo,
    async replace(id, input) {
      const other = repo.rows.find((row) => row.id !== id);
      if (other !== undefined) other.name = input.name;
      throw new Error("UNIQUE constraint failed");
    },
  };
}

function failingRepo(repo: SemesterRepository): SemesterRepository {
  return {
    ...repo,
    async replace() {
      throw new Error("falha");
    },
  };
}

describe("update", () => {
  test("substitui os dados e as listas", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    const created = await service.create(valid);
    if (!created.ok) throw new Error("setup");
    const updated = await service.update(created.value.id, {
      ...valid,
      terms: [],
      blocks: [],
      name: "Novo",
    });
    expect(updated).toMatchObject({ ok: true, value: { name: "Novo", terms: [], blocks: [] } });
  });

  test("mantém o próprio nome, recusa o de outro e informa inexistente", async () => {
    const service = createSemestersService({ semesters: fakeRepo() });
    const a = await service.create({ ...valid, name: "A" });
    await service.create({ ...valid, name: "B" });
    if (!a.ok) throw new Error("setup");
    expect(await service.update(a.value.id, { ...valid, name: "a" })).toMatchObject({ ok: true });
    expect(await service.update(a.value.id, { ...valid, name: "b" })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(await service.update("nada", valid)).toMatchObject({ ok: false, kind: "not_found" });
    expect(await service.update(a.value.id, { ...valid, end: "2026-08-03" })).toMatchObject({
      ok: false,
      kind: "validation",
    });
  });

  test("corrida na unicidade durante a atualização", async () => {
    const repo = fakeRepo();
    const service = createSemestersService({ semesters: repo });
    const a = await service.create({ ...valid, name: "A" });
    await service.create({ ...valid, name: "B" });
    if (!a.ok) throw new Error("setup");
    const racing = createSemestersService({ semesters: racingRepo(repo) });
    expect(await racing.update(a.value.id, { ...valid, name: "B2" })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    const failing = createSemestersService({ semesters: failingRepo(repo) });
    await expect(failing.update(a.value.id, { ...valid, name: "A3" })).rejects.toThrow("falha");
  });
});

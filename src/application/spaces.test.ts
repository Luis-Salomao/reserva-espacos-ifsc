import { beforeEach, describe, expect, test } from "bun:test";
import type { SpaceRepository } from "#/application/ports";
import { createSpacesService } from "#/application/spaces";
import type { Space } from "#/domain/space";

function setup() {
  const rows = new Map<string, Space>();
  let counter = 0;
  let failNext = false;
  const spaces: SpaceRepository = {
    list: async () => [...rows.values()],
    listWithEquipment: async () => [...rows.values()],
    create: async (input) => {
      if (failNext) {
        failNext = false;
        throw new Error("falha simulada");
      }
      counter += 1;
      const space = { id: `s${counter}`, ...input };
      rows.set(space.id, space);
      return space;
    },
    update: async (id, input) => {
      if (failNext) {
        failNext = false;
        throw new Error("falha simulada");
      }
      const found = rows.get(id);
      if (!found) return null;
      const next = { id, ...input };
      rows.set(id, next);
      return next;
    },
  };
  return {
    service: createSpacesService({ spaces }),
    rows,
    failNext: () => {
      failNext = true;
    },
  };
}

describe("criar espaço", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  test("cria com nome aparado e capacidade", async () => {
    const result = await ctx.service.create({ name: "  Lab 1 ", capacity: 30 });
    expect(result).toMatchObject({ ok: true, value: { name: "Lab 1", capacity: 30 } });
  });

  test("capacidade vazia ou nula = não informada", async () => {
    expect(await ctx.service.create({ name: "A", capacity: null })).toMatchObject({
      ok: true,
      value: { capacity: null },
    });
    expect(await ctx.service.create({ name: "B", capacity: "  " })).toMatchObject({
      ok: true,
      value: { capacity: null },
    });
  });

  test("capacidade em texto numérico é convertida; limites 1 e 2000", async () => {
    expect(await ctx.service.create({ name: "A", capacity: "45" })).toMatchObject({
      ok: true,
      value: { capacity: 45 },
    });
    expect((await ctx.service.create({ name: "B", capacity: 1 })).ok).toBe(true);
    expect((await ctx.service.create({ name: "C", capacity: 2000 })).ok).toBe(true);
  });

  test.each([
    ["zero", 0],
    ["negativa", -3],
    ["acima do limite", 2001],
    ["fracionária", 2.5],
    ["NaN", Number.NaN],
    ["texto", "doze"],
    ["texto fracionário", "2.5"],
    ["texto negativo", "-1"],
    ["texto enorme", "99999999"],
  ])("recusa capacidade %s", async (_label, capacity) => {
    const result = await ctx.service.create({ name: "X", capacity });
    expect(result).toMatchObject({ ok: false, kind: "validation", field: "capacity" });
    expect(ctx.rows.size).toBe(0);
  });

  test.each([
    ["vazio", ""],
    ["só espaços", "   "],
    ["longo demais", "x".repeat(81)],
    ["com controle", "Lab\n1"],
    ["com DEL", "Lab\u007f1"],
    ["com controle C1 (U+0085)", "Lab\u00851"],
    ["com controle C1 (U+009F)", "Lab\u009f1"],
  ])("recusa nome %s", async (_label, name) => {
    expect(await ctx.service.create({ name, capacity: null })).toMatchObject({
      ok: false,
      kind: "validation",
      field: "name",
    });
  });

  test("aceita nome de 80 caracteres", async () => {
    expect((await ctx.service.create({ name: "x".repeat(80), capacity: null })).ok).toBe(true);
  });

  test("nome duplicado ignorando maiúsculas é conflito", async () => {
    await ctx.service.create({ name: "Auditório", capacity: null });
    expect(await ctx.service.create({ name: "AUDITÓRIO", capacity: null })).toMatchObject({
      ok: false,
      kind: "conflict",
      field: "name",
    });
  });

  test("corrida na gravação vira conflito; erro desconhecido é propagado", async () => {
    ctx.failNext();
    await expect(ctx.service.create({ name: "A", capacity: null })).rejects.toThrow(
      "falha simulada",
    );
    // Corrida: a gravação falha porque outro pedido criou o mesmo nome entre a checagem e o insert.
    const racing = createSpacesService({
      spaces: {
        list: (() => {
          let calls = 0;
          return async () => {
            calls += 1;
            return calls === 1 ? [] : [{ id: "z", name: "Sala", capacity: null }];
          };
        })(),
        create: async () => {
          throw new Error("UNIQUE");
        },
        update: async () => null,
        listWithEquipment: async () => [],
      },
    });
    expect(await racing.create({ name: "sala", capacity: null })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
  });
});

describe("editar espaço", () => {
  let ctx: ReturnType<typeof setup>;
  let id: string;
  beforeEach(async () => {
    ctx = setup();
    const created = await ctx.service.create({ name: "Lab 1", capacity: 20 });
    await ctx.service.create({ name: "Lab 2", capacity: null });
    if (!created.ok) throw new Error("setup");
    id = created.value.id;
  });

  test("altera nome e capacidade", async () => {
    expect(await ctx.service.update(id, { name: "Lab Um", capacity: "25" })).toMatchObject({
      ok: true,
      value: { id, name: "Lab Um", capacity: 25 },
    });
  });

  test("mantém o próprio nome (mesmo com outra caixa) e limpa a capacidade", async () => {
    expect(await ctx.service.update(id, { name: "LAB 1", capacity: null })).toMatchObject({
      ok: true,
      value: { name: "LAB 1", capacity: null },
    });
  });

  test("nome de outro espaço é conflito", async () => {
    expect(await ctx.service.update(id, { name: "lab 2", capacity: 20 })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
  });

  test("valida nome e capacidade", async () => {
    expect(await ctx.service.update(id, { name: "", capacity: 1 })).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(await ctx.service.update(id, { name: "A", capacity: 0 })).toMatchObject({
      ok: false,
      field: "capacity",
    });
  });

  test("espaço inexistente", async () => {
    expect(await ctx.service.update("nao-existe", { name: "Novo", capacity: null })).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });

  test("corrida/erro na gravação", async () => {
    ctx.failNext();
    await expect(ctx.service.update(id, { name: "Outro", capacity: null })).rejects.toThrow(
      "falha simulada",
    );
    const racing = createSpacesService({
      spaces: {
        list: (() => {
          let calls = 0;
          return async () => {
            calls += 1;
            return calls === 1 ? [] : [{ id: "z", name: "Sala", capacity: null }];
          };
        })(),
        create: async () => {
          throw new Error("UNIQUE");
        },
        update: async () => {
          throw new Error("UNIQUE");
        },
        listWithEquipment: async () => [],
      },
    });
    expect(await racing.update("s9", { name: "Sala", capacity: null })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
  });
});

describe("listar", () => {
  test("devolve os espaços do repositório", async () => {
    const ctx = setup();
    await ctx.service.create({ name: "A", capacity: null });
    expect(await ctx.service.list()).toHaveLength(1);
  });
});

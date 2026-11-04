import { beforeEach, describe, expect, test } from "bun:test";
import type { SpaceRepository } from "#/application/ports";
import { createSpacesService } from "#/application/spaces";
import type { Space } from "#/domain/space";

function setup() {
  const rows = new Map<string, Space>();
  let counter = 0;
  let failNext = false;
  let removeOutcome: Awaited<ReturnType<SpaceRepository["remove"]>> = "removed";
  const removed: string[] = [];
  const spaces: SpaceRepository = {
    list: async () => [...rows.values()],
    listWithEquipment: async () => [...rows.values()],
    remove: async (id) => {
      removed.push(id);
      return removeOutcome;
    },
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
    removed,
    failNext: () => {
      failNext = true;
    },
    removeReturns: (outcome: typeof removeOutcome) => {
      removeOutcome = outcome;
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
        remove: async () => "removed",
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
        remove: async () => "removed",
      },
    });
    expect(await racing.update("s9", { name: "Sala", capacity: null })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
  });
});

describe("equipamentos e observações", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  const COUNT_ERROR = "A quantidade de computadores deve ser um número inteiro de 0 a 999.";
  const PRESENCE_ERROR = "Escolha sim, não ou não informado.";
  const create = (items: Record<string, number | string | null>, notes: string | null = null) =>
    ctx.service.create({ name: "Lab", capacity: null, equipment: { items, notes } });

  test("grava presença, contagem aparada e observações aparadas com quebra de linha", async () => {
    const result = await create(
      { projetor: 1, computadores: " 12 ", som: null },
      "  Lousa digital\n\tCaixa portátil  ",
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        equipment: {
          items: { projetor: 1, computadores: 12 },
          notes: "Lousa digital\n\tCaixa portátil",
        },
      },
    });
  });

  test("vazio, só espaços ou nulo = não informado; 0 = não tem", async () => {
    const result = await create({ projetor: "", computadores: "   ", som: 0 }, "   ");
    expect(result).toMatchObject({
      ok: true,
      value: { equipment: { items: { som: 0 }, notes: null } },
    });
    if (!result.ok) throw new Error("setup");
    expect(result.value.equipment?.items).toEqual({ som: 0 });
  });

  test("contagem aceita os limites 0 e 999", async () => {
    expect(await create({ computadores: 0 })).toMatchObject({
      ok: true,
      value: { equipment: { items: { computadores: 0 } } },
    });
    ctx = setup();
    expect(await create({ computadores: "999" })).toMatchObject({
      ok: true,
      value: { equipment: { items: { computadores: 999 } } },
    });
  });

  test.each([
    ["negativa", -1],
    ["acima do limite", 1000],
    ["fracionária", 2.5],
    ["texto", "doze"],
    ["texto fracionário", "1.5"],
    ["texto enorme", "10000"],
  ])("recusa quantidade de computadores %s", async (_label, value) => {
    expect(await create({ computadores: value })).toEqual({
      ok: false,
      kind: "validation",
      message: COUNT_ERROR,
      field: "computadores",
    });
    expect(ctx.rows.size).toBe(0);
  });

  test.each([
    ["projetor", 2],
    ["projetor", "1"],
    ["projetor", -1],
    ["som", 5],
    ["som", "sim"],
  ])("recusa %s = %p", async (kind, value) => {
    expect(await create({ [kind]: value })).toEqual({
      ok: false,
      kind: "validation",
      message: PRESENCE_ERROR,
      field: kind,
    });
    expect(ctx.rows.size).toBe(0);
  });

  test("observações: 500 caracteres valem; 501 são recusados", async () => {
    expect((await create({}, "x".repeat(500))).ok).toBe(true);
    expect(await create({}, ` ${"x".repeat(501)} `)).toEqual({
      ok: false,
      kind: "validation",
      message: "As observações devem ter no máximo 500 caracteres.",
      field: "notes",
    });
  });

  test.each([
    ["sino (U+0007)", "a\u0007b"],
    ["DEL", "a\u007fb"],
    ["C1 (U+0085)", "a\u0085b"],
  ])("observações com controle %s são recusadas", async (_label, notes) => {
    expect(await create({}, notes)).toEqual({
      ok: false,
      kind: "validation",
      message: "As observações contêm caracteres inválidos.",
      field: "notes",
    });
    expect(ctx.rows.size).toBe(0);
  });

  test("tipo fora do catálogo é recusado sem gravar", async () => {
    expect(await create({ projetor: 1, lousa: 1 })).toEqual({
      ok: false,
      kind: "validation",
      message: "Tipo de equipamento desconhecido.",
    });
    expect(ctx.rows.size).toBe(0);
  });

  test("sem equipamentos, o repositório não recebe equipamentos ao criar nem ao editar", async () => {
    const created = await ctx.service.create({ name: "Lab", capacity: null });
    if (!created.ok) throw new Error("setup");
    expect("equipment" in created.value).toBe(false);
    const updated = await ctx.service.update(created.value.id, { name: "Lab 2", capacity: 3 });
    if (!updated.ok) throw new Error("setup");
    expect("equipment" in updated.value).toBe(false);
  });

  test("editar com equipamentos repassa o conjunto validado", async () => {
    const created = await ctx.service.create({ name: "Lab", capacity: null });
    if (!created.ok) throw new Error("setup");
    expect(
      await ctx.service.update(created.value.id, {
        name: "Lab",
        capacity: null,
        equipment: { items: { computadores: "3" }, notes: null },
      }),
    ).toEqual({
      ok: true,
      value: {
        id: created.value.id,
        name: "Lab",
        capacity: null,
        equipment: { items: { computadores: 3 }, notes: null },
      },
    });
  });

  test("editar com equipamento inválido não grava", async () => {
    const created = await ctx.service.create({ name: "Lab", capacity: 10 });
    if (!created.ok) throw new Error("setup");
    expect(
      await ctx.service.update(created.value.id, {
        name: "Outro",
        capacity: 10,
        equipment: { items: { computadores: -1 }, notes: null },
      }),
    ).toMatchObject({ ok: false, field: "computadores" });
    expect(ctx.rows.get(created.value.id)?.name).toBe("Lab");
  });

  test("listWithEquipment devolve o que o repositório lê com equipamentos", async () => {
    await create({ projetor: 1 }, "Lousa");
    expect(await ctx.service.listWithEquipment()).toEqual([
      {
        id: "s1",
        name: "Lab",
        capacity: null,
        equipment: { items: { projetor: 1 }, notes: "Lousa" },
      },
    ]);
  });
});

describe("excluir espaço", () => {
  test("espaço sem uso é removido", async () => {
    const ctx = setup();
    expect(await ctx.service.remove("s1")).toEqual({ ok: true, value: null });
    expect(ctx.removed).toEqual(["s1"]);
  });

  test("espaço em uso é conflito com a mensagem da spec", async () => {
    const ctx = setup();
    ctx.removeReturns("in_use");
    expect(await ctx.service.remove("s1")).toMatchObject({
      ok: false,
      kind: "conflict",
      message: "Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído.",
    });
  });

  test("espaço inexistente", async () => {
    const ctx = setup();
    ctx.removeReturns("not_found");
    expect(await ctx.service.remove("x")).toMatchObject({
      ok: false,
      kind: "not_found",
      message: "Espaço não encontrado.",
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

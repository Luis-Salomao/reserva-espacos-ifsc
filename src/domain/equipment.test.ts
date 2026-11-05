import { describe, expect, test } from "bun:test";
import {
  describeEquipment,
  EQUIPMENT,
  equipmentForViewer,
  isEquipmentKind,
} from "#/domain/equipment";

describe("describeEquipment", () => {
  test.each([
    ["projetor", 1, "Projetor"],
    ["projetor", 0, "Sem projetor"],
    ["projetor", undefined, "Projetor não informado"],
    ["computadores", 12, "12 computadores"],
    ["computadores", 1, "1 computador"],
    ["computadores", 0, "Sem computadores"],
    ["computadores", undefined, "Computadores não informados"],
    ["som", 1, "Aparelho de som"],
    ["som", 0, "Sem aparelho de som"],
    ["som", undefined, "Aparelho de som não informado"],
  ] as const)("%s com %p → %s", (kind, quantity, text) => {
    expect(describeEquipment(kind, quantity)).toEqual({
      text,
      known: quantity !== undefined,
    });
  });
});

describe("equipmentForViewer", () => {
  const equipment = {
    items: { projetor: 1, computadores: 12 },
    notes: "Lousa digital",
  };

  test("logado recebe itens e observações; visitante fica sem o texto", () => {
    expect(equipmentForViewer(equipment, true)).toEqual(equipment);
    expect(equipmentForViewer(equipment, false)).toEqual({
      items: equipment.items,
      notes: null,
    });
    expect(JSON.stringify(equipmentForViewer(equipment, false))).not.toContain("Lousa digital");
  });

  test("sem cadastro, itens vazios e observações ausentes", () => {
    expect(equipmentForViewer(undefined, true)).toEqual({ items: {}, notes: null });
  });
});

describe("catálogo", () => {
  test("tem projetor e som por presença e computadores por contagem, nessa ordem", () => {
    expect(EQUIPMENT.map(({ kind, measure }) => [kind, measure])).toEqual([
      ["projetor", "presence"],
      ["computadores", "count"],
      ["som", "presence"],
    ]);
  });

  test("isEquipmentKind aceita só os tipos do catálogo", () => {
    expect(isEquipmentKind("projetor")).toBe(true);
    expect(isEquipmentKind("computadores")).toBe(true);
    expect(isEquipmentKind("som")).toBe(true);
    expect(isEquipmentKind("lousa")).toBe(false);
    expect(isEquipmentKind("")).toBe(false);
  });
});

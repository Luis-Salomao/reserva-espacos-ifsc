import { describe, expect, test } from "bun:test";
import { floorOf, groupSpaces } from "#/domain/space-groups";

const names = (list: { name: string }[]) => list.map((space) => space.name);

describe("floorOf", () => {
  test.each([
    ["A-202", "2"],
    ["B104", "1"],
    ["Lab. A302", "3"],
    ["Sala C - 210", "2"],
    ["Auditório", null],
    ["ADM 2", null],
    ["A-1000", null],
  ])("%s → %p", (name, floor) => {
    expect(floorOf(name)).toBe(floor);
  });
});

describe("groupSpaces", () => {
  const spaces = [
    { name: "Auditório" },
    { name: "B-104" },
    { name: "A-1000" },
    { name: "A-202" },
    { name: "A-110" },
    { name: "A-201" },
    { name: "ADM 2" },
  ];

  test("blocos em ordem, com 'Outros espaços' por último", () => {
    expect(groupSpaces(spaces).map((group) => group.label)).toEqual([
      "Bloco A",
      "Bloco B",
      "Outros espaços",
    ]);
  });

  test("andares em ordem, com 'Sem andar identificado' por último", () => {
    const blockA = groupSpaces(spaces)[0];
    expect(blockA?.floors.map((floor) => floor.label)).toEqual([
      "Andar 1",
      "Andar 2",
      "Sem andar identificado",
    ]);
    expect(blockA?.floors.map((floor) => names(floor.spaces))).toEqual([
      ["A-110"],
      ["A-201", "A-202"],
      ["A-1000"],
    ]);
  });

  test("nomes sem código ficam em 'Outros espaços' > 'Sem andar identificado', em ordem natural", () => {
    const others = groupSpaces(spaces).at(-1);
    expect(others).toEqual({
      label: "Outros espaços",
      floors: [
        { label: "Sem andar identificado", spaces: [{ name: "ADM 2" }, { name: "Auditório" }] },
      ],
    });
  });

  test("ordem natural: A-202 antes de A-1000 no mesmo grupo", () => {
    const group = groupSpaces([{ name: "Sala A-1000" }, { name: "Sala A-202" }]);
    expect(group[0]?.floors.flatMap((floor) => names(floor.spaces))).toEqual([
      "Sala A-202",
      "Sala A-1000",
    ]);
  });

  test("lista vazia não gera grupos", () => {
    expect(groupSpaces([])).toEqual([]);
  });
});

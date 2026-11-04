import { describe, expect, test } from "bun:test";
import type { TimeRange } from "./availability";
import {
  availabilityIn,
  blockOf,
  blocksOf,
  busyReasonText,
  defaultWindow,
  filterRooms,
  isFreeIn,
  OTHER_BLOCK,
  type RoomFilter,
  windowIssue,
} from "./room-filter";

const DATE = "2026-11-10";
/** "Agora" antes do dia dos testes: nenhum trecho é passado. */
const BEFORE = "2026-11-03T09:00";

function room(name: string, capacity: number | null, free: TimeRange[], date = DATE) {
  return { date, free, space: { id: `id-${name}`, name, capacity } };
}

const ALL_DAY: TimeRange[] = [{ start: "06:00", end: "23:00" }];
/** Ocupada das 14:00 às 15:00. */
const BUSY_AFTERNOON: TimeRange[] = [
  { start: "06:00", end: "14:00" },
  { start: "15:00", end: "23:00" },
];

const ROOMS = [
  room("A-202", 40, ALL_DAY),
  room("A-1000", null, BUSY_AFTERNOON),
  room("Lab. A102", 20, ALL_DAY),
  room("B-104", 25, BUSY_AFTERNOON),
  room("Auditório", 120, ALL_DAY),
  room("ADM 2", null, ALL_DAY),
];

const NONE: RoomFilter = {
  blocks: [],
  minCapacity: null,
  query: "",
  onlyFree: false,
  window: { start: "14:00", end: "16:00" },
};

const names = (result: { rooms: { space: { name: string } }[] }) =>
  result.rooms.map((item) => item.space.name);

describe("blockOf", () => {
  test("letra do código no nome; sem código, nenhum bloco", () => {
    expect(blockOf("A-202")).toBe("A");
    expect(blockOf("b-104")).toBe("B");
    expect(blockOf("Lab. A102")).toBe("A");
    expect(blockOf("C 301")).toBe("C");
    expect(blockOf("ADM 2")).toBeNull();
    expect(blockOf("Auditório")).toBeNull();
    expect(blockOf("LAB 1")).toBeNull();
  });
});

describe("blocksOf", () => {
  test("blocos presentes, em ordem, com 'Outros' por último quando há sala sem código", () => {
    expect(blocksOf(ROOMS)).toEqual(["A", "B", OTHER_BLOCK]);
    expect(blocksOf([room("B-1", null, ALL_DAY), room("A-1", null, ALL_DAY)])).toEqual(["A", "B"]);
    expect(blocksOf([])).toEqual([]);
  });
});

describe("filterRooms", () => {
  test("sem filtros, todas as salas na ordem recebida", () => {
    expect(filterRooms(ROOMS, NONE, BEFORE)).toEqual({ rooms: ROOMS, hiddenNoCapacity: 0 });
  });

  test("um ou mais blocos: só as salas desses blocos; 'Outros' são as salas sem código", () => {
    expect(names(filterRooms(ROOMS, { ...NONE, blocks: ["A"] }, BEFORE))).toEqual([
      "A-202",
      "A-1000",
      "Lab. A102",
    ]);
    expect(names(filterRooms(ROOMS, { ...NONE, blocks: ["B", OTHER_BLOCK] }, BEFORE))).toEqual([
      "B-104",
      "Auditório",
      "ADM 2",
    ]);
  });

  test("bloco que não existe entre as salas é ignorado", () => {
    expect(names(filterRooms(ROOMS, { ...NONE, blocks: ["Z"] }, BEFORE))).toEqual(
      names({ rooms: ROOMS }),
    );
    expect(names(filterRooms(ROOMS, { ...NONE, blocks: ["Z", "B"] }, BEFORE))).toEqual(["B-104"]);
  });

  test("capacidade mínima N: só capacidade cadastrada >= N, contando as sem capacidade escondidas", () => {
    const result = filterRooms(ROOMS, { ...NONE, minCapacity: 25 }, BEFORE);
    expect(names(result)).toEqual(["A-202", "B-104", "Auditório"]);
    expect(result.hiddenNoCapacity).toBe(2);
  });

  test("sem capacidade mínima, salas sem capacidade não são escondidas nem contadas", () => {
    expect(filterRooms(ROOMS, NONE, BEFORE).hiddenNoCapacity).toBe(0);
  });

  test("o aviso só conta salas sem capacidade que passariam nos outros filtros", () => {
    const result = filterRooms(ROOMS, { ...NONE, minCapacity: 10, blocks: ["A"] }, BEFORE);
    expect(names(result)).toEqual(["A-202", "Lab. A102"]);
    expect(result.hiddenNoCapacity).toBe(1);
  });

  test("busca por parte do nome, sem diferenciar maiúsculas nem acentos", () => {
    expect(names(filterRooms(ROOMS, { ...NONE, query: "auditorio" }, BEFORE))).toEqual([
      "Auditório",
    ]);
    expect(names(filterRooms(ROOMS, { ...NONE, query: "AUDITÓ" }, BEFORE))).toEqual(["Auditório"]);
    expect(names(filterRooms(ROOMS, { ...NONE, query: " lab " }, BEFORE))).toEqual(["Lab. A102"]);
    expect(names(filterRooms(ROOMS, { ...NONE, query: "xyz" }, BEFORE))).toEqual([]);
  });

  test("só livres: tira as salas com ocupação que cruza a janela", () => {
    expect(names(filterRooms(ROOMS, { ...NONE, onlyFree: true }, BEFORE))).toEqual([
      "A-202",
      "Lab. A102",
      "Auditório",
      "ADM 2",
    ]);
    const before = filterRooms(
      ROOMS,
      { ...NONE, onlyFree: true, window: { start: "12:00", end: "14:00" } },
      BEFORE,
    );
    expect(names(before)).toEqual(names({ rooms: ROOMS }));
  });

  test("filtros combinam: bloco A + só livres 14:00–16:00", () => {
    expect(names(filterRooms(ROOMS, { ...NONE, blocks: ["A"], onlyFree: true }, BEFORE))).toEqual([
      "A-202",
      "Lab. A102",
    ]);
  });
});

describe("isFreeIn", () => {
  test("livre quando a janela cabe inteira num trecho livre", () => {
    expect(
      isFreeIn(room("X", null, BUSY_AFTERNOON), { start: "15:00", end: "16:00" }, BEFORE),
    ).toBe(true);
    expect(
      isFreeIn(room("X", null, BUSY_AFTERNOON), { start: "13:00", end: "14:00" }, BEFORE),
    ).toBe(true);
  });

  test("ocupado quando qualquer ocupação cruza a janela", () => {
    expect(
      isFreeIn(room("X", null, BUSY_AFTERNOON), { start: "13:00", end: "14:01" }, BEFORE),
    ).toBe(false);
    expect(
      isFreeIn(room("X", null, BUSY_AFTERNOON), { start: "14:30", end: "14:45" }, BEFORE),
    ).toBe(false);
  });

  test("fora do expediente não é livre", () => {
    expect(isFreeIn(room("X", null, ALL_DAY), { start: "05:00", end: "07:00" }, BEFORE)).toBe(
      false,
    );
  });

  test("trecho passado de hoje conta como ocupado; dia passado inteiro também", () => {
    const today = room("X", null, ALL_DAY, "2026-11-03");
    expect(isFreeIn(today, { start: "08:00", end: "10:00" }, "2026-11-03T09:00")).toBe(false);
    expect(isFreeIn(today, { start: "09:00", end: "10:00" }, "2026-11-03T09:00")).toBe(false);
    expect(isFreeIn(today, { start: "09:30", end: "10:00" }, "2026-11-03T09:00")).toBe(true);
    expect(isFreeIn(today, { start: "14:00", end: "16:00" }, "2026-11-04T08:00")).toBe(false);
  });
});

describe("windowIssue", () => {
  test("fim menor ou igual ao início é recusado com a mensagem da tela", () => {
    expect(windowIssue({ start: "14:00", end: "14:00" })).toBe(
      "O fim precisa ser depois do início",
    );
    expect(windowIssue({ start: "14:00", end: "13:30" })).toBe(
      "O fim precisa ser depois do início",
    );
    expect(windowIssue({ start: "14:00", end: "16:00" })).toBeNull();
  });
});

describe("defaultWindow", () => {
  test("próxima 1 h a partir de agora, com início arredondado para cima em 30 min", () => {
    expect(defaultWindow("2026-11-03T09:10")).toEqual({ start: "09:30", end: "10:30" });
    expect(defaultWindow("2026-11-03T09:31")).toEqual({ start: "10:00", end: "11:00" });
    expect(defaultWindow("2026-11-03T13:59")).toEqual({ start: "14:00", end: "15:00" });
  });

  test("hora já redonda começa no próximo meio horário (o instante atual já passou)", () => {
    expect(defaultWindow("2026-11-03T09:00")).toEqual({ start: "09:30", end: "10:30" });
  });

  test("no fim do dia a janela não passa de 23:59", () => {
    expect(defaultWindow("2026-11-03T22:40")).toEqual({ start: "23:00", end: "23:59" });
    expect(defaultWindow("2026-11-03T23:45")).toEqual({ start: "23:00", end: "23:59" });
  });
});

describe("availabilityIn", () => {
  type Occ = { title: string; start: string; end: string; person: { name: string } | null };
  const occ = (title: string, start: string, end: string): Occ => ({
    title,
    start,
    end,
    person: { name: "Ana Souza" },
  });
  const withOccupations = (name: string, free: TimeRange[], occupations: Occ[]) => ({
    ...room(name, 30, free),
    occupations,
  });
  const WINDOW = { start: "14:00", end: "16:00" };
  const AVAIL = [
    withOccupations("A-202", BUSY_AFTERNOON, [occ("Cálculo I — 1A", "14:00", "15:00")]),
    withOccupations("B-104", ALL_DAY, []),
    withOccupations(
      "C-301",
      [
        { start: "06:00", end: "13:30" },
        { start: "16:30", end: "23:00" },
      ],
      [
        occ("Física — 2B", "13:30", "14:30"),
        occ("Química — 3C", "15:00", "16:30"),
        occ("Manhã", "08:00", "09:00"),
      ],
    ),
    withOccupations("Auditório", ALL_DAY, []),
  ];

  test("livres primeiro (na ordem recebida) e depois as ocupadas", () => {
    const result = availabilityIn(AVAIL, WINDOW, BEFORE);
    expect(result.free.map((item) => item.space.name)).toEqual(["B-104", "Auditório"]);
    expect(result.busy.map((item) => item.room.space.name)).toEqual(["A-202", "C-301"]);
  });

  test("o motivo traz título e horário de cada ocupação que cruza a janela, sem pessoas", () => {
    const result = availabilityIn(AVAIL, WINDOW, BEFORE);
    expect(result.busy[0]?.reasons).toEqual([
      { kind: "occupation", title: "Cálculo I — 1A", start: "14:00", end: "15:00" },
    ]);
    expect(result.busy[1]?.reasons).toEqual([
      { kind: "occupation", title: "Física — 2B", start: "13:30", end: "14:30" },
      { kind: "occupation", title: "Química — 3C", start: "15:00", end: "16:30" },
    ]);
    const reasons = JSON.stringify(result.busy.map((item) => item.reasons));
    expect(reasons.includes("Ana Souza")).toBe(false);
    expect(reasons.includes("person")).toBe(false);
  });

  test("janela que já começou vira 'Horário já passou', junto das ocupações que cruzam", () => {
    const now = `${DATE}T14:30`;
    const result = availabilityIn(AVAIL, WINDOW, now);
    expect(result.free).toEqual([]);
    expect(result.busy.find((item) => item.room.space.name === "B-104")?.reasons).toEqual([
      { kind: "past" },
    ]);
    expect(result.busy.find((item) => item.room.space.name === "A-202")?.reasons).toEqual([
      { kind: "past" },
      { kind: "occupation", title: "Cálculo I — 1A", start: "14:00", end: "15:00" },
    ]);
  });

  test("sala sem ocupação na janela mas fora do expediente vira 'closed'", () => {
    const late = [withOccupations("Lab", [{ start: "06:00", end: "22:00" }], [])];
    const result = availabilityIn(late, { start: "21:30", end: "22:30" }, BEFORE);
    expect(result.free).toEqual([]);
    expect(result.busy[0]?.reasons).toEqual([{ kind: "closed" }]);
  });
});

describe("busyReasonText", () => {
  test("ocupação vira título e horário; passado e fora do expediente têm frase própria", () => {
    expect(
      busyReasonText({ kind: "occupation", title: "Cálculo I", start: "14:00", end: "15:40" }),
    ).toBe("Cálculo I, 14:00–15:40");
    expect(busyReasonText({ kind: "past" })).toBe("Horário já passou");
    expect(busyReasonText({ kind: "closed" })).toBe("Fora do horário de funcionamento");
  });
});

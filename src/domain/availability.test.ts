import { describe, expect, test } from "bun:test";
import {
  DEFAULT_HOURS,
  freeIntervals,
  localNow,
  validateBookingWhen,
  weekdaySqlite,
} from "./availability";

describe("freeIntervals", () => {
  test("sem ocupações, o expediente inteiro", () => {
    expect(freeIntervals(DEFAULT_HOURS, [])).toEqual([{ start: "06:00", end: "23:00" }]);
  });

  test("intervalos entre aulas aparecem livres (09:50-10:10 e almoço)", () => {
    const busy = [
      { start: "08:00", end: "09:50" },
      { start: "10:10", end: "12:00" },
      { start: "13:30", end: "15:00" },
    ];
    expect(freeIntervals(DEFAULT_HOURS, busy)).toEqual([
      { start: "06:00", end: "08:00" },
      { start: "09:50", end: "10:10" },
      { start: "12:00", end: "13:30" },
      { start: "15:00", end: "23:00" },
    ]);
  });

  test("meio-aberto: ocupações adjacentes não deixam vão e sobrepostas se fundem", () => {
    const busy = [
      { start: "10:00", end: "11:00" },
      { start: "11:00", end: "12:00" },
      { start: "11:30", end: "13:00" },
    ];
    expect(freeIntervals({ opens: "08:00", closes: "14:00" }, busy)).toEqual([
      { start: "08:00", end: "10:00" },
      { start: "13:00", end: "14:00" },
    ]);
  });

  test("ocupações fora do expediente são recortadas; desordenadas são aceitas", () => {
    const busy = [
      { start: "22:00", end: "23:30" },
      { start: "05:00", end: "07:00" },
    ];
    expect(freeIntervals(DEFAULT_HOURS, busy)).toEqual([{ start: "07:00", end: "22:00" }]);
  });

  test("dia todo ocupado não tem livres", () => {
    expect(freeIntervals(DEFAULT_HOURS, [{ start: "05:00", end: "23:59" }])).toEqual([]);
    expect(freeIntervals(DEFAULT_HOURS, [{ start: "00:00", end: "05:00" }])).toEqual([
      { start: "06:00", end: "23:00" },
    ]);
  });
});

describe("localNow", () => {
  test("converte o instante para a hora de parede do fuso", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(localNow(now, "America/Sao_Paulo")).toBe("2026-11-03T09:00");
    expect(localNow(now, "UTC")).toBe("2026-11-03T12:00");
  });

  test("vira o dia no fuso (02:30Z é 23:30 do dia anterior em Brasília)", () => {
    expect(localNow(new Date("2026-11-04T02:30:00Z"), "America/Sao_Paulo")).toBe(
      "2026-11-03T23:30",
    );
    expect(localNow(new Date("2026-11-04T00:05:00Z"), "UTC")).toBe("2026-11-04T00:05");
  });
});

describe("validateBookingWhen", () => {
  const now = "2026-11-03T09:00";
  const base = { date: "2026-11-03", start: "10:00", end: "11:00" };

  test("aceita hoje em horário futuro e dias futuros", () => {
    expect(validateBookingWhen(base, DEFAULT_HOURS, now)).toBeNull();
    expect(validateBookingWhen({ ...base, date: "2026-12-01" }, DEFAULT_HOURS, now)).toBeNull();
  });

  test("recusa data inválida e horários malformados", () => {
    expect(validateBookingWhen({ ...base, date: "2026-02-30" }, DEFAULT_HOURS, now)?.field).toBe(
      "date",
    );
    expect(validateBookingWhen({ ...base, date: "03/11/2026" }, DEFAULT_HOURS, now)?.field).toBe(
      "date",
    );
    expect(validateBookingWhen({ ...base, start: "25:00" }, DEFAULT_HOURS, now)?.field).toBe(
      "start",
    );
    expect(validateBookingWhen({ ...base, end: "9:5" }, DEFAULT_HOURS, now)?.field).toBe("end");
  });

  test("fim deve ser depois do início", () => {
    expect(validateBookingWhen({ ...base, end: "10:00" }, DEFAULT_HOURS, now)?.field).toBe("end");
    expect(validateBookingWhen({ ...base, end: "09:30" }, DEFAULT_HOURS, now)?.field).toBe("end");
  });

  test("dentro do expediente; 06:00 e 23:00 exatos valem", () => {
    expect(
      validateBookingWhen(
        { ...base, date: "2026-11-10", start: "05:59", end: "07:00" },
        DEFAULT_HOURS,
        now,
      )?.field,
    ).toBe("start");
    expect(
      validateBookingWhen(
        { ...base, date: "2026-11-10", start: "22:00", end: "23:01" },
        DEFAULT_HOURS,
        now,
      )?.field,
    ).toBe("end");
    expect(
      validateBookingWhen(
        { ...base, date: "2026-11-10", start: "06:00", end: "23:00" },
        DEFAULT_HOURS,
        now,
      ),
    ).toBeNull();
  });

  test("não aceita o passado, nem o minuto corrente", () => {
    expect(validateBookingWhen({ ...base, date: "2026-11-02" }, DEFAULT_HOURS, now)?.field).toBe(
      "date",
    );
    expect(
      validateBookingWhen({ ...base, start: "08:00", end: "09:30" }, DEFAULT_HOURS, now)?.field,
    ).toBe("start");
    expect(
      validateBookingWhen({ ...base, start: "09:00", end: "09:30" }, DEFAULT_HOURS, now)?.field,
    ).toBe("start");
    expect(
      validateBookingWhen({ ...base, start: "09:01", end: "09:30" }, DEFAULT_HOURS, now),
    ).toBeNull();
  });
});

describe("weekdaySqlite", () => {
  test("segunda=0 vira 1 e domingo=6 vira 0 (strftime %w)", () => {
    expect(weekdaySqlite("2026-11-02")).toBe(1);
    expect(weekdaySqlite("2026-11-08")).toBe(0);
  });
});

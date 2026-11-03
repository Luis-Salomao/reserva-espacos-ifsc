import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, makeService, openDb, rawAll, seed } from "../../../../test/booking-env";

const dir = mkdtempSync(join(tmpdir(), "reserva-conc-"));
afterAll(() => {
  // No Windows os arquivos abertos pelo SQLite podem demorar a liberar; a pasta é temporária.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignorado de propósito
  }
});

const slot = (spaceId: string, start: string, end: string, purpose: string) => ({
  spaceId,
  date: "2026-11-10",
  start,
  end,
  purpose,
});

describe("reservas concorrentes (dois clientes do mesmo arquivo SQLite)", () => {
  test("sobrepostas em rodada: exatamente uma é confirmada, a outra recebe conflito", async () => {
    const path = join(dir, "corrida.db");
    const { db: first } = openDb(path);
    const s = await seed(first);
    const second = connect(path);
    const a = makeService(first);
    const b = makeService(second);

    const results = await Promise.all([
      a.createBooking(s.docA, slot(s.sala1.id, "10:00", "11:00", "A")),
      b.createBooking(s.docB, slot(s.sala1.id, "10:30", "11:30", "B")),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const lost = results.find((result) => !result.ok);
    expect(lost).toMatchObject({ ok: false, kind: "conflict" });
    expect(rawAll(first, "select count(*) as n from occupations where status = 'ativa'")).toEqual([
      { n: 1 },
    ]);
  });

  test("muitas rodadas alternando conexões: nunca duas sobrepostas ativas", async () => {
    const path = join(dir, "varias.db");
    const { db: first } = openDb(path);
    const s = await seed(first);
    const services = [makeService(first), makeService(connect(path))];
    const users = [s.docA, s.docB];
    const attempts = [];
    for (let round = 0; round < 20; round++) {
      const start = `${String(7 + (round % 8)).padStart(2, "0")}:00`;
      const end = `${String(8 + (round % 8)).padStart(2, "0")}:30`;
      for (const index of [0, 1]) {
        const service = services[index];
        const user = users[index];
        if (service === undefined || user === undefined) throw new Error("setup");
        attempts.push(
          service.createBooking(user, slot(s.sala1.id, start, end, `R${round}-${index}`)),
        );
      }
    }
    const results = await Promise.all(attempts);
    expect(results.filter((result) => result.ok).length).toBeGreaterThan(0);
    const overlaps = rawAll(
      first,
      `select count(*) as n from occupations a join occupations b
        on a.space_id = b.space_id and a.id < b.id and a.status = 'ativa' and b.status = 'ativa'
        and a.starts_at < b.ends_at and b.starts_at < a.ends_at`,
    );
    expect(overlaps).toEqual([{ n: 0 }]);
  });

  test("espaços diferentes no mesmo horário não competem", async () => {
    const path = join(dir, "espacos.db");
    const { db: first } = openDb(path);
    const s = await seed(first);
    const a = makeService(first);
    const b = makeService(connect(path));
    const results = await Promise.all([
      a.createBooking(s.docA, slot(s.sala1.id, "10:00", "11:00", "A")),
      b.createBooking(s.docB, slot(s.sala2.id, "10:00", "11:00", "B")),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
  });
});

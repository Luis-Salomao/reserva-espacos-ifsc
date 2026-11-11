import { describe, expect, test } from "bun:test";
import { createBookingsService } from "#/application/bookings";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createBookingEmailFactory } from "#/infra/email/booking-email";
import { bookingDeps, openDb, rawAll, seed } from "../../../../test/booking-env";

describe("reserva e notificação persistem juntas", () => {
  test("cancelamento não confirma snapshot alterado durante preparação do e-mail", async () => {
    const { db } = openDb();
    const s = await seed(db);
    const original = await createBookingsService(bookingDeps(db)).createBooking(s.docA, {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "15:00",
      end: "16:00",
      purpose: "Original",
    });
    if (!original.ok) throw new Error("setup");
    const mail = createBookingEmailFactory(db, {
      codec: {
        seal: async (m) => {
          rawAll(db, "UPDATE occupations SET title = 'Alterada' WHERE status = 'ativa'");
          return JSON.stringify(m);
        },
        open: async (p) => JSON.parse(p),
      },
      publicOrigin: "https://reservas.example.org",
      clock: { now: () => new Date("2026-11-03T12:00:00Z") },
    });
    const repo = createOccupationRepository(db, mail);
    expect(await repo.cancelOne(original.value.id, "usuario", "2026-11-03T12:01:00Z")).toBe(false);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(0);
    expect((await repo.findById(original.value.id))?.status).toBe("ativa");
  });
  test("série gera um resumo, conflitos não deixam reservas ou notificações parciais", async () => {
    const { db } = openDb();
    const s = await seed(db);
    const mail = createBookingEmailFactory(db, {
      codec: { seal: async (m) => JSON.stringify(m), open: async (p) => JSON.parse(p) },
      publicOrigin: "https://reservas.example.org",
      clock: { now: () => new Date("2026-11-03T12:00:00Z") },
    });
    const repo = createOccupationRepository(db, mail);
    const input = {
      seriesId: "series-mail",
      spaceId: s.sala1.id,
      title: "Série",
      createdBy: s.docA.id,
      createdAt: "2026-11-03T12:00:00Z",
      slots: [
        { id: "one", startsAt: "2026-11-10T15:00", endsAt: "2026-11-10T16:00" },
        { id: "two", startsAt: "2026-11-11T15:00", endsAt: "2026-11-11T16:00" },
      ],
    };
    expect(await repo.insertSeriesIfFree(input)).toBe(true);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(1);
    expect(
      await repo.insertSeriesIfFree({
        ...input,
        seriesId: "conflict",
        slots: [
          { id: "three", startsAt: "2026-11-09T15:00", endsAt: "2026-11-09T16:00" },
          { id: "four", startsAt: "2026-11-10T15:00", endsAt: "2026-11-10T16:00" },
        ],
      }),
    ).toBe(false);
    expect(rawAll(db, "select * from occupations")).toHaveLength(2);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(1);
    const anchor = await repo.findById("one");
    if (!anchor) throw new Error("setup");
    expect(
      await repo.cancelSeries(
        anchor,
        "2026-11-03T09:00",
        s.docA.id,
        "usuario",
        "2026-11-03T12:00:01Z",
      ),
    ).toBe(2);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(2);
    expect(
      await repo.cancelSeries(
        anchor,
        "2026-11-03T09:00",
        s.docA.id,
        "usuario",
        "2026-11-03T12:00:02Z",
      ),
    ).toBe(0);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(2);
  });
  test("criação, edição e cancelamento geram mensagens; conflito não gera", async () => {
    const { db } = openDb();
    const s = await seed(db);
    const mail = createBookingEmailFactory(db, {
      codec: { seal: async (m) => JSON.stringify(m), open: async (p) => JSON.parse(p) },
      publicOrigin: "https://reservas.example.org",
      clock: { now: () => new Date("2026-11-03T12:00:00Z") },
    });
    const app = createBookingsService({
      ...bookingDeps(db),
      occupations: createOccupationRepository(db, mail),
    });
    const input = {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "15:00",
      end: "16:00",
      purpose: "Reunião",
    };
    const made = await app.createBooking(s.docA, input);
    if (!made.ok) throw new Error("setup");
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(1);
    await app.createBooking(s.docB, input);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(1);
    expect(
      (await app.updateBooking(s.docA, { ...input, occupationId: made.value.id, end: "16:30" })).ok,
    ).toBe(true);
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(2);
    await app.cancelOccupation(s.docA, { occupationId: made.value.id, scope: "data" });
    expect(rawAll(db, "select * from mail_outbox")).toHaveLength(3);
  });
  test("falha ao gravar outbox desfaz a reserva", async () => {
    const { db } = openDb();
    const s = await seed(db);
    const mail = createBookingEmailFactory(db, {
      codec: { seal: async (m) => JSON.stringify(m), open: async (p) => JSON.parse(p) },
      publicOrigin: "https://reservas.example.org",
      clock: { now: () => new Date("2026-11-03T12:00:00Z") },
    });
    const app = createBookingsService({
      ...bookingDeps(db),
      occupations: createOccupationRepository(db, mail),
    });
    rawAll(
      db,
      "CREATE TRIGGER fail_mail BEFORE INSERT ON mail_outbox BEGIN SELECT RAISE(ABORT, 'simulated'); END",
    );
    await expect(
      app.createBooking(s.docA, {
        spaceId: s.sala1.id,
        date: "2026-11-10",
        start: "15:00",
        end: "16:00",
        purpose: "Teste",
      }),
    ).rejects.toThrow();
    expect(rawAll(db, "select * from occupations")).toHaveLength(0);
  });
});

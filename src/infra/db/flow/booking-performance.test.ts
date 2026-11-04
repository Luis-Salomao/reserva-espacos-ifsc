import { describe, expect, test } from "bun:test";
import { createBookingsService } from "#/application/bookings";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { insertBatch, insertImported, openDb, seed } from "../../../../test/booking-env";

const pad = (value: number) => String(value).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

describe("desempenho da agenda", () => {
  test("semana com ~200 ocupações: uma consulta de ocupações e bem abaixo de 1 s", async () => {
    const { db } = openDb();
    const s = await seed(db);
    insertBatch(db, s.semester.id, s.admin.id);
    let rangeCalls = 0;
    const real = createOccupationRepository(db);
    const service = createBookingsService({
      occupations: {
        ...real,
        listActiveInRange: (...args) => {
          rangeCalls++;
          return real.listActiveInRange(...args);
        },
      },
      spaces: createSpaceRepository(db),
      semesters: createSemesterRepository(db),
      users: createUserRepository(db),
      clock: { now: () => new Date("2026-11-03T12:00:00Z") },
      timeZone: "America/Sao_Paulo",
      hours: { opens: "06:00", closes: "23:00" },
    });
    for (let day = 0; day < 7; day++) {
      for (let slot = 0; slot < 29; slot++) {
        const start = 6 * 60 + slot * 35;
        insertImported(db, {
          id: `p${day}-${slot}`,
          spaceId: s.sala1.id,
          date: `2026-11-${pad(9 + day)}`,
          start: clock(start),
          end: clock(start + 30),
          title: `T${slot}`,
          responsibleUserId: s.docA.id,
        });
      }
    }
    const started = performance.now();
    const result = await service.weekAgenda(s.docA, {
      spaceId: s.sala1.id,
      weekStart: "2026-11-09",
    });
    const elapsed = performance.now() - started;
    expect(
      result.ok && result.value.days.reduce((sum, day) => sum + day.occupations.length, 0),
    ).toBe(203);
    expect(rangeCalls).toBe(1);
    expect(elapsed).toBeLessThan(1000);
  });
});

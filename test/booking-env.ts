import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { type BookingsDeps, createBookingsService } from "#/application/bookings";
import type { Role } from "#/domain/user";
import type { AppDb } from "#/infra/db/client";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import * as schema from "#/infra/db/schema";

/** "Agora" fixo dos testes: terça, 03/11/2026, 09:00 em Brasília (12:00Z). */
export const NOW = new Date("2026-11-03T12:00:00Z");
export const TODAY = "2026-11-03";

export function openDb(path = ":memory:"): { db: AppDb } {
  const sqlite = new SqliteDatabase(path);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
}

/** Segunda conexão ao mesmo arquivo (já migrado). */
export function connect(path: string): AppDb {
  const sqlite = new SqliteDatabase(path);
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export function bookingDeps(db: AppDb, now: Date = NOW): BookingsDeps {
  return {
    occupations: createOccupationRepository(db),
    spaces: createSpaceRepository(db),
    semesters: createSemesterRepository(db),
    users: createUserRepository(db),
    clock: { now: () => now },
    timeZone: "America/Sao_Paulo",
    hours: { opens: "06:00", closes: "23:00" },
  };
}

export function makeService(db: AppDb, now: Date = NOW) {
  return createBookingsService(bookingDeps(db, now));
}

export async function seed(db: AppDb) {
  const users = createUserRepository(db);
  const account = (token: string, roles: Role[]) =>
    users.create({
      email: `${token}@x.org`,
      name: `Pessoa ${token}`,
      code: token.toUpperCase(),
      roles,
      passwordHash: "x",
    });
  const admin = await account("adm", ["admin"]);
  const horarios = await account("hor", ["horarios"]);
  const docA = await account("doca", ["docente"]);
  const docB = await account("docb", ["docente"]);
  const spaces = createSpaceRepository(db);
  const sala1 = await spaces.create({ name: "ADM 2", capacity: 30 });
  const sala2 = await spaces.create({ name: "LAB 1", capacity: 20 });
  const semester = await createSemesterRepository(db).create({
    name: "2026/2",
    start: "2026-08-03",
    end: "2026-12-18",
    terms: [],
    blocks: [
      { number: 1, name: "Noite 1", short: "N1", start: "18:50", end: "19:35" },
      { number: 2, name: "Noite 2", short: "N2", start: "19:35", end: "20:20" },
    ],
  });
  return { admin, horarios, docA, docB, sala1, sala2, semester };
}

export type Seed = Awaited<ReturnType<typeof seed>>;

/** Semestre extra, para o teste escolher qual intervalo cobre a data. */
export function insertSemester(
  db: AppDb,
  input: Parameters<ReturnType<typeof createSemesterRepository>["create"]>[0],
) {
  return createSemesterRepository(db).create(input);
}

/** Usuário avulso, para o catálogo sem o seed completo. */
export function insertUser(
  db: AppDb,
  input: Parameters<ReturnType<typeof createUserRepository>["create"]>[0],
) {
  return createUserRepository(db).create(input);
}

/** Lote de importação mínimo para ocupações importadas (FK). */
export function insertBatch(db: AppDb, semesterId: string, createdBy: string, id = "batch-1") {
  (
    db.insert(schema.importBatches).values({
      id,
      semesterId,
      fileHash: `hash-${id}`,
      summaryJson: "{}",
      planHash: null,
      status: "aplicado",
      createdBy,
      createdAt: "2026-08-01T00:00:00.000Z",
      appliedAt: "2026-08-01T00:00:00.000Z",
    }) as unknown as { run(): void }
  ).run();
}

export function insertImported(
  db: AppDb,
  input: {
    id: string;
    spaceId: string;
    date: string;
    start: string;
    end: string;
    title: string;
    responsibleUserId: string | null;
    batchId?: string;
    lessonId?: string;
    status?: "ativa" | "cancelada";
  },
) {
  (
    db.insert(schema.occupations).values({
      id: input.id,
      spaceId: input.spaceId,
      startsAt: `${input.date}T${input.start}`,
      endsAt: `${input.date}T${input.end}`,
      source: "import",
      batchId: input.batchId ?? "batch-1",
      lessonId: input.lessonId ?? `L-${input.id}`,
      responsibleUserId: input.responsibleUserId,
      title: input.title,
      status: input.status ?? "ativa",
      createdAt: "2026-08-01T00:00:00.000Z",
    }) as unknown as { run(): void }
  ).run();
}

/** SQL cru no cliente por baixo do drizzle (preparar cenários e conferir linhas). */
export function rawAll(db: AppDb, query: string): unknown[] {
  return (db as unknown as { $client: Database }).$client.query(query).all();
}

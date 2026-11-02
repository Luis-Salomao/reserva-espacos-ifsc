import { asc, desc, eq, inArray } from "drizzle-orm";
import type { SemesterRepository } from "#/application/ports";
import type { Semester } from "#/domain/semester";
import { runAtomically, type Statement } from "#/infra/db/atomic";
import type { AppDb } from "#/infra/db/client";
import { semesterBlocks, semesters, semesterTerms } from "#/infra/db/schema";

// Uma linha por INSERT: o D1 limita a 100 parâmetros por instrução.
function childInserts(db: AppDb, id: string, input: Omit<Semester, "id">): Statement[] {
  return [
    ...input.terms.map((term) =>
      db.insert(semesterTerms).values({
        semesterId: id,
        position: term.position,
        startsOn: term.start,
        endsOn: term.end,
      }),
    ),
    ...input.blocks.map((block) =>
      db.insert(semesterBlocks).values({
        semesterId: id,
        number: block.number,
        name: block.name,
        short: block.short,
        startTime: block.start,
        endTime: block.end,
      }),
    ),
  ];
}

async function load(db: AppDb, rows: (typeof semesters.$inferSelect)[]): Promise<Semester[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [terms, blocks] = await Promise.all([
    db
      .select()
      .from(semesterTerms)
      .where(inArray(semesterTerms.semesterId, ids))
      .orderBy(asc(semesterTerms.position)),
    db
      .select()
      .from(semesterBlocks)
      .where(inArray(semesterBlocks.semesterId, ids))
      .orderBy(asc(semesterBlocks.number)),
  ]);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    start: row.startsOn,
    end: row.endsOn,
    terms: terms
      .filter((term) => term.semesterId === row.id)
      .map((term) => ({ position: term.position, start: term.startsOn, end: term.endsOn })),
    blocks: blocks
      .filter((block) => block.semesterId === row.id)
      .map((block) => ({
        number: block.number,
        name: block.name,
        short: block.short,
        start: block.startTime,
        end: block.endTime,
      })),
  }));
}

/** Gravações de semestre e filhos são atômicas (`runAtomically`: batch no D1, transação no bun:sqlite). */
export function createSemesterRepository(db: AppDb): SemesterRepository {
  async function findById(id: string): Promise<Semester | null> {
    const rows = await db.select().from(semesters).where(eq(semesters.id, id));
    return (await load(db, rows))[0] ?? null;
  }

  return {
    async list() {
      const rows = await db
        .select()
        .from(semesters)
        .orderBy(desc(semesters.startsOn), asc(semesters.name));
      return load(db, rows);
    },
    findById,
    async create(input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await runAtomically(db, (x) => [
        x.insert(semesters).values({
          id,
          name: input.name,
          startsOn: input.start,
          endsOn: input.end,
          createdAt: now,
          updatedAt: now,
        }),
        ...childInserts(x, id, input),
      ]);
      return {
        id,
        ...input,
        terms: [...input.terms].sort((a, b) => a.position - b.position),
        blocks: [...input.blocks].sort((a, b) => a.number - b.number),
      };
    },
    async replace(id, input) {
      const [existing] = await db
        .select({ id: semesters.id })
        .from(semesters)
        .where(eq(semesters.id, id));
      if (existing === undefined) return null;
      await runAtomically(db, (x) => [
        x
          .update(semesters)
          .set({
            name: input.name,
            startsOn: input.start,
            endsOn: input.end,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(semesters.id, id)),
        x.delete(semesterTerms).where(eq(semesterTerms.semesterId, id)),
        x.delete(semesterBlocks).where(eq(semesterBlocks.semesterId, id)),
        ...childInserts(x, id, input),
      ]);
      return findById(id);
    },
  };
}

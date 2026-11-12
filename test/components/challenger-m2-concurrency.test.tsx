import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BookingSheet } from "#/components/agenda/booking-sheet";
import { CancelDialog, type CancelTarget } from "#/components/agenda/cancel-dialog";
import type { User } from "#/domain/user";
import type { AppDb } from "#/infra/db/client";
import { type BookingDeps, cancelOccupationAction } from "#/server/booking-actions";
import {
  connect,
  insertBatch,
  insertImported,
  makeService,
  NOW,
  openDb,
  rawAll,
  type Seed,
  seed,
} from "../booking-env";
import { requireElement } from "../dom-values";

afterEach(() => {
  cleanup();
});

async function setupEnv() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  const svc = makeService(db, NOW);

  const tokens = new Map<string, User>([
    ["adm", s.admin],
    ["hor", s.horarios],
    ["doca", s.docA],
    ["docb", s.docB],
    ["off", { ...s.docA, active: false }],
  ]);

  const deps: BookingDeps = {
    auth: {
      login: async () => ({ ok: false as const, reason: "invalid" }),
      authenticate: async (token) => {
        const found = tokens.get(token) ?? null;
        return found?.active ? found : null;
      },
      logout: async () => {},
    },
    bookings: svc,
    cookieSecure: "auto",
    publicRead: true,
  };

  const req = (token: string | null) => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });

  return { db, s, svc, deps, req };
}

describe("Challenger M2 — Suite 1: Overlapping Collisions & Half-Open Boundaries", () => {
  test("1.1 Baseline booking collision matrix (exact, left, right, subset, superset)", async () => {
    const { s, svc } = await setupEnv();
    const date = "2026-11-10";

    // Criação do baseline [10:00, 12:00) na sala1
    const baseline = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date,
      start: "10:00",
      end: "12:00",
      purpose: "Baseline de Referência",
    });
    expect(baseline.ok).toBe(true);

    // 1. Exact overlap: [10:00, 12:00) -> Conflito
    const exact = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "10:00",
      end: "12:00",
      purpose: "Conflito Exato",
    });
    expect(exact).toMatchObject({
      ok: false as const,
      kind: "conflict",
      conflict: {
        title: "Baseline de Referência",
        date,
        start: "10:00",
        end: "12:00",
      },
    });

    // 2. Left overlap: [09:30, 10:30) -> Conflito
    const left = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "09:30",
      end: "10:30",
      purpose: "Conflito Esquerda",
    });
    expect(left).toMatchObject({ ok: false as const, kind: "conflict" });

    // 3. Right overlap: [11:30, 12:30) -> Conflito
    const right = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "11:30",
      end: "12:30",
      purpose: "Conflito Direita",
    });
    expect(right).toMatchObject({ ok: false as const, kind: "conflict" });

    // 4. Enclosed / strict subset: [10:30, 11:30) -> Conflito
    const enclosed = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "10:30",
      end: "11:30",
      purpose: "Conflito Subconjunto",
    });
    expect(enclosed).toMatchObject({ ok: false as const, kind: "conflict" });

    // 5. Enclosing / strict superset: [09:00, 13:00) -> Conflito
    const enclosing = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "09:00",
      end: "13:00",
      purpose: "Conflito Superconjunto",
    });
    expect(enclosing).toMatchObject({ ok: false as const, kind: "conflict" });
  });

  test("1.2 Strict half-open boundary intervals [a, b) and [b, c) must NOT conflict", async () => {
    const { s, svc } = await setupEnv();
    const date = "2026-11-10";

    // Baseline: [10:00, 12:00)
    const base = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date,
      start: "10:00",
      end: "12:00",
      purpose: "Intervalo Central",
    });
    expect(base.ok).toBe(true);

    // Abutting left: [09:00, 10:00) toca exatamente no início (10:00) -> NÃO PODE CONFLITAR
    const leftTouch = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "09:00",
      end: "10:00",
      purpose: "Vizinho Esquerda",
    });
    expect(leftTouch.ok).toBe(true);

    // Abutting right: [12:00, 13:00) toca exatamente no término (12:00) -> NÃO PODE CONFLITAR
    const rightTouch = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "12:00",
      end: "13:00",
      purpose: "Vizinho Direita",
    });
    expect(rightTouch.ok).toBe(true);

    // 1-minute overlap boundary left: [08:00, 09:01) sobrepõe 1 min de [09:00, 10:00) -> CONFLITO
    const oneMinOverlapLeft = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date,
      start: "08:00",
      end: "09:01",
      purpose: "Sobreposição 1 min esquerda",
    });
    expect(oneMinOverlapLeft).toMatchObject({ ok: false as const, kind: "conflict" });

    // 1-minute overlap boundary right: [12:59, 14:00) sobrepõe 1 min de [12:00, 13:00) -> CONFLITO
    const oneMinOverlapRight = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date,
      start: "12:59",
      end: "14:00",
      purpose: "Sobreposição 1 min direita",
    });
    expect(oneMinOverlapRight).toMatchObject({ ok: false as const, kind: "conflict" });
  });

  test("1.3 Disjoint dimensions: different date, different space, and post-cancellation slot", async () => {
    const { s, svc } = await setupEnv();

    // Baseline na sala1 em 2026-11-10 [10:00, 12:00)
    const base = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      purpose: "Original",
    });
    expect(base.ok).toBe(true);

    // Mesmo horário, OUTRA DATA (2026-11-11) -> PERMITIDO
    const diffDate = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date: "2026-11-11",
      start: "10:00",
      end: "12:00",
      purpose: "Outro Dia",
    });
    expect(diffDate.ok).toBe(true);

    // Mesmo horário e data, OUTRO ESPAÇO (sala2) -> PERMITIDO
    const diffSpace = await svc.createBooking(s.docB, {
      spaceId: s.sala2.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      purpose: "Outra Sala",
    });
    expect(diffSpace.ok).toBe(true);

    // Cancela o baseline
    if (!base.ok) throw new Error("baseline falhou");
    const cancelRes = await svc.cancelOccupation(s.docA, {
      occupationId: base.value.id,
      scope: "data",
    });
    expect(cancelRes.ok).toBe(true);

    // Agora o mesmo horário [10:00, 12:00) na mesma sala1 e data DEVE ESTAR LIVRE
    const reuseSlot = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      purpose: "Horário Reutilizado Após Cancelamento",
    });
    expect(reuseSlot.ok).toBe(true);
  });

  test("1.4 Multi-slot contiguous packing across an entire workday", async () => {
    const { s, svc } = await setupEnv();
    const date = "2026-11-10";
    const hours: Array<[string, string]> = [
      ["07:00", "08:00"],
      ["08:00", "09:00"],
      ["09:00", "10:00"],
      ["10:00", "11:00"],
      ["11:00", "12:00"],
      ["12:00", "13:00"],
      ["13:00", "14:00"],
    ];

    // Enfileira blocos contíguos sem nenhum gap
    for (const [start, end] of hours) {
      const res = await svc.createBooking(s.docA, {
        spaceId: s.sala1.id,
        date,
        start,
        end,
        purpose: `Bloco ${start}-${end}`,
      });
      expect(res.ok).toBe(true);
    }

    // Tentar encaixar no meio [08:30, 09:30) deve falhar
    const overlapMid = await svc.createBooking(s.docB, {
      spaceId: s.sala1.id,
      date,
      start: "08:30",
      end: "09:30",
      purpose: "Invasão no Meio",
    });
    expect(overlapMid).toMatchObject({ ok: false as const, kind: "conflict" });
  });
});

describe("Challenger M2 — Suite 2: Concurrency Race on Booking Creation", () => {
  test("2.1 High-concurrency race: 20 simultaneous requests for the exact same slot", async () => {
    const { db, s, svc } = await setupEnv();
    const date = "2026-11-12";
    const start = "14:00";
    const end = "15:00";

    const users = [s.docA, s.docB, s.admin, s.horarios];
    const totalRequests = 20;

    // Dispara 20 requisições simultâneas
    const promises = Array.from({ length: totalRequests }, (_, i) => {
      const user = requireElement(users[i % users.length]);
      return svc.createBooking(user, {
        spaceId: s.sala1.id,
        date,
        start,
        end,
        purpose: `Concorrente #${i} por ${user.name}`,
      });
    });

    const results = await Promise.all(promises);

    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    // ESTRITAMENTE UMA deve ser confirmada
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(totalRequests - 1);

    for (const loser of losers) {
      expect(loser).toMatchObject({ ok: false as const, kind: "conflict" });
    }

    // Verifica persistência no banco SQLite: exatamente 1 registro ativo naquele horário
    const rows = rawAll(
      db,
      `SELECT id, title, starts_at, ends_at FROM occupations
       WHERE space_id = '${s.sala1.id}'
         AND starts_at = '${date}T${start}'
         AND status = 'ativa'`,
    );
    expect(rows).toHaveLength(1);
  });

  test("2.2 Overlapping interval race: multiple requests with staggered start/end times", async () => {
    const { db, s, svc } = await setupEnv();
    const date = "2026-11-12";

    const requests = [
      { start: "16:00", end: "17:00", tag: "R1" },
      { start: "16:30", end: "17:30", tag: "R2" },
      { start: "15:45", end: "16:15", tag: "R3" },
      { start: "16:15", end: "16:45", tag: "R4" },
      { start: "15:30", end: "17:30", tag: "R5" },
    ];

    const results = await Promise.all(
      requests.map((r, i) =>
        svc.createBooking(i % 2 === 0 ? s.docA : s.docB, {
          spaceId: s.sala1.id,
          date,
          start: r.start,
          end: r.end,
          purpose: `Candidato ${r.tag}`,
        }),
      ),
    );

    const winners = results.filter((r) => r.ok);
    expect(winners.length).toBeGreaterThanOrEqual(1);

    // Garante que NENHUM par de vencedores no banco se sobreponha
    const activeRows = rawAll(
      db,
      `SELECT id, starts_at, ends_at FROM occupations
       WHERE space_id = '${s.sala1.id}'
         AND starts_at >= '${date}T15:00'
         AND ends_at <= '${date}T18:00'
         AND status = 'ativa'
       ORDER BY starts_at`,
    ) as Array<{ id: string; starts_at: string; ends_at: string }>;

    for (let i = 0; i < activeRows.length - 1; i++) {
      const current = requireElement(activeRows[i]);
      const next = requireElement(activeRows[i + 1]);
      // Em intervalos meio-abertos, next.starts_at DEVE ser >= current.ends_at
      expect(next.starts_at >= current.ends_at).toBe(true);
    }
  });

  test("2.3 File-backed SQLite multi-connection concurrent race", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "challenger-sqlite-"));
    const dbPath = join(tempDir, "race.db");

    try {
      // Cria e migra o banco no arquivo
      const { db: dbPrimary } = openDb(dbPath);
      const s = await seed(dbPrimary);
      insertBatch(dbPrimary, s.semester.id, s.admin.id);

      // Abre segunda conexão independente ao mesmo arquivo
      const dbSecondary = connect(dbPath);

      const svcA = makeService(dbPrimary, NOW);
      const svcB = makeService(dbSecondary, NOW);

      const date = "2026-11-13";
      const start = "10:00";
      const end = "11:00";

      // Corrida entre as duas conexões distintas
      const [resA, resB] = await Promise.all([
        svcA.createBooking(s.docA, {
          spaceId: s.sala1.id,
          date,
          start,
          end,
          purpose: "Conexão 1",
        }),
        svcB.createBooking(s.docB, {
          spaceId: s.sala1.id,
          date,
          start,
          end,
          purpose: "Conexão 2",
        }),
      ]);

      const successCount = (resA.ok ? 1 : 0) + (resB.ok ? 1 : 0);
      const conflictCount = (!resA.ok ? 1 : 0) + (!resB.ok ? 1 : 0);

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      // Integridade final no disco
      const saved = rawAll(
        dbPrimary,
        `SELECT id, title FROM occupations
         WHERE space_id = '${s.sala1.id}'
           AND starts_at = '${date}T${start}'
           AND status = 'ativa'`,
      );
      expect(saved).toHaveLength(1);
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignora eventual lock de arquivo no Windows
      }
    }
  });
});

describe("Challenger M2 — Suite 3: Series Cancellation Concurrency Guard (expectedCount)", () => {
  async function seedImportedSeries(db: AppDb, s: Seed, count = 5) {
    const dates = [
      "2026-11-10",
      "2026-11-17",
      "2026-11-24",
      "2026-12-01",
      "2026-12-08",
      "2026-12-15",
    ].slice(0, count);

    const base = {
      spaceId: s.sala1.id,
      start: "10:10",
      end: "12:00",
      title: "Algoritmos",
      batchId: "batch-1",
      lessonId: "LES-ALG-1",
      responsibleUserId: s.docA.id,
    };

    for (const [idx, date] of dates.entries()) {
      insertImported(db, {
        ...base,
        id: `alg-${idx}`,
        date,
      });
    }

    return dates;
  }

  test("3.1 expectedCount mismatch returns conflict and preserves database atomicity (ZERO deletions)", async () => {
    const { db, s, svc } = await setupEnv();
    const dates = await seedImportedSeries(db, s, 5);

    // 1. Usuário faz prévia: encontra 5 ocorrências
    const preview = await svc.previewSeries(s.docA, "alg-0");
    expect(preview).toEqual({ ok: true as const, value: { dates } });

    // 2. Concorrência: outra pessoa (ou docente em outra aba) cancela a data alg-1 avulsamente
    const singleCancel = await svc.cancelOccupation(s.docA, {
      occupationId: "alg-1",
      scope: "data",
    });
    expect(singleCancel.ok).toBe(true);

    // Agora restam apenas 4 ativas
    // 3. Usuário envia o cancelamento em série com expectedCount = 5 (baseado na prévia antiga)
    const seriesAttempt = await svc.cancelOccupation(s.docA, {
      occupationId: "alg-0",
      scope: "serie",
      expectedCount: 5,
    });

    // Deve ser rejeitado com conflito (SERIES_CHANGED)
    expect(seriesAttempt).toMatchObject({
      ok: false as const,
      kind: "conflict",
      message: "A série mudou desde a confirmação. Revise as datas e confirme de novo.",
    });

    // 4. VERIFICAÇÃO EMPÍRICA DE NÃO-EXCLUSÃO PARCIAL (ATOMICIDADE):
    // As 4 restantes ('alg-0', 'alg-2', 'alg-3', 'alg-4') DEVEM CONTINUAR ATIVAS!
    const activeRows = rawAll(
      db,
      "SELECT id FROM occupations WHERE lesson_id = 'LES-ALG-1' AND status = 'ativa'",
    ) as Array<{ id: string }>;

    expect(activeRows.map((r) => r.id).sort()).toEqual(["alg-0", "alg-2", "alg-3", "alg-4"]);

    // 5. Atualiza a prévia: agora são 4
    const updatedPreview = await svc.previewSeries(s.docA, "alg-0");
    expect(updatedPreview).toEqual({
      ok: true as const,
      value: { dates: ["2026-11-10", "2026-11-24", "2026-12-01", "2026-12-08"] },
    });

    // 6. Confirmação com expectedCount = 4 deve ser aceita e cancelar exatamente as 4
    const successfulCancel = await svc.cancelOccupation(s.docA, {
      occupationId: "alg-0",
      scope: "serie",
      expectedCount: 4,
    });
    expect(successfulCancel).toEqual({ ok: true as const, value: { cancelled: 4 } });

    // Zero ativas restantes
    const remainingActive = rawAll(
      db,
      "SELECT id FROM occupations WHERE lesson_id = 'LES-ALG-1' AND status = 'ativa'",
    );
    expect(remainingActive).toHaveLength(0);
  });

  test("3.2 Server Action cancelOccupationAction enforces 409 on mismatch and 400 on boundary expectedCount", async () => {
    const { db, s, deps, req } = await setupEnv();
    await seedImportedSeries(db, s, 3);

    // Mismatch na Server Action -> status 409
    const mismatch = await cancelOccupationAction(deps, req("doca"), {
      occupationId: "alg-0",
      scope: "serie",
      expectedCount: 10,
    });
    expect(mismatch.response).toMatchObject({
      ok: false as const,
      status: 409 as const,
      message: "A série mudou desde a confirmação. Revise as datas e confirme de novo.",
    });

    // Valores limites / inválidos de expectedCount -> status 400
    const invalidValues = [-1, -99, 1.5, "3", 1001, 10000];
    for (const bad of invalidValues) {
      const res = await cancelOccupationAction(deps, req("doca"), {
        occupationId: "alg-0",
        scope: "serie",
        expectedCount: bad,
      });
      expect(res.response).toMatchObject({
        ok: false as const,
        status: 400 as const,
      });
    }

    // Todas as 3 continuam ativas
    const active = rawAll(
      db,
      "SELECT id FROM occupations WHERE lesson_id = 'LES-ALG-1' AND status = 'ativa'",
    );
    expect(active).toHaveLength(3);

    // expectedCount correto (3) -> sucesso e cancelamento das 3
    const correct = await cancelOccupationAction(deps, req("doca"), {
      occupationId: "alg-0",
      scope: "serie",
      expectedCount: 3,
    });
    expect(correct.response).toEqual({
      ok: true as const,
      data: { cancelled: 3 },
    });
  });

  test("3.3 expectedCount on scope 'data' is safely ignored", async () => {
    const { s, svc } = await setupEnv();
    const res = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:00",
      purpose: "Avulsa Teste",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // expectedCount fornecido em scope="data" deve ser ignorado
    const cancelRes = await svc.cancelOccupation(s.docA, {
      occupationId: res.value.id,
      scope: "data",
      expectedCount: 999,
    });
    expect(cancelRes).toEqual({ ok: true as const, value: { cancelled: 1 } });
  });
});

describe("Challenger M2 — Suite 4: Authorization & Scope Validation", () => {
  test("4.1 Unauthorized users cannot cancel single or series occupations (403)", async () => {
    const { db, s, svc, deps, req } = await setupEnv();
    insertImported(db, {
      id: "occ-doca",
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:40",
      title: "Docência A",
      responsibleUserId: s.docA.id,
    });

    // 1. Docente B tenta cancelar ocupação do Docente A -> 403 Forbidden
    const resB = await cancelOccupationAction(deps, req("docb"), {
      occupationId: "occ-doca",
      scope: "data",
    });
    expect(resB.response).toMatchObject({ ok: false as const, status: 403 as const });

    // 2. Horários tenta cancelar ocupação docente -> 403 Forbidden
    const resHor = await cancelOccupationAction(deps, req("hor"), {
      occupationId: "occ-doca",
      scope: "data",
    });
    expect(resHor.response).toMatchObject({ ok: false as const, status: 403 as const });

    // 3. Usuário inativo tenta cancelar sua própria ocupação -> 401 na sessão HTTP e forbidden no serviço
    const resInactive = await cancelOccupationAction(deps, req("off"), {
      occupationId: "occ-doca",
      scope: "data",
    });
    expect(resInactive.response).toMatchObject({ ok: false as const, status: 401 as const });
    const svcInactive = await svc.cancelOccupation(
      { ...s.docA, active: false },
      { occupationId: "occ-doca", scope: "data" },
    );
    expect(svcInactive).toMatchObject({ ok: false as const, kind: "forbidden" });

    // Ocupação permanece ativa
    const checkActive = rawAll(
      db,
      "SELECT id, status FROM occupations WHERE id = 'occ-doca' AND status = 'ativa'",
    );
    expect(checkActive).toHaveLength(1);

    // 4. Admin pode cancelar qualquer ocupação
    const resAdmin = await cancelOccupationAction(deps, req("adm"), {
      occupationId: "occ-doca",
      scope: "data",
    });
    expect(resAdmin.response).toEqual({ ok: true as const, data: { cancelled: 1 } });
  });

  test("4.2 Unauthenticated visitors cannot cancel (401)", async () => {
    const { deps, req } = await setupEnv();
    const anonRes = await cancelOccupationAction(deps, req(null), {
      occupationId: "qualquer",
      scope: "data",
    });
    expect(anonRes.response).toMatchObject({ ok: false as const, status: 401 as const });
  });

  test("4.3 Invalid or malformed scope strings return 400 Bad Request", async () => {
    const { deps, req } = await setupEnv();
    const badScopes = ["tudo", "all", "", null, 123, undefined, "DATA", "Serie", false];

    for (const scope of badScopes) {
      const res = await cancelOccupationAction(deps, req("doca"), {
        occupationId: "occ-doca",
        scope,
      });
      expect(res.response).toMatchObject({ ok: false as const, status: 400 as const });
    }
  });

  test("4.4 Series scope on manual reservation is rejected with clear message", async () => {
    const { s, svc } = await setupEnv();
    const created = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:00",
      purpose: "Manual Sem Série",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Tentativa de cancelar série de reserva avulsa
    const cancelRes = await svc.cancelOccupation(s.docA, {
      occupationId: created.value.id,
      scope: "serie",
    });
    expect(cancelRes).toMatchObject({
      ok: false as const,
      kind: "validation",
      message: "Esta reserva não faz parte de uma série; cancele apenas esta data.",
    });

    // Prévia de série de reserva avulsa também é recusada
    const previewRes = await svc.previewSeries(s.docA, created.value.id);
    expect(previewRes).toMatchObject({
      ok: false as const,
      kind: "validation",
      message: "Esta reserva não faz parte de uma série; cancele apenas esta data.",
    });
  });

  test("4.5 Cancellation idempotency: already cancelled occupation yields 409 conflict", async () => {
    const { s, svc } = await setupEnv();
    const created = await svc.createBooking(s.docA, {
      spaceId: s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "15:00",
      purpose: "Idempotência",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Primeiro cancelamento: OK
    const first = await svc.cancelOccupation(s.docA, {
      occupationId: created.value.id,
      scope: "data",
    });
    expect(first.ok).toBe(true);

    // Segundo cancelamento: conflito
    const second = await svc.cancelOccupation(s.docA, {
      occupationId: created.value.id,
      scope: "data",
    });
    expect(second).toMatchObject({
      ok: false as const,
      kind: "conflict",
      message: "Esta ocupação já foi cancelada.",
    });
  });

  test("4.6 Finished occupation in the past cannot be cancelled", async () => {
    const { db, s, svc } = await setupEnv();
    // Inserção de ocupação que terminou no passado (ontem)
    insertImported(db, {
      id: "passada-1",
      spaceId: s.sala1.id,
      date: "2026-11-01",
      start: "08:00",
      end: "09:00",
      title: "Aula Ontem",
      responsibleUserId: s.docA.id,
    });

    const res = await svc.cancelOccupation(s.docA, {
      occupationId: "passada-1",
      scope: "data",
    });
    expect(res).toMatchObject({
      ok: false as const,
      kind: "validation",
      message: "Esta ocupação já terminou e não pode ser cancelada.",
    });
  });
});

describe("Challenger M2 — Suite 5: UI Resilience & State Preservation", () => {
  test("5.1 BookingSheet retains form values and renders conflict banner when 409 collision happens", async () => {
    const spaces = [{ id: "s-1", name: "Laboratório 10", capacity: 20 }];
    const mockCreate = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "Conflita com Física I — Laboratório 10, 10:00–12:00.",
      conflict: {
        title: "Física I",
        spaceName: "Laboratório 10",
        date: "2026-11-20",
        start: "10:00",
        end: "12:00",
      },
    }));

    render(
      <BookingSheet
        open={true}
        onOpenChange={() => {}}
        spaces={spaces}
        initialSlot={{ spaceId: "s-1", date: "2026-11-20", start: "10:00", end: "11:00" }}
        createFn={mockCreate}
      />,
    );

    const purposeInput = screen.getByLabelText(/Matéria ou título/i) as HTMLInputElement;
    fireEvent.change(purposeInput, { target: { value: "Reunião de Alinhamento" } });

    const submitBtn = screen.getByRole("button", { name: "Reservar" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    // O alerta de conflito DEVE ser exibido
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Conflita com Física I — Laboratório 10, 10:00–12:00.");

    // CRÍTICO: Os dados do formulário NÃO devem ser perdidos
    expect(purposeInput.value).toBe("Reunião de Alinhamento");
    expect((screen.getByLabelText(/Início/i) as HTMLInputElement).value).toBe("10:00");
    expect((screen.getByLabelText(/Fim/i) as HTMLInputElement).value).toBe("11:00");
  });

  test("5.2 CancelDialog displays 409 SERIES_CHANGED alert and automatically refreshes series preview", async () => {
    const target: CancelTarget = {
      id: "occ-series-1",
      date: "2026-11-10",
      start: "08:00",
      end: "09:40",
      title: "Redes de Computadores",
      source: "import",
      spaceName: "LAB 1",
    };

    let previewCalls = 0;
    const mockPreview = mock(async (..._args: unknown[]) => {
      previewCalls++;
      if (previewCalls === 1) {
        return { ok: true as const, data: { dates: ["2026-11-10", "2026-11-17", "2026-11-24"] } };
      }
      // Segunda chamada (após 409): lista atualizada com 2 datas
      return { ok: true as const, data: { dates: ["2026-11-10", "2026-11-24"] } };
    });

    const mockCancel = mock(async (..._args: unknown[]) => ({
      ok: false as const,
      status: 409 as const,
      message: "A série mudou desde a confirmação. Revise as datas e confirme de novo.",
    }));

    render(
      <CancelDialog
        open={true}
        onOpenChange={() => {}}
        target={target}
        previewFn={mockPreview}
        cancelFn={mockCancel}
      />,
    );

    // Seleciona a opção de rádio 'serie'
    const serieRadio = screen.getByRole("radio", { name: /Toda a série/i });
    fireEvent.click(serieRadio);

    // Aguarda carregar a prévia inicial (3 datas)
    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Cancelar toda a série (3)" })).toBeDefined();
    });

    // Submete o cancelamento da série com expectedCount = 3
    const confirmBtn = screen.getByRole("button", { name: "Cancelar toda a série (3)" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });

    // 1. Mensagem de conflito 409 é exibida no alerta
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A série mudou desde a confirmação");

    // 2. CancelDialog automaticamente re-disparou previewFn para sincronizar a contagem atualizada
    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Cancelar toda a série (2)" })).toBeDefined();
    });
  });
});

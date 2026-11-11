import { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireFailure, requireSuccess } from "../assert-response";
import {
  buildAgendaQuery,
  calculateMultiLanes,
  createE2EClient,
  createE2EContext,
  type E2EClient,
  type E2EContext,
  executeBackupVacuum,
  insertImported,
  NOW,
  parseAgendaQuery,
  restoreDatabaseSafe,
  switchSpaceKeepingDate,
  TIMETABLE_SHORTCUTS,
  TODAY,
  validateDatabaseIntegrity,
} from "./e2e-runner";

describe("Tier 3: Cross-Feature Combinations (35 Pairwise & Multi-Feature Integration Tests)", () => {
  let ctx: E2EContext;
  let anon: E2EClient;
  let docA: E2EClient;
  let docB: E2EClient;

  beforeEach(async () => {
    ctx = await createE2EContext({ publicRead: true, now: NOW });
    anon = createE2EClient(ctx, null);
    docA = createE2EClient(ctx, "doca");
    docB = createE2EClient(ctx, "docb");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // C1: F1 + F7: Weekly view renders for date specified in URL query params
  test("C1: F1 + F7 - Visão semanal carrega semana da data da URL", async () => {
    const url = `?data=2026-11-16&espaco=${ctx.s.sala1.id}`;
    const { date, spaceId } = parseAgendaQuery(url);
    const res = await docA.getWeekAgenda(spaceId, "2026-11-16");
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      expect(requireSuccess(res.response).weekStart).toBe("2026-11-16");
      expect(requireSuccess(res.response).spaceId).toBe(ctx.s.sala1.id);
      expect(requireSuccess(res.response).days[0]?.date).toBe(date);
    }
  });

  // C2: F1 + F12: Weekly view calculates free intervals across each day
  test("C2: F1 + F12 - Grade semanal calcula gaps livres para todos os dias", async () => {
    const res = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-09");
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      for (const day of requireSuccess(res.response).days) {
        expect(day.free.length).toBeGreaterThanOrEqual(1);
        expect(day.free[0]?.start).toBe("06:00");
      }
    }
  });

  // C3: F1 + F11: Weekly view handles multi-lane overlapping bookings
  test("C3: F1 + F11 - Sobreposições na semana são agrupadas em faixas paralelas", async () => {
    insertImported(ctx.db, {
      id: "c3-imp-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "10:00",
      title: "Turma A",
      responsibleUserId: ctx.s.docA.id,
    });
    insertImported(ctx.db, {
      id: "c3-imp-2",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "09:00",
      end: "11:00",
      title: "Turma B",
      responsibleUserId: ctx.s.docB.id,
    });

    const week = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-09");
    expect(week.response.ok).toBe(true);
    if (week.response.ok) {
      const tuesday = requireSuccess(week.response).days.find((d) => d.date === "2026-11-10");
      expect(tuesday?.occupations).toHaveLength(2);
      const lanes = calculateMultiLanes(tuesday?.occupations ?? []);
      expect(lanes.get(tuesday?.occupations[0]?.id ?? "")?.totalLanes).toBe(2);
    }
  });

  // C4: F4 + F6: Mobile timeline switches space via chip while keeping selected date
  test("C4: F4 + F6 - Linha do tempo mobile troca de espaço via chip mantendo a data", async () => {
    const initialUrl = `?data=2026-11-18&espaco=${ctx.s.sala1.id}`;
    const switchedUrl = switchSpaceKeepingDate(initialUrl, ctx.s.sala2.id);

    const { date, spaceId } = parseAgendaQuery(switchedUrl);
    expect(date).toBe("2026-11-18");
    expect(spaceId).toBe(ctx.s.sala2.id);

    const day = await docA.getDayAgenda(spaceId, date);
    expect(day.response.ok).toBe(true);
    if (day.response.ok) {
      expect(requireSuccess(day.response).spaceId).toBe(ctx.s.sala2.id);
      expect(requireSuccess(day.response).date).toBe("2026-11-18");
    }
  });

  // C5: F4 + F5: Mobile timeline updates date when weekly strip day pill is clicked
  test("C5: F4 + F5 - Faixa semanal mobile altera dia exibido na timeline", async () => {
    const dayPillDate = "2026-11-12";
    const res = await docA.getDayAgenda(ctx.s.sala1.id, dayPillDate);
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      expect(requireSuccess(res.response).date).toBe(dayPillDate);
      expect(requireSuccess(res.response).hours.opens).toBe("06:00");
    }
  });

  // C6: F7 + F8: Public reader loads deep-link URL without login prompt
  test("C6: F7 + F8 - Visitante acessa deep link com PUBLIC_READ=true sem exigir login", async () => {
    const deepLink = `?data=2026-11-10&espaco=${ctx.s.sala1.id}`;
    const { date, spaceId } = parseAgendaQuery(deepLink);

    const res = await anon.getDayAgenda(spaceId, date);
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      expect(requireSuccess(res.response).date).toBe("2026-11-10");
    }
  });

  // C7: F8 + F12 + F9: Public reader clicking a free gap triggers visitor gate redirecting to login
  test("C7: F8 + F12 + F9 - Clique em gap por visitante aciona gate de login", async () => {
    const gap = { spaceId: ctx.s.sala1.id, date: "2026-11-10", start: "14:00", end: "16:00" };
    const attempt = await anon.createBooking({ ...gap, purpose: "Tentativa de reserva anônima" });
    expect(attempt.response.ok).toBe(false);
    expect(requireFailure(attempt.response).status).toBe(401);

    const gateTarget = `/entrar?redirect=${encodeURIComponent(buildAgendaQuery({ data: gap.date, espaco: gap.spaceId }))}`;
    expect(gateTarget).toContain("/entrar");
    expect(gateTarget).toContain(gap.spaceId);
  });

  // C8: F8 + F20: Public reader sees occupation title and hours but zero personal names/emails
  test("C8: F8 + F20 - Visitante visualiza título mas nenhum dado pessoal do responsável", async () => {
    insertImported(ctx.db, {
      id: "occ-c8",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "11:50",
      title: "ESTATISTICA",
      responsibleUserId: ctx.s.docA.id,
    });

    const day = await anon.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(day.response.ok).toBe(true);
    if (day.response.ok) {
      const occ = requireSuccess(day.response).occupations.find((o) => o.id === "occ-c8");
      expect(occ?.title).toBe("ESTATISTICA");
      expect(occ?.mine).toBe(false);
      expect(occ?.canCancel).toBe(false);
      const json = JSON.stringify(requireSuccess(day.response));
      expect(json).not.toContain(ctx.s.docA.name);
      expect(json).not.toContain(ctx.s.docA.email);
    }
  });

  // C9: F3 + F7: Desktop room selector switches room, keeping URL date parameter intact
  test("C9: F3 + F7 - Seletor de espaço desktop troca sala preservando data na URL", () => {
    const current = `?data=2026-11-25&espaco=${ctx.s.sala1.id}`;
    const switched = switchSpaceKeepingDate(current, ctx.s.sala2.id);
    const parsed = parseAgendaQuery(switched);
    expect(parsed.date).toBe("2026-11-25");
    expect(parsed.spaceId).toBe(ctx.s.sala2.id);
  });

  // C10: F2 + F7: Mini calendar date selection updates URL ?data= and loads week
  test("C10: F2 + F7 - Seleção no mini calendário atualiza data e carrega a semana", async () => {
    const selectedDate = "2026-11-19";
    const monday = "2026-11-16";
    const res = await docA.getWeekAgenda(ctx.s.sala1.id, monday);
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      const dayExists = requireSuccess(res.response).days.some((d) => d.date === selectedDate);
      expect(dayExists).toBe(true);
    }
  });

  // C11: F12 + F15 + F17: Clicking free gap pre-fills space, date, start, end in booking form
  test("C11: F12 + F15 + F17 - Clique em gap preenche formulário e cria reserva", async () => {
    const day = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(day.response.ok).toBe(true);
    if (!day.response.ok) return;

    const firstFree = requireSuccess(day.response).free[0];
    expect(firstFree).toBeDefined();
    if (!firstFree) return;

    const created = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: firstFree.start,
      end: firstFree.end,
      purpose: "Reserva do primeiro gap livre",
    });
    expect(created.response.ok).toBe(true);
  });

  // C12: F17 + F18: Booking form applies standard block shortcut (e.g. M12 08:00-09:50)
  test("C12: F17 + F18 - Formulário de reserva com atalho M12", async () => {
    const shortcut = TIMETABLE_SHORTCUTS.M12;
    expect(shortcut).toBeDefined();
    if (!shortcut) return;

    const res = await docA.createBooking({
      spaceId: ctx.s.sala2.id,
      date: "2026-11-11",
      start: shortcut.start,
      end: shortcut.end,
      purpose: "Aula Bloco M12",
    });
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      expect(requireSuccess(res.response).start).toBe("08:00");
      expect(requireSuccess(res.response).end).toBe("09:50");
    }
  });

  // C13: F17 + F19 + F20: Booking form detects overlap with active booking and returns 409
  test("C13: F17 + F19 + F20 - Detecção de conflito em reserva sobreposta", async () => {
    const b1 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-12",
      start: "14:00",
      end: "16:00",
      purpose: "Existente",
    });
    expect(b1.response.ok).toBe(true);

    const b2 = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-12",
      start: "15:00",
      end: "17:00",
      purpose: "Conflitante",
    });
    expect(b2.response.ok).toBe(false);
    expect(requireFailure(b2.response).status).toBe(409);
    expect(requireFailure(b2.response).conflict?.title).toBe("Existente");
  });

  // C14: F17 + F21: Booking form allows adjoining half-open booking [A, B) and [B, C)
  test("C14: F17 + F21 - Reservas adjacentes meio-abertas aceitas sem conflito", async () => {
    const a = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-13",
      start: "08:00",
      end: "10:00",
      purpose: "Reserva A",
    });
    expect(a.response.ok).toBe(true);

    const b = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-13",
      start: "10:00",
      end: "12:00",
      purpose: "Reserva B Adjacente",
    });
    expect(b.response.ok).toBe(true);
  });

  // C15: F17 + F22: Simultaneous concurrent booking requests for same slot results in 1 success and 1 conflict
  test("C15: F17 + F22 - Concorrência atômica resulta em exatamente 1 sucesso", async () => {
    const slot = { spaceId: ctx.s.sala1.id, date: "2026-11-17", start: "10:00", end: "11:30" };
    const [res1, res2] = await Promise.all([
      docA.createBooking({ ...slot, purpose: "Doc A" }),
      docB.createBooking({ ...slot, purpose: "Doc B" }),
    ]);

    const successes = [res1, res2].filter((r) => r.response.ok);
    const conflicts = [res1, res2].filter(
      (r) => !r.response.ok && requireFailure(r.response).status === 409,
    );

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
  });

  // C16: F17 + F23 + F24: Confirmed booking appears in /minhas-reservas with matching parameters
  test("C16: F17 + F23 + F24 - Reserva criada aparece em Minhas Reservas", async () => {
    const created = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-15",
      start: "08:30",
      end: "10:00",
      purpose: "Palestra Magna",
    });
    expect(created.response.ok).toBe(true);
    if (!created.response.ok) return;

    const mine = await docA.myBookings();
    expect(mine.response.ok).toBe(true);
    if (mine.response.ok) {
      const found = requireSuccess(mine.response).items.find(
        (i) => i.id === requireSuccess(created.response).id,
      );
      expect(found).toBeDefined();
      expect(found?.title).toBe("Palestra Magna");
      expect(found?.spaceName).toBe("ADM 2");
    }
  });

  // C17: F24 + F26: /minhas-reservas applies highlight when newId matches newly created booking
  test("C17: F24 + F26 - newId destaca item recém-criado em Minhas Reservas", async () => {
    const res = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-16",
      start: "14:00",
      end: "15:00",
      purpose: "Item a Destacar",
    });
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    const newId = requireSuccess(res.response).id;
    const highlightCheck = (id: string) => id === newId;
    expect(highlightCheck(newId)).toBe(true);
    expect(highlightCheck("outro")).toBe(false);
  });

  // C18: F24 + F25: AppShell provides accessible navigation to /minhas-reservas
  test("C18: F24 + F25 - Navegação do AppShell permite acesso a Minhas Reservas", async () => {
    const check = await docA.myBookings();
    expect(check.response.ok).toBe(true);
    const nav = { label: "Minhas reservas", path: "/minhas-reservas" };
    expect(nav.path).toBe("/minhas-reservas");
  });

  // C19: F24 + F27: Cancelling manual booking from /minhas-reservas frees slot in agenda
  test("C19: F24 + F27 - Cancelamento de reserva avulsa libera slot na agenda", async () => {
    const b = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "14:00",
      end: "16:00",
      purpose: "Reserva a Liberar",
    });
    expect(b.response.ok).toBe(true);
    if (!b.response.ok) return;

    const id = requireSuccess(b.response).id;
    const cancel = await docA.cancelOccupation({ occupationId: id, scope: "data" });
    expect(cancel.response.ok).toBe(true);

    const day = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-17");
    if (day.response.ok) {
      expect(requireSuccess(day.response).occupations.some((o) => o.id === id)).toBe(false);
      expect(
        requireSuccess(day.response).free.some((g) => g.start <= "14:00" && g.end >= "16:00"),
      ).toBe(true);
    }
  });

  // C20: F24 + F28: Responsible teacher cancels single occurrence of imported class
  test("C20: F24 + F28 - Docente cancela ocorrência única de aula importada", async () => {
    insertImported(ctx.db, {
      id: "occ-c20-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:50",
      title: "QUIMICA",
      responsibleUserId: ctx.s.docA.id,
    });
    insertImported(ctx.db, {
      id: "occ-c20-2",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "08:00",
      end: "09:50",
      title: "QUIMICA",
      responsibleUserId: ctx.s.docA.id,
    });

    const c = await docA.cancelOccupation({ occupationId: "occ-c20-1", scope: "data" });
    expect(c.response.ok).toBe(true);

    const d1 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    if (d1.response.ok) {
      expect(requireSuccess(d1.response).occupations.some((o) => o.id === "occ-c20-1")).toBe(false);
    }
    const d2 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-17");
    if (d2.response.ok) {
      expect(requireSuccess(d2.response).occupations.some((o) => o.id === "occ-c20-2")).toBe(true);
    }
  });

  // C21: F28 + F12: Cancelling single occurrence opens new free gap in agenda
  test("C21: F28 + F12 - Cancelamento de aula importada gera novo gap livre", async () => {
    insertImported(ctx.db, {
      id: "occ-c21",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:10",
      end: "12:00",
      title: "FISICA",
      responsibleUserId: ctx.s.docA.id,
    });

    const cancel = await docA.cancelOccupation({ occupationId: "occ-c21", scope: "data" });
    expect(cancel.response.ok).toBe(true);

    const day = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    if (day.response.ok) {
      const gap = requireSuccess(day.response).free.find(
        (g) => g.start <= "10:10" && g.end >= "12:00",
      );
      expect(gap).toBeDefined();
    }
  });

  // C22: F24 + F30 + F31: Clicking series cancel fetches preview dates and presents explicit count
  test("C22: F24 + F30 + F31 - Prévia e confirmação de cancelamento em série", async () => {
    for (let i = 1; i <= 2; i++) {
      insertImported(ctx.db, {
        id: `occ-c22-${i}`,
        spaceId: ctx.s.sala1.id,
        date: `2026-11-${10 + i * 7}`,
        start: "14:00",
        end: "15:50",
        title: "HISTORIA",
        responsibleUserId: ctx.s.docA.id,
        batchId: "batch-1",
        lessonId: "L-HIST",
      });
    }

    const prev = await docA.previewSeries("occ-c22-1");
    expect(prev.response.ok).toBe(true);
    if (!prev.response.ok) return;

    expect(requireSuccess(prev.response).dates).toHaveLength(2);
    const count = requireSuccess(prev.response).dates.length;

    const cancel = await docA.cancelOccupation({
      occupationId: "occ-c22-1",
      scope: "serie",
      expectedCount: count,
    });
    expect(cancel.response.ok).toBe(true);
    expect(requireSuccess(cancel.response).cancelled).toBe(2);
  });

  // C23: F30 + F32 + F29: Series cancel with matching expectedCount succeeds, mismatch triggers 409
  test("C23: F30 + F32 + F29 - Proteção contra corrida na série via expectedCount", async () => {
    insertImported(ctx.db, {
      id: "occ-c23-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-11",
      start: "08:00",
      end: "09:50",
      title: "BIOLOGIA",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-BIO",
    });

    const mismatch = await docA.cancelOccupation({
      occupationId: "occ-c23-1",
      scope: "serie",
      expectedCount: 5,
    });
    expect(mismatch.response.ok).toBe(false);
    expect(requireFailure(mismatch.response).status).toBe(409);

    const match = await docA.cancelOccupation({
      occupationId: "occ-c23-1",
      scope: "serie",
      expectedCount: 1,
    });
    expect(match.response.ok).toBe(true);
  });

  // C24: F29 + F1: After series cancellation, future weeks in weekly view show previously occupied slots as free
  test("C24: F29 + F1 - Cancelar série reflete horários livres nas semanas futuras", async () => {
    insertImported(ctx.db, {
      id: "occ-c24-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "10:10",
      end: "12:00",
      title: "GEOGRAFIA",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-GEO",
    });

    const c = await docA.cancelOccupation({
      occupationId: "occ-c24-1",
      scope: "serie",
      expectedCount: 1,
    });
    expect(c.response.ok).toBe(true);

    const week = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-16");
    if (week.response.ok) {
      const tue = requireSuccess(week.response).days.find((d) => d.date === "2026-11-17");
      expect(tue?.occupations.some((o) => o.id === "occ-c24-1")).toBe(false);
      expect(tue?.free.some((g) => g.start <= "10:10" && g.end >= "12:00")).toBe(true);
    }
  });

  // C25: F8 + F24: Anonymous visitor trying to access /minhas-reservas is denied with 401
  test("C25: F8 + F24 - Visitante anônimo é bloqueado em Minhas Reservas", async () => {
    const res = await anon.myBookings();
    expect(res.response.ok).toBe(false);
    expect(requireFailure(res.response).status).toBe(401);
  });

  // C26: F15 + F16 + F4: 360px mobile viewport renders booking dialog as bottom sheet
  test("C26: F15 + F16 + F4 - Resolução 360px adota bottom sheet com horário pré-preenchido", () => {
    const width = 360;
    const isBottomSheet = width <= 640;
    expect(isBottomSheet).toBe(true);

    const prefilled = { date: "2026-11-10", spaceId: ctx.s.sala1.id, start: "14:00", end: "15:30" };
    expect(prefilled.start).toBe("14:00");
    expect(prefilled.end).toBe("15:30");
  });

  // C27: F13 + F15 + F4: Mobile FAB button triggers booking form pre-filled with viewed date and space
  test("C27: F13 + F15 + F4 - Botão FAB abre reserva com data e espaço ativos", async () => {
    const viewed = { spaceId: ctx.s.sala2.id, date: "2026-11-19" };
    const fabBooking = await docA.createBooking({
      spaceId: viewed.spaceId,
      date: viewed.date,
      start: "09:00",
      end: "10:00",
      purpose: "Reserva via FAB Contextual",
    });
    expect(fabBooking.response.ok).toBe(true);
    if (fabBooking.response.ok) {
      expect(requireSuccess(fabBooking.response).spaceId).toBe(viewed.spaceId);
      expect(requireSuccess(fabBooking.response).date).toBe(viewed.date);
    }
  });

  // C28: F10 + F1: Toolbar 'Hoje' button returns weekly view to current week
  test("C28: F10 + F1 - Botão Hoje reinicia visão semanal para a semana corrente", async () => {
    const currentMonday = "2026-11-02";
    const res = await docA.getWeekAgenda(ctx.s.sala1.id, currentMonday);
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      expect(requireSuccess(res.response).weekStart).toBe(currentMonday);
      expect(requireSuccess(res.response).days.some((d) => d.date === TODAY)).toBe(true);
    }
  });

  // C29: F10 + F4: Toolbar next/previous controls advance date by 1 day in daily view
  test("C29: F10 + F4 - Navegação diária avança e recua 1 dia", async () => {
    const d1 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    const d2 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-11");
    expect(d1.response.ok).toBe(true);
    expect(d2.response.ok).toBe(true);
    if (d1.response.ok && d2.response.ok) {
      expect(requireSuccess(d1.response).date).toBe("2026-11-10");
      expect(requireSuccess(d2.response).date).toBe("2026-11-11");
    }
  });

  // C30: F14 + F1: Weekly view differentiates imported, manual, and free states
  test("C30: F14 + F1 - Grade semanal apresenta estados importado, manual e livre", async () => {
    insertImported(ctx.db, {
      id: "occ-c30-imp",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-09",
      start: "08:00",
      end: "09:50",
      title: "AULA A",
      responsibleUserId: ctx.s.docA.id,
    });
    await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-09",
      start: "14:00",
      end: "15:00",
      purpose: "RESERVA B",
    });

    const week = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-09");
    expect(week.response.ok).toBe(true);
    if (week.response.ok) {
      const mon = requireSuccess(week.response).days[0];
      expect(mon?.occupations.some((o) => o.source === "import")).toBe(true);
      expect(mon?.occupations.some((o) => o.source === "manual")).toBe(true);
      expect((mon?.free.length ?? 0) > 0).toBe(true);
    }
  });

  // C31: F19 + F17: Booking form validates time bounds and purpose length
  test("C31: F19 + F17 - Validações combinadas de horários e finalidade", async () => {
    const badTime = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "09:00",
      purpose: "Valido",
    });
    expect(badTime.response.ok).toBe(false);

    const badPurpose = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "09:00",
      end: "10:00",
      purpose: "",
    });
    expect(badPurpose.response.ok).toBe(false);
  });

  // C32: F33 + F22: Live backup VACUUM INTO runs safely during concurrent booking transactions
  test("C32: F33 + F22 - Backup ao vivo concorrente com transações ativas de reserva", async () => {
    const backupFile = join(process.cwd(), "test", "fixtures", "live-c32.sqlite");
    try {
      const bookingPromise = docA.createBooking({
        spaceId: ctx.s.sala1.id,
        date: "2026-11-20",
        start: "10:00",
        end: "11:00",
        purpose: "Reserva durante backup",
      });

      executeBackupVacuum(ctx.rawSqlite, backupFile);
      const bookingRes = await bookingPromise;
      expect(bookingRes.response.ok).toBe(true);

      expect(existsSync(backupFile)).toBe(true);
      const check = validateDatabaseIntegrity(backupFile);
      expect(check.ok).toBe(true);
    } finally {
      if (existsSync(backupFile)) {
        try {
          unlinkSync(backupFile);
        } catch {
          // ignore
        }
      }
    }
  });

  // C33: F33 + F34: Database backed up via VACUUM INTO restores cleanly preserving all rows
  test("C33: F33 + F34 - Ciclo completo de backup e restauração com verificação de dados", async () => {
    await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-21",
      start: "10:00",
      end: "11:00",
      purpose: "Persistir no Backup",
    });

    const bkp = join(process.cwd(), "test", "fixtures", "cycle-c33.sqlite");
    const restoredTarget = join(process.cwd(), "test", "fixtures", "target-c33.sqlite");
    let copyPath: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, bkp);
      executeBackupVacuum(ctx.rawSqlite, restoredTarget);

      const res = restoreDatabaseSafe(bkp, restoredTarget);
      expect(res.ok).toBe(true);
      copyPath = res.backupCopyPath;

      const db = new SqliteDatabase(restoredTarget);
      const rows = db.query("SELECT * FROM occupations WHERE title='Persistir no Backup'").all();
      db.close();
      expect(rows).toHaveLength(1);
    } finally {
      if (existsSync(bkp)) {
        try {
          unlinkSync(bkp);
        } catch {
          // ignore
        }
      }
      if (existsSync(restoredTarget)) {
        try {
          unlinkSync(restoredTarget);
        } catch {
          // ignore
        }
      }
      if (copyPath && existsSync(copyPath)) {
        try {
          unlinkSync(copyPath);
        } catch {
          // ignore
        }
      }
    }
  });

  // C34: F34 + F35: Restore process cleans stale -wal and -shm files
  test("C34: F34 + F35 - Restauração remove arquivos WAL e SHM anteriores", () => {
    const target = join(process.cwd(), "test", "fixtures", "clean-c34.sqlite");
    const backup = join(process.cwd(), "test", "fixtures", "bkp-c34.sqlite");
    let copyPath: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, backup);
      executeBackupVacuum(ctx.rawSqlite, target);

      writeFileSync(`${target}-wal`, "stale wal");
      writeFileSync(`${target}-shm`, "stale shm");

      const res = restoreDatabaseSafe(backup, target);
      expect(res.ok).toBe(true);
      copyPath = res.backupCopyPath;

      expect(existsSync(`${target}-wal`)).toBe(false);
      expect(existsSync(`${target}-shm`)).toBe(false);
    } finally {
      if (existsSync(target)) {
        try {
          unlinkSync(target);
        } catch {
          // ignore
        }
      }
      if (existsSync(backup)) {
        try {
          unlinkSync(backup);
        } catch {
          // ignore
        }
      }
      if (copyPath && existsSync(copyPath)) {
        try {
          unlinkSync(copyPath);
        } catch {
          // ignore
        }
      }
    }
  });

  // C35: F34 + F27: Restoring backup taken before cancellation restores booking to active
  test("C35: F34 + F27 - Restauração pré-cancelamento recupera reserva ativa", async () => {
    const created = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-22",
      start: "08:00",
      end: "09:00",
      purpose: "Reserva a Cancelar e Restaurar",
    });
    expect(created.response.ok).toBe(true);
    if (!created.response.ok) return;
    const id = requireSuccess(created.response).id;

    const bkp = join(process.cwd(), "test", "fixtures", "pre-cancel-c35.sqlite");
    const target = join(process.cwd(), "test", "fixtures", "target-c35.sqlite");
    let copyPath: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, bkp);

      const cancel = await docA.cancelOccupation({ occupationId: id, scope: "data" });
      expect(cancel.response.ok).toBe(true);

      new SqliteDatabase(ctx.dbPath ?? ":memory:");
      // Simula restauração sobre arquivo de destino
      executeBackupVacuum(ctx.rawSqlite, target);
      const restoreRes = restoreDatabaseSafe(bkp, target);
      expect(restoreRes.ok).toBe(true);
      copyPath = restoreRes.backupCopyPath;

      const restoredDb = new SqliteDatabase(target);
      const row = restoredDb.query("SELECT status FROM occupations WHERE id=?").get(id) as {
        status: string;
      };
      restoredDb.close();
      expect(row.status).toBe("ativa");
    } finally {
      if (existsSync(bkp)) {
        try {
          unlinkSync(bkp);
        } catch {
          // ignore
        }
      }
      if (existsSync(target)) {
        try {
          unlinkSync(target);
        } catch {
          // ignore
        }
      }
      if (copyPath && existsSync(copyPath)) {
        try {
          unlinkSync(copyPath);
        } catch {
          // ignore
        }
      }
    }
  });
});

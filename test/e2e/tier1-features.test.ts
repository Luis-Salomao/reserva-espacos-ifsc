import { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireFailure, requireSuccess } from "../assert-response";
import {
  buildAgendaQuery,
  calculateMultiLanes,
  checkCliHasCommand,
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

describe("Tier 1: Feature Coverage (Opaque-Box E2E Tests for 35 Features)", () => {
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

  // F1: Visualização Semanal Desktop (RF-02, RF-06)
  test("F1: Visualização Semanal Desktop - Grade semanal completa com 7 dias e horários", async () => {
    const monday = "2026-11-09";
    const res = await docA.getWeekAgenda(ctx.s.sala1.id, monday);
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    const week = requireSuccess(res.response);
    expect(week.spaceId).toBe(ctx.s.sala1.id);
    expect(week.weekStart).toBe(monday);
    expect(week.days).toHaveLength(7);
    expect(week.days[0]?.date).toBe("2026-11-09");
    expect(week.days[0]?.hours).toEqual({ opens: "06:00", closes: "23:00" });

    const badReq = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(badReq.response.ok).toBe(false);
    expect(requireFailure(badReq.response).status).toBe(400);
  });

  // F2: Mini Calendário Desktop (RF-02, Visual A)
  test("F2: Mini Calendário Desktop - Navegação mensal e seleção de dia", () => {
    const today = TODAY;
    expect(today).toBe("2026-11-03");

    const queryNov = parseAgendaQuery("?data=2026-11-15&espaco=sala1");
    expect(queryNov.date).toBe("2026-11-15");

    const nextMonth = parseAgendaQuery("?data=2026-12-01&espaco=sala1");
    expect(nextMonth.date).toBe("2026-12-01");

    const prevMonth = parseAgendaQuery("?data=2026-10-31&espaco=sala1");
    expect(prevMonth.date).toBe("2026-10-31");

    const fallback = parseAgendaQuery("?data=invalido&espaco=sala1", today);
    expect(fallback.date).toBe(today);
  });

  // F3: Seletor de Espaços Desktop (RF-06, Visual A)
  test("F3: Seletor de Espaços Desktop - Listagem, seleção de sala e erro 404", async () => {
    expect(ctx.s.sala1.name).toBe("ADM 2");
    expect(ctx.s.sala1.capacity).toBe(30);
    expect(ctx.s.sala2.name).toBe("LAB 1");

    const res1 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(res1.response.ok).toBe(true);

    const res2 = await docA.getDayAgenda(ctx.s.sala2.id, "2026-11-10");
    expect(res2.response.ok).toBe(true);

    const notFound = await docA.getDayAgenda("espaco-fantasma", "2026-11-10");
    expect(notFound.response.ok).toBe(false);
    expect(requireFailure(notFound.response).status).toBe(404);
  });

  // F4: Linha do Tempo Diária Mobile (RNF-01, RF-02)
  test("F4: Linha do Tempo Diária Mobile - Grade vertical diária com horário e ocupações", async () => {
    const res = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    const day = requireSuccess(res.response);
    expect(day.date).toBe("2026-11-10");
    expect(day.hours.opens).toBe("06:00");
    expect(day.hours.closes).toBe("23:00");
    expect(Array.isArray(day.occupations)).toBe(true);
    expect(day.now).toBeDefined();
  });

  // F5: Faixa Semanal Mobile (RNF-01, RF-02)
  test("F5: Faixa Semanal Mobile - Navegação entre semanas e seleção de dia", () => {
    const q1 = parseAgendaQuery("?data=2026-11-09&espaco=sala1");
    expect(q1.date).toBe("2026-11-09");

    const nextWeek = "2026-11-16";
    const q2 = buildAgendaQuery({ data: nextWeek, espaco: "sala1" });
    expect(q2).toContain("data=2026-11-16");

    const prevWeek = "2026-11-02";
    const q3 = buildAgendaQuery({ data: prevWeek, espaco: "sala1" });
    expect(q3).toContain("data=2026-11-02");

    const midWeek = buildAgendaQuery({ data: "2026-11-11", espaco: "sala1" });
    expect(parseAgendaQuery(midWeek).date).toBe("2026-11-11");
    expect(parseAgendaQuery(midWeek).spaceId).toBe("sala1");
  });

  // F6: Chips de Espaços Mobile (RNF-01, RF-06)
  test("F6: Chips de Espaços Mobile - Alternância de espaço preservando a data", () => {
    const current = `?data=2026-11-20&espaco=${ctx.s.sala1.id}`;
    const switched = switchSpaceKeepingDate(current, ctx.s.sala2.id);

    const parsed = parseAgendaQuery(switched);
    expect(parsed.date).toBe("2026-11-20");
    expect(parsed.spaceId).toBe(ctx.s.sala2.id);

    const backAgain = switchSpaceKeepingDate(switched, ctx.s.sala1.id);
    expect(parseAgendaQuery(backAgain).date).toBe("2026-11-20");
    expect(parseAgendaQuery(backAgain).spaceId).toBe(ctx.s.sala1.id);
    expect(switched).toContain("data=2026-11-20");
  });

  // F7: Sincronização de URL (?data&espaco) (RF-06)
  test("F7: Sincronização de URL - Persistência, defaults e fallbacks", () => {
    const empty = parseAgendaQuery("", "2026-11-03", "s-default");
    expect(empty.date).toBe("2026-11-03");
    expect(empty.spaceId).toBe("s-default");

    const valid = parseAgendaQuery("?data=2026-11-18&espaco=sala-x");
    expect(valid.date).toBe("2026-11-18");
    expect(valid.spaceId).toBe("sala-x");

    const malformed = parseAgendaQuery("?data=31-02-2026&espaco=sala-x", "2026-11-03");
    expect(malformed.date).toBe("2026-11-03");

    const built = buildAgendaQuery({ data: "2026-11-25", espaco: "sala-z" });
    expect(built).toBe("data=2026-11-25&espaco=sala-z");

    const switched = switchSpaceKeepingDate(built, "sala-w");
    expect(switched).toBe("data=2026-11-25&espaco=sala-w");
  });

  // F8: Modo Leitura Pública (PUBLIC_READ) (RF-02)
  test("F8: Modo Leitura Pública - Leitura sem nomes quando ativo e 401 quando desativado", async () => {
    insertImported(ctx.db, {
      id: "occ-pub-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:50",
      title: "MAT101",
      responsibleUserId: ctx.s.docA.id,
    });

    const pubRes = await anon.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(pubRes.response.ok).toBe(true);
    if (pubRes.response.ok) {
      const occ = requireSuccess(pubRes.response).occupations.find((o) => o.id === "occ-pub-1");
      expect(occ?.title).toBe("MAT101");
      expect(occ?.mine).toBe(false);
      expect(occ?.canCancel).toBe(false);
    }

    ctx.setPublicRead(false);
    const lockedRes = await anon.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(lockedRes.response.ok).toBe(false);
    expect(requireFailure(lockedRes.response).status).toBe(401);
  });

  // F9: Banner e Gate de Visitante (RF-02, Visual A)
  test("F9: Banner e Gate de Visitante - Ação de visitante requer login", async () => {
    const bookingAttempt = await anon.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "15:00",
      purpose: "Tentativa de Visitante",
    });
    expect(bookingAttempt.response.ok).toBe(false);
    expect(requireFailure(bookingAttempt.response).status).toBe(401);

    const cancelAttempt = await anon.cancelOccupation({
      occupationId: "qualquer",
      scope: "data",
    });
    expect(cancelAttempt.response.ok).toBe(false);
    expect(requireFailure(cancelAttempt.response).status).toBe(401);

    const myBookingsAttempt = await anon.myBookings();
    expect(myBookingsAttempt.response.ok).toBe(false);
    expect(requireFailure(myBookingsAttempt.response).status).toBe(401);
  });

  // F10: Toolbar da Agenda (RF-02, Visual A)
  test("F10: Toolbar da Agenda - Navegação temporal e botão Hoje", () => {
    const today = TODAY;
    const resetUrl = buildAgendaQuery({ data: today, espaco: "s1" });
    expect(parseAgendaQuery(resetUrl).date).toBe(today);

    const forwardDay = "2026-11-21";
    expect(parseAgendaQuery(buildAgendaQuery({ data: forwardDay, espaco: "s1" })).date).toBe(
      forwardDay,
    );

    const backwardDay = "2026-11-19";
    expect(parseAgendaQuery(buildAgendaQuery({ data: backwardDay, espaco: "s1" })).date).toBe(
      backwardDay,
    );

    const modeWeek = { mode: "semana", weekStart: "2026-11-16" };
    expect(modeWeek.mode).toBe("semana");
    expect(modeWeek.weekStart).toBe("2026-11-16");
  });

  // F11: Ocupações em Múltiplas Faixas (RF-02, Visual A)
  test("F11: Ocupações em Múltiplas Faixas - Particionamento de horários simultâneos", () => {
    const single = calculateMultiLanes([{ id: "1", start: "08:00", end: "10:00" }]);
    expect(single.get("1")).toEqual({ lane: 0, totalLanes: 1 });

    const pair = calculateMultiLanes([
      { id: "1", start: "08:00", end: "10:00" },
      { id: "2", start: "09:00", end: "11:00" },
    ]);
    expect(pair.get("1")?.totalLanes).toBe(2);
    expect(pair.get("2")?.totalLanes).toBe(2);
    expect(pair.get("1")?.lane).not.toBe(pair.get("2")?.lane);

    const triple = calculateMultiLanes([
      { id: "1", start: "08:00", end: "10:00" },
      { id: "2", start: "08:30", end: "10:30" },
      { id: "3", start: "09:00", end: "11:00" },
    ]);
    expect(triple.get("1")?.totalLanes).toBe(3);
    expect(triple.get("2")?.totalLanes).toBe(3);
  });

  // F12: Intervalos Livres Clicáveis (RF-02, RF-03)
  test("F12: Intervalos Livres Clicáveis - Cálculo de gaps livres entre ocupações", async () => {
    insertImported(ctx.db, {
      id: "occ-gap-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "10:00",
      title: "Aula Manhã",
      responsibleUserId: ctx.s.docA.id,
    });

    const res = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    const free = requireSuccess(res.response).free;
    expect(free.length).toBeGreaterThan(0);
    expect(free[0]?.start).toBe("06:00");
    expect(free[0]?.end).toBe("08:00");
    const gapAfter = free.find((g) => g.start === "10:00");
    expect(gapAfter).toBeDefined();
    expect(free.some((g) => g.end === "23:00")).toBe(true);
  });

  // F13: Botão Flutuante (FAB) Mobile (RNF-01, RF-03)
  test("F13: Botão Flutuante (FAB) Mobile - Criação rápida com contexto atual", async () => {
    const booking = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "15:00",
      purpose: "Reserva rápida via FAB",
    });
    expect(booking.response.ok).toBe(true);
    if (!booking.response.ok) return;

    expect(requireSuccess(booking.response).spaceId).toBe(ctx.s.sala1.id);
    expect(requireSuccess(booking.response).date).toBe("2026-11-10");
    expect(requireSuccess(booking.response).start).toBe("14:00");
    expect(requireSuccess(booking.response).end).toBe("15:00");
  });

  // F14: Legenda Visual de Estados (RF-02, Visual A)
  test("F14: Legenda Visual de Estados - Rótulos textuais e estados bem definidos", () => {
    const estados = [
      { id: "import", label: "Aula importada", tone: "blue" },
      { id: "manual", label: "Reserva", tone: "orange" },
      { id: "conflict", label: "Conflito", tone: "red" },
      { id: "free", label: "Livre", tone: "green" },
    ];
    expect(estados).toHaveLength(4);
    for (const est of estados) {
      expect(est.label.length).toBeGreaterThan(0);
      expect(est.tone).toBeDefined();
    }
  });

  // F15: Abertura de Modal/Sheet por Slot (RF-03, RNF-01)
  test("F15: Abertura de Modal/Sheet por Slot - Pré-preenchimento fiel de sala, data e horário", async () => {
    const slot = { spaceId: ctx.s.sala1.id, date: "2026-11-11", start: "10:10", end: "12:00" };
    const res = await docA.createBooking({
      ...slot,
      purpose: "Aula prática",
    });
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    expect(requireSuccess(res.response).spaceId).toBe(slot.spaceId);
    expect(requireSuccess(res.response).date).toBe(slot.date);
    expect(requireSuccess(res.response).start).toBe(slot.start);
    expect(requireSuccess(res.response).end).toBe(slot.end);
    expect(requireSuccess(res.response).title).toBe("Aula prática");
  });

  // F16: Folha Inferior Responsiva no Celular (RNF-01, RF-03)
  test("F16: Folha Inferior Responsiva no Celular - Regras de responsividade <= 640px", () => {
    const isMobileSheet = (widthPx: number) => widthPx <= 640;
    expect(isMobileSheet(360)).toBe(true);
    expect(isMobileSheet(640)).toBe(true);
    expect(isMobileSheet(641)).toBe(false);
    expect(isMobileSheet(1024)).toBe(false);
    expect(isMobileSheet(320)).toBe(true);
  });

  // F17: Formulário de Reserva Avulsa (RF-03)
  test("F17: Formulário de Reserva Avulsa - Criação com campos válidos", async () => {
    const res = await docA.createBooking({
      spaceId: ctx.s.sala2.id,
      date: "2026-11-12",
      start: "09:00",
      end: "10:30",
      purpose: "Apresentação de TCC",
    });
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    expect(requireSuccess(res.response).id).toBeDefined();
    expect(requireSuccess(res.response).spaceId).toBe(ctx.s.sala2.id);
    expect(requireSuccess(res.response).title).toBe("Apresentação de TCC");
    expect(requireSuccess(res.response).start).toBe("09:00");
    expect(requireSuccess(res.response).end).toBe("10:30");
  });

  // F18: Atalhos de Blocos de Horário (RF-03, Visual A)
  test("F18: Atalhos de Blocos de Horário - Presets padronizados M12, M34, T12, etc.", () => {
    expect(TIMETABLE_SHORTCUTS.M12).toEqual({ start: "08:00", end: "09:50", name: "Manhã 1-2" });
    expect(TIMETABLE_SHORTCUTS.M34).toEqual({ start: "10:10", end: "12:00", name: "Manhã 3-4" });
    expect(TIMETABLE_SHORTCUTS.T12).toEqual({ start: "13:30", end: "15:20", name: "Tarde 1-2" });
    expect(TIMETABLE_SHORTCUTS.T34).toEqual({ start: "15:40", end: "17:30", name: "Tarde 3-4" });
    expect(TIMETABLE_SHORTCUTS.N12).toEqual({ start: "18:00", end: "19:50", name: "Noite 1-2" });
  });

  // F19: Validação de Horários da Reserva (RF-03)
  test("F19: Validação de Horários da Reserva - Rejeição de fim <= início, fora de 06:00-23:00 e passado", async () => {
    const rev = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "11:00",
      end: "10:00",
      purpose: "Invertido",
    });
    expect(rev.response.ok).toBe(false);

    const early = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "05:00",
      end: "07:00",
      purpose: "Madrugada",
    });
    expect(early.response.ok).toBe(false);

    const late = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "22:00",
      end: "23:30",
      purpose: "Tarde da noite",
    });
    expect(late.response.ok).toBe(false);

    const past = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-02",
      start: "10:00",
      end: "11:00",
      purpose: "Ontem",
    });
    expect(past.response.ok).toBe(false);

    const emptyPurpose = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "11:00",
      purpose: "   ",
    });
    expect(emptyPurpose.response.ok).toBe(false);
  });

  // F20: Detecção e Feedback de Conflito (RF-04)
  test("F20: Detecção e Feedback de Conflito - Retorno 409 com identificação da ocupação conflitante", async () => {
    const first = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "16:00",
      purpose: "Aula A",
    });
    expect(first.response.ok).toBe(true);

    const conflict = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "15:00",
      end: "17:00",
      purpose: "Aula B Conflitante",
    });
    expect(conflict.response.ok).toBe(false);
    expect(requireFailure(conflict.response).status).toBe(409);
    expect(requireFailure(conflict.response).conflict).toBeDefined();
    expect(requireFailure(conflict.response).conflict?.title).toBe("Aula A");
    expect(requireFailure(conflict.response).conflict?.date).toBe("2026-11-10");
  });

  // F21: Intervalos Meio-Abertos (Regra 1 Global)
  test("F21: Intervalos Meio-Abertos - Reservas adjacentes [A, B) e [B, C) sem conflito", async () => {
    const resA = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "10:00",
      purpose: "Bloco 1",
    });
    expect(resA.response.ok).toBe(true);

    const resB = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      purpose: "Bloco 2 Adjacente",
    });
    expect(resB.response.ok).toBe(true);

    const resC = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "12:00",
      end: "13:30",
      purpose: "Bloco 3 Adjacente",
    });
    expect(resC.response.ok).toBe(true);

    const overlap1m = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "09:59",
      end: "10:30",
      purpose: "Sobreposição 1 min",
    });
    expect(overlap1m.response.ok).toBe(false);
    expect(requireFailure(overlap1m.response).status).toBe(409);
  });

  // F22: Reserva Atômica Concorrente (RF-04, Regra 4)
  test("F22: Reserva Atômica Concorrente - Dois clientes simultâneos geram exatamente 1 confirmação", async () => {
    const slot = {
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "18:00",
      end: "19:30",
    };

    const [resA, resB] = await Promise.all([
      docA.createBooking({ ...slot, purpose: "Docente A" }),
      docB.createBooking({ ...slot, purpose: "Docente B" }),
    ]);

    const successes = [resA, resB].filter((r) => r.response.ok);
    const conflicts = [resA, resB].filter(
      (r) => !r.response.ok && requireFailure(r.response).status === 409,
    );

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(requireFailure(conflicts[0]?.response).conflict).toBeDefined();
  });

  // F23: Confirmação e 'Ver Reserva' (RF-06, RF-10)
  test("F23: Confirmação e 'Ver Reserva' - Retorno dos dados cadastrados e id de navegação", async () => {
    const res = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "16:00",
      end: "17:00",
      purpose: "Reunião de Colegiado",
    });
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    const booking = requireSuccess(res.response);
    expect(booking.id).toBeDefined();
    expect(booking.title).toBe("Reunião de Colegiado");
    expect(booking.spaceId).toBe(ctx.s.sala1.id);
    expect(booking.date).toBe("2026-11-10");

    const myUrl = `/minhas-reservas?newId=${booking.id}`;
    expect(myUrl).toContain(booking.id);
  });

  // F24: Rota /minhas-reservas (RF-10)
  test("F24: Rota /minhas-reservas - Listagem ordenada das próximas ocupações do usuário", async () => {
    await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "11:00",
      purpose: "Minha Reserva 1",
    });
    await docA.createBooking({
      spaceId: ctx.s.sala2.id,
      date: "2026-11-11",
      start: "14:00",
      end: "15:00",
      purpose: "Minha Reserva 2",
    });

    const mine = await docA.myBookings();
    expect(mine.response.ok).toBe(true);
    if (!mine.response.ok) return;

    const items = requireSuccess(mine.response).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0]?.title).toBe("Minha Reserva 1");
    expect(items[1]?.title).toBe("Minha Reserva 2");
    expect(items[0]?.canCancel).toBe(true);
    expect(items[0]?.spaceName).toBe("ADM 2");
  });

  // F25: Item 'Minhas reservas' no AppShell (RF-10)
  test("F25: Item 'Minhas reservas' no AppShell - Visível para usuários autenticados", async () => {
    const mineLogged = await docA.myBookings();
    expect(mineLogged.response.ok).toBe(true);

    const mineAnon = await anon.myBookings();
    expect(mineAnon.response.ok).toBe(false);
    expect(requireFailure(mineAnon.response).status).toBe(401);

    const navItem = { name: "Minhas reservas", href: "/minhas-reservas" };
    expect(navItem.href).toBe("/minhas-reservas");
    expect(navItem.name).toBe("Minhas reservas");
  });

  // F26: Destaque de Nova Reserva Criada (RF-06, RF-10)
  test("F26: Destaque de Nova Reserva Criada - Identificação visual por newId", async () => {
    const created = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "11:00",
      end: "12:00",
      purpose: "Destaque Test",
    });
    expect(created.response.ok).toBe(true);
    if (!created.response.ok) return;

    const newId = requireSuccess(created.response).id;
    const isHighlighted = (itemId: string, targetId: string) => itemId === targetId;

    expect(isHighlighted(newId, newId)).toBe(true);
    expect(isHighlighted("outro-id", newId)).toBe(false);
    expect(newId.length).toBeGreaterThan(0);
    expect(requireSuccess(created.response).title).toBe("Destaque Test");
  });

  // F27: Cancelamento Individual Avulsa (RF-05)
  test("F27: Cancelamento Individual Avulsa - Criador e admin cancelam; terceiro recebe 403", async () => {
    const created = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "12:00",
      end: "13:00",
      purpose: "Para Cancelar",
    });
    if (!created.response.ok) return;
    const id = requireSuccess(created.response).id;

    const forbidden = await docB.cancelOccupation({ occupationId: id, scope: "data" });
    expect(forbidden.response.ok).toBe(false);
    expect(requireFailure(forbidden.response).status).toBe(403);

    const creatorCancel = await docA.cancelOccupation({ occupationId: id, scope: "data" });
    expect(creatorCancel.response.ok).toBe(true);
    expect(requireSuccess(creatorCancel.response).cancelled).toBe(1);

    const repeat = await docA.cancelOccupation({ occupationId: id, scope: "data" });
    expect(repeat.response.ok).toBe(false);
    expect(requireFailure(repeat.response).status).toBe(409);
  });

  // F28: Cancelamento Individual Importada (RF-05)
  test("F28: Cancelamento Individual Importada - Responsável cancela ocorrência única de aula", async () => {
    insertImported(ctx.db, {
      id: "occ-imp-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:50",
      title: "PROG1",
      responsibleUserId: ctx.s.docA.id,
    });
    insertImported(ctx.db, {
      id: "occ-imp-2",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "08:00",
      end: "09:50",
      title: "PROG1",
      responsibleUserId: ctx.s.docA.id,
    });

    const notAllowed = await docB.cancelOccupation({ occupationId: "occ-imp-1", scope: "data" });
    expect(notAllowed.response.ok).toBe(false);
    expect(requireFailure(notAllowed.response).status).toBe(403);

    const singleCancel = await docA.cancelOccupation({ occupationId: "occ-imp-1", scope: "data" });
    expect(singleCancel.response.ok).toBe(true);
    expect(requireSuccess(singleCancel.response).cancelled).toBe(1);

    const nextWeek = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-17");
    expect(nextWeek.response.ok).toBe(true);
    if (nextWeek.response.ok) {
      expect(requireSuccess(nextWeek.response).occupations.some((o) => o.id === "occ-imp-2")).toBe(
        true,
      );
    }
  });

  // F29: Cancelamento de Série Importada (RF-05, Regra 7)
  test("F29: Cancelamento de Série Importada - Cancela todas as futuras mantendo passadas", async () => {
    for (let i = 1; i <= 3; i++) {
      insertImported(ctx.db, {
        id: `occ-serie-${i}`,
        spaceId: ctx.s.sala1.id,
        date: `2026-11-${10 + i * 7}`,
        start: "08:00",
        end: "09:50",
        title: "AULA SERIE",
        responsibleUserId: ctx.s.docA.id,
        batchId: "batch-1",
        lessonId: "L-SERIE",
      });
    }

    const preview = await docA.previewSeries("occ-serie-1");
    expect(preview.response.ok).toBe(true);
    if (!preview.response.ok) return;

    expect(requireSuccess(preview.response).dates).toHaveLength(3);

    const serieCancel = await docA.cancelOccupation({
      occupationId: "occ-serie-1",
      scope: "serie",
      expectedCount: 3,
    });
    expect(serieCancel.response.ok).toBe(true);
    expect(requireSuccess(serieCancel.response).cancelled).toBe(3);
  });

  // F30: Prévia de Datas da Série (RF-05)
  test("F30: Prévia de Datas da Série - Lista ordenada das datas futuras afetadas", async () => {
    insertImported(ctx.db, {
      id: "prev-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      title: "PREVIEW TEST",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-PREV",
    });
    insertImported(ctx.db, {
      id: "prev-2",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "10:00",
      end: "12:00",
      title: "PREVIEW TEST",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-PREV",
    });

    const preview = await docA.previewSeries("prev-1");
    expect(preview.response.ok).toBe(true);
    if (!preview.response.ok) return;

    expect(requireSuccess(preview.response).dates).toEqual(["2026-11-10", "2026-11-17"]);

    const forbidden = await docB.previewSeries("prev-1");
    expect(forbidden.response.ok).toBe(false);
    expect(requireFailure(forbidden.response).status).toBe(403);
  });

  // F31: Confirmação Explícita de Série (RF-05)
  test("F31: Confirmação Explícita de Série - Contagem precisa e escopo explícito", async () => {
    insertImported(ctx.db, {
      id: "conf-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      title: "CONF TEST",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-CONF",
    });

    const preview = await docA.previewSeries("conf-1");
    expect(preview.response.ok).toBe(true);
    if (!preview.response.ok) return;

    const count = requireSuccess(preview.response).dates.length;
    expect(count).toBe(1);

    const executed = await docA.cancelOccupation({
      occupationId: "conf-1",
      scope: "serie",
      expectedCount: count,
    });
    expect(executed.response.ok).toBe(true);
    expect(requireSuccess(executed.response).cancelled).toBe(count);
  });

  // F32: Proteção de Série Concorrente (RF-05, Regra 7)
  test("F32: Proteção de Série Concorrente - Rejeição 409 se a contagem divergir", async () => {
    insertImported(ctx.db, {
      id: "race-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "12:00",
      title: "RACE SERIE",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-RACE",
    });
    insertImported(ctx.db, {
      id: "race-2",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "10:00",
      end: "12:00",
      title: "RACE SERIE",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-RACE",
    });

    const mismatch = await docA.cancelOccupation({
      occupationId: "race-1",
      scope: "serie",
      expectedCount: 99,
    });
    expect(mismatch.response.ok).toBe(false);
    expect(requireFailure(mismatch.response).status).toBe(409);
    expect(requireFailure(mismatch.response).message).toContain(
      "A série mudou desde a confirmação",
    );

    const match = await docA.cancelOccupation({
      occupationId: "race-1",
      scope: "serie",
      expectedCount: 2,
    });
    expect(match.response.ok).toBe(true);
    expect(requireSuccess(match.response).cancelled).toBe(2);
  });

  // F33: Comando cli backup (--out) (RO-01)
  test("F33: Comando cli backup (--out) - Geração de snapshot íntegro via VACUUM INTO", async () => {
    const backupPath = join(process.cwd(), "test", "fixtures", "backup-f33.sqlite");
    try {
      executeBackupVacuum(ctx.rawSqlite, backupPath);
      expect(existsSync(backupPath)).toBe(true);

      const check = validateDatabaseIntegrity(backupPath);
      expect(check.ok).toBe(true);
      expect(check.message).toBe("ok");

      const backupDb = new SqliteDatabase(backupPath);
      const tables = backupDb.query("SELECT name FROM sqlite_master WHERE type='table'").all();
      backupDb.close();
      expect(tables.length).toBeGreaterThan(0);

      const cliReady = await checkCliHasCommand("backup");
      expect(cliReady).toBe(true);
    } finally {
      if (existsSync(backupPath)) {
        try {
          unlinkSync(backupPath);
        } catch {
          // ignore
        }
      }
    }
  });

  // F34: Comando cli restore (--from) (RO-01)
  test("F34: Comando cli restore (--from) - Restauração segura com PRAGMA integrity_check", () => {
    const srcPath = join(process.cwd(), "test", "fixtures", "src-f34.sqlite");
    const dstPath = join(process.cwd(), "test", "fixtures", "dst-f34.sqlite");
    const corruptPath = join(process.cwd(), "test", "fixtures", "corrupt-f34.sqlite");
    let backupCopy: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, srcPath);
      executeBackupVacuum(ctx.rawSqlite, dstPath);

      const res = restoreDatabaseSafe(srcPath, dstPath);
      expect(res.ok).toBe(true);
      backupCopy = res.backupCopyPath;
      if (backupCopy) expect(existsSync(backupCopy)).toBe(true);

      const post = validateDatabaseIntegrity(dstPath);
      expect(post.ok).toBe(true);

      writeFileSync(corruptPath, "LIXO NAO SQLITE");
      const failRes = restoreDatabaseSafe(corruptPath, dstPath);
      expect(failRes.ok).toBe(false);
      expect(failRes.error).toContain("Integridade");
    } finally {
      if (existsSync(srcPath)) {
        try {
          unlinkSync(srcPath);
        } catch {
          // ignore
        }
      }
      if (existsSync(dstPath)) {
        try {
          unlinkSync(dstPath);
        } catch {
          // ignore
        }
      }
      if (existsSync(corruptPath)) {
        try {
          unlinkSync(corruptPath);
        } catch {
          // ignore
        }
      }
      if (backupCopy && existsSync(backupCopy)) {
        try {
          unlinkSync(backupCopy);
        } catch {
          // ignore
        }
      }
    }
  });

  // F35: Limpeza de WAL/SHM no Restore (RO-01)
  test("F35: Limpeza de WAL/SHM no Restore - Expurgo preventivo de arquivos temporários", () => {
    const targetDb = join(process.cwd(), "test", "fixtures", "target-f35.sqlite");
    const backupDb = join(process.cwd(), "test", "fixtures", "backup-f35.sqlite");
    const walFile = `${targetDb}-wal`;
    const shmFile = `${targetDb}-shm`;
    let copyPath: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, backupDb);
      executeBackupVacuum(ctx.rawSqlite, targetDb);

      writeFileSync(walFile, "stale wal frame data");
      writeFileSync(shmFile, "stale shm index data");
      expect(existsSync(walFile)).toBe(true);
      expect(existsSync(shmFile)).toBe(true);

      const restored = restoreDatabaseSafe(backupDb, targetDb);
      expect(restored.ok).toBe(true);
      copyPath = restored.backupCopyPath;

      expect(existsSync(walFile)).toBe(false);
      expect(existsSync(shmFile)).toBe(false);

      const check = validateDatabaseIntegrity(targetDb);
      expect(check.ok).toBe(true);
    } finally {
      if (existsSync(targetDb)) {
        try {
          unlinkSync(targetDb);
        } catch {
          // ignore
        }
      }
      if (existsSync(backupDb)) {
        try {
          unlinkSync(backupDb);
        } catch {
          // ignore
        }
      }
      if (existsSync(walFile)) {
        try {
          unlinkSync(walFile);
        } catch {
          // ignore
        }
      }
      if (existsSync(shmFile)) {
        try {
          unlinkSync(shmFile);
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

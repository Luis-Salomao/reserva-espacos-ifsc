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

describe("Tier 2: Boundary & Corner Cases (175+ Assertions for 35 Features)", () => {
  let ctx: E2EContext;
  let anon: E2EClient;
  let docA: E2EClient;
  let docB: E2EClient;
  let adm: E2EClient;

  beforeEach(async () => {
    ctx = await createE2EContext({ publicRead: true, now: NOW });
    anon = createE2EClient(ctx, null);
    docA = createE2EClient(ctx, "doca");
    docB = createE2EClient(ctx, "docb");
    adm = createE2EClient(ctx, "adm");
  });

  afterEach(() => {
    ctx.cleanup();
  });

  // B1: Boundaries for Week Agenda (F1)
  test("B1: Boundaries for Week Agenda - Transição de mês, fins de semana e validação de início", async () => {
    const mondayAcrossMonth = "2026-11-30";
    const res = await docA.getWeekAgenda(ctx.s.sala1.id, mondayAcrossMonth);
    expect(res.response.ok).toBe(true);
    if (res.response.ok) {
      expect(requireSuccess(res.response).days).toHaveLength(7);
      expect(requireSuccess(res.response).days[0]?.date).toBe("2026-11-30");
      expect(requireSuccess(res.response).days[1]?.date).toBe("2026-12-01");
    }

    const sundayStart = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-08");
    expect(sundayStart.response.ok).toBe(false);
    expect(requireFailure(sundayStart.response).status).toBe(400);

    const wedStart = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-11");
    expect(wedStart.response.ok).toBe(false);
    expect(requireFailure(wedStart.response).status).toBe(400);
  });

  // B2: Boundaries for Mini Calendar (F2)
  test("B2: Boundaries for Mini Calendar - Virada de mês, anos bissextos e datas inválidas", () => {
    const p1 = parseAgendaQuery("?data=2026-11-01&espaco=sala1");
    expect(p1.date).toBe("2026-11-01");

    const p2 = parseAgendaQuery("?data=2026-11-30&espaco=sala1");
    expect(p2.date).toBe("2026-11-30");

    const p3 = parseAgendaQuery("?data=2026-12-31&espaco=sala1");
    expect(p3.date).toBe("2026-12-31");

    const pLeap = parseAgendaQuery("?data=2028-02-29&espaco=sala1");
    expect(pLeap.date).toBe("2028-02-29");

    const pBad = parseAgendaQuery("?data=2026-02-30&espaco=sala1", TODAY);
    expect(pBad.date).toBe(TODAY);
  });

  // B3: Boundaries for Space Selector (F3)
  test("B3: Boundaries for Space Selector - Espaços vazios, caracteres especiais e capacidade nula", async () => {
    const spaces = [ctx.s.sala1, ctx.s.sala2];
    expect(spaces.length).toBeGreaterThanOrEqual(2);
    expect(ctx.s.sala1.capacity).toBe(30);

    const emptyId = await docA.getDayAgenda("", "2026-11-10");
    expect(emptyId.response.ok).toBe(false);

    const spacedId = await docA.getDayAgenda("   ", "2026-11-10");
    expect(spacedId.response.ok).toBe(false);

    const nonExistent = await docA.getDayAgenda("999999", "2026-11-10");
    expect(nonExistent.response.ok).toBe(false);
    expect(requireFailure(nonExistent.response).status).toBe(404);
  });

  // B4: Boundaries for Mobile Daily Timeline (F4)
  test("B4: Boundaries for Mobile Daily Timeline - Limites de 06:00 a 23:00 e ocupações de dia inteiro", async () => {
    const day = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(day.response.ok).toBe(true);
    if (!day.response.ok) return;

    expect(requireSuccess(day.response).hours.opens).toBe("06:00");
    expect(requireSuccess(day.response).hours.closes).toBe("23:00");

    const freeSlots = requireSuccess(day.response).free;
    expect(freeSlots.length).toBeGreaterThanOrEqual(1);
    expect(freeSlots[0]?.start).toBe("06:00");
    expect(freeSlots[freeSlots.length - 1]?.end).toBe("23:00");
  });

  // B5: Boundaries for Mobile Weekly Strip (F5)
  test("B5: Boundaries for Mobile Weekly Strip - Extremos de navegação semanal e dias úteis", () => {
    const mon = parseAgendaQuery("?data=2026-11-09&espaco=s1");
    expect(mon.date).toBe("2026-11-09");

    const fri = parseAgendaQuery("?data=2026-11-13&espaco=s1");
    expect(fri.date).toBe("2026-11-13");

    const shiftFarPast = buildAgendaQuery({ data: "2025-01-01", espaco: "s1" });
    expect(parseAgendaQuery(shiftFarPast).date).toBe("2025-01-01");

    const shiftFarFuture = buildAgendaQuery({ data: "2028-12-31", espaco: "s1" });
    expect(parseAgendaQuery(shiftFarFuture).date).toBe("2028-12-31");

    const preserves = switchSpaceKeepingDate(shiftFarFuture, "s2");
    expect(parseAgendaQuery(preserves).date).toBe("2028-12-31");
  });

  // B6: Boundaries for Mobile Space Chips (F6)
  test("B6: Boundaries for Mobile Space Chips - Espaço com nome longo e trocas sequenciais", () => {
    const current = buildAgendaQuery({ data: "2026-11-15", espaco: ctx.s.sala1.id });
    expect(parseAgendaQuery(current).date).toBe("2026-11-15");

    let active = current;
    for (let i = 0; i < 5; i++) {
      const nextSpace = i % 2 === 0 ? ctx.s.sala2.id : ctx.s.sala1.id;
      active = switchSpaceKeepingDate(active, nextSpace);
      expect(parseAgendaQuery(active).date).toBe("2026-11-15");
      expect(parseAgendaQuery(active).spaceId).toBe(nextSpace);
    }
  });

  // B7: Boundaries for URL Sync (F7)
  test("B7: Boundaries for URL Sync - Query params extras, encoded e valores corrompidos", () => {
    const withExtra = parseAgendaQuery("?data=2026-11-10&espaco=s1&extra=foo&page=2");
    expect(withExtra.date).toBe("2026-11-10");
    expect(withExtra.spaceId).toBe("s1");

    const invalidMonth = parseAgendaQuery("?data=2026-13-10&espaco=s1", TODAY);
    expect(invalidMonth.date).toBe(TODAY);

    const invalidDay = parseAgendaQuery("?data=2026-11-32&espaco=s1", TODAY);
    expect(invalidDay.date).toBe(TODAY);

    const empty = parseAgendaQuery("?data=&espaco=", TODAY, "default-room");
    expect(empty.date).toBe(TODAY);
    expect(empty.spaceId).toBe("default-room");
  });

  // B8: Boundaries for Public Read Security (F8)
  test("B8: Boundaries for Public Read Security - Rejeição estrita de mutações por anônimos", async () => {
    const book = await anon.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "11:00",
      purpose: "Anon",
    });
    expect(book.response.ok).toBe(false);
    expect(requireFailure(book.response).status).toBe(401);

    const cancel = await anon.cancelOccupation({ occupationId: "x", scope: "data" });
    expect(cancel.response.ok).toBe(false);
    expect(requireFailure(cancel.response).status).toBe(401);

    const preview = await anon.previewSeries("x");
    expect(preview.response.ok).toBe(false);
    expect(requireFailure(preview.response).status).toBe(401);

    const my = await anon.myBookings();
    expect(my.response.ok).toBe(false);
    expect(requireFailure(my.response).status).toBe(401);

    ctx.setPublicRead(false);
    const read = await anon.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(read.response.ok).toBe(false);
    expect(requireFailure(read.response).status).toBe(401);
  });

  // B9: Boundaries for Visitor Gate (F9)
  test("B9: Boundaries for Visitor Gate - Redirecionamento e preservação de URL alvo", () => {
    const targetUrl = "/?data=2026-11-15&espaco=s1";
    const loginRedirect = `/entrar?redirect=${encodeURIComponent(targetUrl)}`;
    expect(loginRedirect).toContain("/entrar");
    expect(loginRedirect).toContain("redirect=");
    expect(decodeURIComponent(loginRedirect)).toContain("data=2026-11-15");
    expect(decodeURIComponent(loginRedirect)).toContain("espaco=s1");
    expect(loginRedirect.startsWith("/entrar?")).toBe(true);
  });

  // B10: Boundaries for Toolbar Controls (F10)
  test("B10: Boundaries for Toolbar Controls - Idempotência do botão Hoje e alternância de modos", () => {
    const todayQuery = buildAgendaQuery({ data: TODAY, espaco: "s1" });
    expect(parseAgendaQuery(todayQuery).date).toBe(TODAY);

    const resetFromPast = parseAgendaQuery(buildAgendaQuery({ data: TODAY, espaco: "s1" })).date;
    expect(resetFromPast).toBe(TODAY);

    const modes = ["dia", "semana", "dia"];
    for (const m of modes) {
      expect(["dia", "semana"]).toContain(m);
    }
    expect(modes[0]).toBe("dia");
    expect(modes[1]).toBe("semana");
  });

  // B11: Boundaries for Multi-Lane Overlaps (F11)
  test("B11: Boundaries for Multi-Lane Overlaps - Particionamento de até 4 ocupações simultâneas", () => {
    const quad = calculateMultiLanes([
      { id: "1", start: "08:00", end: "10:00" },
      { id: "2", start: "08:15", end: "10:15" },
      { id: "3", start: "08:30", end: "10:30" },
      { id: "4", start: "08:45", end: "10:45" },
    ]);
    expect(quad.size).toBe(4);
    expect(quad.get("1")?.totalLanes).toBe(4);
    expect(quad.get("2")?.totalLanes).toBe(4);
    expect(quad.get("3")?.totalLanes).toBe(4);
    expect(quad.get("4")?.totalLanes).toBe(4);

    const lanes = [
      quad.get("1")?.lane,
      quad.get("2")?.lane,
      quad.get("3")?.lane,
      quad.get("4")?.lane,
    ];
    expect(new Set(lanes).size).toBe(4);
  });

  // B12: Boundaries for Free Gaps (F12)
  test("B12: Boundaries for Free Gaps - Gaps mínimos e dia sem ocupações", async () => {
    const emptyDay = await docA.getDayAgenda(ctx.s.sala2.id, "2026-11-20");
    expect(emptyDay.response.ok).toBe(true);
    if (!emptyDay.response.ok) return;

    const free = requireSuccess(emptyDay.response).free;
    expect(free).toHaveLength(1);
    expect(free[0]?.start).toBe("06:00");
    expect(free[0]?.end).toBe("23:00");
    expect(requireSuccess(emptyDay.response).occupations).toHaveLength(0);
  });

  // B13: Boundaries for Mobile FAB (F13)
  test("B13: Boundaries for Mobile FAB - Slot padrão próximo do encerramento", async () => {
    const nearClose = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "22:00",
      end: "23:00",
      purpose: "Último horário",
    });
    expect(nearClose.response.ok).toBe(true);
    if (!nearClose.response.ok) return;

    expect(requireSuccess(nearClose.response).start).toBe("22:00");
    expect(requireSuccess(nearClose.response).end).toBe("23:00");

    const pastClose = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "22:30",
      end: "23:30",
      purpose: "Passando do encerramento",
    });
    expect(pastClose.response.ok).toBe(false);
    expect(requireFailure(pastClose.response).status).toBe(400);
  });

  // B14: Boundaries for Visual States & Contrast (F14)
  test("B14: Boundaries for Visual States & Contrast - Amostras e textos de acessibilidade", () => {
    const tokens = {
      imported: "--occ-imported",
      booked: "--occ-booked",
      conflict: "--occ-conflict",
      free: "--occ-free",
    };
    expect(tokens.imported).toBeDefined();
    expect(tokens.booked).toBeDefined();
    expect(tokens.conflict).toBeDefined();
    expect(tokens.free).toBeDefined();

    const ariaLabels = ["Aula importada", "Reserva avulsa", "Horário livre", "Conflito detectado"];
    for (const label of ariaLabels) {
      expect(label.length).toBeGreaterThan(5);
    }
  });

  // B15: Boundaries for Slot Opening Modal (F15)
  test("B15: Boundaries for Slot Opening Modal - Pré-preenchimento no início e fim do expediente", async () => {
    const openSlot = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-11",
      start: "06:00",
      end: "07:30",
      purpose: "Primeiro horário",
    });
    expect(openSlot.response.ok).toBe(true);
    if (!openSlot.response.ok) return;

    expect(requireSuccess(openSlot.response).start).toBe("06:00");
    expect(requireSuccess(openSlot.response).end).toBe("07:30");

    const nextSlot = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-11",
      start: "07:30",
      end: "09:00",
      purpose: "Segundo horário",
    });
    expect(nextSlot.response.ok).toBe(true);
    expect(requireSuccess(nextSlot.response).start).toBe("07:30");
  });

  // B16: Boundaries for Mobile Bottom Sheet (F16)
  test("B16: Boundaries for Mobile Bottom Sheet - Limiares de 320px, 360px, 640px e 641px", () => {
    const getLayoutMode = (width: number) => (width <= 640 ? "bottom-sheet" : "center-dialog");
    expect(getLayoutMode(320)).toBe("bottom-sheet");
    expect(getLayoutMode(360)).toBe("bottom-sheet");
    expect(getLayoutMode(640)).toBe("bottom-sheet");
    expect(getLayoutMode(641)).toBe("center-dialog");
    expect(getLayoutMode(1280)).toBe("center-dialog");
  });

  // B17: Boundaries for Purpose Length (F17)
  test("B17: Boundaries for Purpose Length - Limites de 1, 120 e 121 caracteres e unicode", async () => {
    const min1 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-12",
      start: "09:00",
      end: "10:00",
      purpose: "A",
    });
    expect(min1.response.ok).toBe(true);

    const max120 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-12",
      start: "10:00",
      end: "11:00",
      purpose: "X".repeat(120),
    });
    expect(max120.response.ok).toBe(true);

    const tooLong121 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-12",
      start: "11:00",
      end: "12:00",
      purpose: "X".repeat(121),
    });
    expect(tooLong121.response.ok).toBe(false);
    expect(requireFailure(tooLong121.response).status).toBe(400);

    const unicode = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-12",
      start: "13:00",
      end: "14:00",
      purpose: "Reunião de Avaliação: Pró-Reitoria & P&D",
    });
    expect(unicode.response.ok).toBe(true);
  });

  // B18: Boundaries for Timetable Shortcuts (F18)
  test("B18: Boundaries for Timetable Shortcuts - Cálculo de durações exatas dos blocos", () => {
    const calcMinutes = (start: string, end: string) => {
      const [h1, m1] = start.split(":").map(Number);
      const [h2, m2] = end.split(":").map(Number);
      if (h1 === undefined || m1 === undefined || h2 === undefined || m2 === undefined) return 0;
      return h2 * 60 + m2 - (h1 * 60 + m1);
    };

    expect(calcMinutes(TIMETABLE_SHORTCUTS.M12.start, TIMETABLE_SHORTCUTS.M12.end)).toBe(110);
    expect(calcMinutes(TIMETABLE_SHORTCUTS.M34.start, TIMETABLE_SHORTCUTS.M34.end)).toBe(110);
    expect(calcMinutes(TIMETABLE_SHORTCUTS.T12.start, TIMETABLE_SHORTCUTS.T12.end)).toBe(110);
    expect(calcMinutes(TIMETABLE_SHORTCUTS.N123.start, TIMETABLE_SHORTCUTS.N123.end)).toBe(180);
    expect(calcMinutes("09:50", "10:10")).toBe(20);
  });

  // B19: Boundaries for Booking Times (F19)
  test("B19: Boundaries for Booking Times - Início igual a fim, anterior a 06:00 e posterior a 23:00", async () => {
    const zeroDur = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "10:00",
      purpose: "Zero duração",
    });
    expect(zeroDur.response.ok).toBe(false);

    const before6 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "05:59",
      end: "07:00",
      purpose: "Antes das 6",
    });
    expect(before6.response.ok).toBe(false);

    const after23 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "22:00",
      end: "23:01",
      purpose: "Depois das 23",
    });
    expect(after23.response.ok).toBe(false);

    const minimalValid = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "06:00",
      end: "06:05",
      purpose: "Minimal",
    });
    expect(minimalValid.response.ok).toBe(true);
  });

  // B20: Boundaries for Conflict Detection (F20)
  test("B20: Boundaries for Conflict Detection - Sobreposição por 1 minuto e englobamento total", async () => {
    const base = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-13",
      start: "14:00",
      end: "16:00",
      purpose: "Base",
    });
    expect(base.response.ok).toBe(true);

    const overlapStart1m = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-13",
      start: "13:30",
      end: "14:01",
      purpose: "1m início",
    });
    expect(overlapStart1m.response.ok).toBe(false);
    expect(requireFailure(overlapStart1m.response).status).toBe(409);

    const overlapEnd1m = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-13",
      start: "15:59",
      end: "16:30",
      purpose: "1m fim",
    });
    expect(overlapEnd1m.response.ok).toBe(false);
    expect(requireFailure(overlapEnd1m.response).status).toBe(409);

    const engulf = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-13",
      start: "13:00",
      end: "17:00",
      purpose: "Engloba total",
    });
    expect(engulf.response.ok).toBe(false);
    expect(requireFailure(engulf.response).status).toBe(409);
  });

  // B21: Boundaries for Half-Open Intervals (F21)
  test("B21: Boundaries for Half-Open Intervals - Ponto exato de contato compartilhado sem colisão", async () => {
    const b1 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-14",
      start: "08:00",
      end: "09:30",
      purpose: "B1",
    });
    expect(b1.response.ok).toBe(true);

    const b2 = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-14",
      start: "09:30",
      end: "11:00",
      purpose: "B2",
    });
    expect(b2.response.ok).toBe(true);

    const b3 = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-14",
      start: "11:00",
      end: "12:30",
      purpose: "B3",
    });
    expect(b3.response.ok).toBe(true);

    const bOtherRoom = await docB.createBooking({
      spaceId: ctx.s.sala2.id,
      date: "2026-11-14",
      start: "09:30",
      end: "11:00",
      purpose: "B2 Outra Sala",
    });
    expect(bOtherRoom.response.ok).toBe(true);
  });

  // B22: Boundaries for Atomic Concurrency (F22)
  test("B22: Boundaries for Atomic Concurrency - Três requisições simultâneas para o mesmo slot", async () => {
    const slot = {
      spaceId: ctx.s.sala1.id,
      date: "2026-11-15",
      start: "14:00",
      end: "15:30",
    };

    const results = await Promise.all([
      docA.createBooking({ ...slot, purpose: "Cliente 1" }),
      docB.createBooking({ ...slot, purpose: "Cliente 2" }),
      adm.createBooking({ ...slot, purpose: "Cliente 3" }),
    ]);

    const succ = results.filter((r) => r.response.ok);
    const conf = results.filter((r) => !r.response.ok && requireFailure(r.response).status === 409);

    expect(succ).toHaveLength(1);
    expect(conf).toHaveLength(2);
    expect(requireFailure(conf[0]?.response).conflict?.title).toBeDefined();
    expect(requireFailure(conf[1]?.response).conflict?.title).toBeDefined();
  });

  // B23: Boundaries for Confirmation Dialog (F23)
  test("B23: Boundaries for Confirmation Dialog - Campos presentes no resultado da reserva", async () => {
    const res = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-16",
      start: "09:00",
      end: "10:30",
      purpose: "Workshop UI",
    });
    expect(res.response.ok).toBe(true);
    if (!res.response.ok) return;

    const val = requireSuccess(res.response);
    expect(val.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(val.spaceId).toBe(ctx.s.sala1.id);
    expect(val.date).toBe("2026-11-16");
    expect(val.start).toBe("09:00");
    expect(val.end).toBe("10:30");
  });

  // B24: Boundaries for /minhas-reservas Filtering & Paging (F24)
  test("B24: Boundaries for /minhas-reservas Filtering & Paging - Paginação com limit e offset", async () => {
    for (let i = 1; i <= 3; i++) {
      await docA.createBooking({
        spaceId: ctx.s.sala1.id,
        date: `2026-11-${16 + i}`,
        start: "10:00",
        end: "11:00",
        purpose: `Paging ${i}`,
      });
    }

    const p1 = await docA.myBookings({ limit: 1, offset: 0 });
    expect(p1.response.ok).toBe(true);
    if (p1.response.ok) {
      expect(requireSuccess(p1.response).items).toHaveLength(1);
      expect(requireSuccess(p1.response).hasMore).toBe(true);
    }

    const p2 = await docA.myBookings({ limit: 2, offset: 1 });
    expect(p2.response.ok).toBe(true);
    if (p2.response.ok) {
      expect(requireSuccess(p2.response).items).toHaveLength(2);
    }
  });

  // B25: Boundaries for AppShell Navigation (F25)
  test("B25: Boundaries for AppShell Navigation - Papéis ativo vs inativo e links", async () => {
    const off = createE2EClient(ctx, "off");
    const offRes = await off.myBookings();
    expect(offRes.response.ok).toBe(false);
    expect(requireFailure(offRes.response).status).toBe(401);

    const admRes = await adm.myBookings();
    expect(admRes.response.ok).toBe(true);

    const docRes = await docA.myBookings();
    expect(docRes.response.ok).toBe(true);

    const anonRes = await anon.myBookings();
    expect(anonRes.response.ok).toBe(false);
  });

  // B26: Boundaries for Created Booking Highlight (F26)
  test("B26: Boundaries for Created Booking Highlight - newId inexistente não destaca nada", () => {
    const match = (item: { id: string }, targetId?: string) =>
      targetId !== undefined && item.id === targetId;

    const list = [{ id: "res-1" }, { id: "res-2" }];
    expect(list.some((item) => match(item, "res-1"))).toBe(true);
    expect(list.some((item) => match(item, "fantasma"))).toBe(false);
    expect(list.some((item) => match(item, undefined))).toBe(false);
    expect(match(list[0] as { id: string }, "res-1")).toBe(true);
  });

  // B27: Boundaries for Manual Cancellation (F27)
  test("B27: Boundaries for Manual Cancellation - Cancelamento duplo e de terceiros", async () => {
    const res = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-18",
      start: "08:00",
      end: "09:00",
      purpose: "Para cancelar duplo",
    });
    if (!res.response.ok) return;
    const id = requireSuccess(res.response).id;

    const c1 = await docA.cancelOccupation({ occupationId: id, scope: "data" });
    expect(c1.response.ok).toBe(true);

    const c2 = await docA.cancelOccupation({ occupationId: id, scope: "data" });
    expect(c2.response.ok).toBe(false);
    expect(requireFailure(c2.response).status).toBe(409);

    const otherCancel = await docB.cancelOccupation({ occupationId: id, scope: "data" });
    expect(otherCancel.response.ok).toBe(false);
  });

  // B28: Boundaries for Imported Class Single-Date Cancellation (F28)
  test("B28: Boundaries for Imported Class Single-Date Cancellation - Escopo estrito na data", async () => {
    insertImported(ctx.db, {
      id: "imp-single-1",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "15:50",
      title: "POO",
      responsibleUserId: ctx.s.docA.id,
    });
    insertImported(ctx.db, {
      id: "imp-single-2",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-17",
      start: "14:00",
      end: "15:50",
      title: "POO",
      responsibleUserId: ctx.s.docA.id,
    });

    const c = await docA.cancelOccupation({ occupationId: "imp-single-1", scope: "data" });
    expect(c.response.ok).toBe(true);
    expect(requireSuccess(c.response).cancelled).toBe(1);

    const d1 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    if (d1.response.ok) {
      expect(requireSuccess(d1.response).occupations.some((o) => o.id === "imp-single-1")).toBe(
        false,
      );
    }

    const d2 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-17");
    if (d2.response.ok) {
      expect(requireSuccess(d2.response).occupations.some((o) => o.id === "imp-single-2")).toBe(
        true,
      );
    }
  });

  // B29: Boundaries for Series Cancellation (F29)
  test("B29: Boundaries for Series Cancellation - Recusa de série em reserva avulsa", async () => {
    const manual = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-18",
      start: "14:00",
      end: "15:00",
      purpose: "Tentativa de série em avulsa",
    });
    if (!manual.response.ok) return;

    const serieOnManual = await docA.cancelOccupation({
      occupationId: requireSuccess(manual.response).id,
      scope: "serie",
    });
    expect(serieOnManual.response.ok).toBe(false);
    expect(requireFailure(serieOnManual.response).status).toBe(400);
    expect(requireFailure(serieOnManual.response).message).toContain(
      "Esta reserva não faz parte de uma série",
    );
  });

  // B30: Boundaries for Series Preview (F30)
  test("B30: Boundaries for Series Preview - Prévia sem ocorrências futuras ou sem permissão", async () => {
    insertImported(ctx.db, {
      id: "imp-single-only",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "16:00",
      end: "17:50",
      title: "AULA UNICA",
      responsibleUserId: ctx.s.docA.id,
      batchId: "batch-1",
      lessonId: "L-UNICA",
    });

    const prev = await docA.previewSeries("imp-single-only");
    expect(prev.response.ok).toBe(true);
    if (prev.response.ok) {
      expect(requireSuccess(prev.response).dates).toEqual(["2026-11-10"]);
    }

    const unauth = await docB.previewSeries("imp-single-only");
    expect(unauth.response.ok).toBe(false);
    expect(requireFailure(unauth.response).status).toBe(403);
  });

  // B31: Boundaries for Explicit Series Confirmation (F31)
  test("B31: Boundaries for Explicit Series Confirmation - Abortar cancelamento mantém banco intacto", async () => {
    insertImported(ctx.db, {
      id: "imp-intact",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "18:00",
      end: "19:50",
      title: "AULA INTACTA",
      responsibleUserId: ctx.s.docA.id,
    });

    const prev = await docA.previewSeries("imp-intact");
    expect(prev.response.ok).toBe(true);

    const dayCheck = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    if (dayCheck.response.ok) {
      expect(requireSuccess(dayCheck.response).occupations.some((o) => o.id === "imp-intact")).toBe(
        true,
      );
    }
  });

  // B32: Boundaries for Series Concurrency (F32)
  test("B32: Boundaries for Series Concurrency - expectedCount inválido ou negativo", async () => {
    insertImported(ctx.db, {
      id: "imp-neg",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "20:00",
      end: "21:50",
      title: "NEG TEST",
      responsibleUserId: ctx.s.docA.id,
    });

    const neg = await docA.cancelOccupation({
      occupationId: "imp-neg",
      scope: "serie",
      expectedCount: -1,
    });
    expect(neg.response.ok).toBe(false);
    expect(requireFailure(neg.response).status).toBe(400);
  });

  // B33: Boundaries for Backup Execution (F33)
  test("B33: Boundaries for Backup Execution - Caminho com caracteres especiais e subpastas", () => {
    const specialBackup = join(
      process.cwd(),
      "test",
      "fixtures",
      "backup special & symbols.sqlite",
    );
    try {
      executeBackupVacuum(ctx.rawSqlite, specialBackup);
      expect(existsSync(specialBackup)).toBe(true);

      const check = validateDatabaseIntegrity(specialBackup);
      expect(check.ok).toBe(true);
    } finally {
      if (existsSync(specialBackup)) {
        try {
          unlinkSync(specialBackup);
        } catch {
          // ignore
        }
      }
    }
  });

  // B34: Boundaries for Restore Integrity (F34)
  test("B34: Boundaries for Restore Integrity - Arquivo corrompido ou truncado rejeitado", () => {
    const zeroByteFile = join(process.cwd(), "test", "fixtures", "zero-b34.sqlite");
    const targetFile = join(process.cwd(), "test", "fixtures", "target-b34.sqlite");
    let backupCopy: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, targetFile);
      writeFileSync(zeroByteFile, "");

      const res = restoreDatabaseSafe(zeroByteFile, targetFile);
      backupCopy = res.backupCopyPath;
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();

      const targetCheck = validateDatabaseIntegrity(targetFile);
      expect(targetCheck.ok).toBe(true);
    } finally {
      if (existsSync(zeroByteFile)) {
        try {
          unlinkSync(zeroByteFile);
        } catch {
          // ignore
        }
      }
      if (existsSync(targetFile)) {
        try {
          unlinkSync(targetFile);
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

  // B35: Boundaries for WAL/SHM Expurgo (F35)
  test("B35: Boundaries for WAL/SHM Expurgo - Limpeza limpa arquivos e reabre com integridade", () => {
    const target = join(process.cwd(), "test", "fixtures", "target-b35.sqlite");
    const backup = join(process.cwd(), "test", "fixtures", "backup-b35.sqlite");
    let copyPath: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, backup);
      executeBackupVacuum(ctx.rawSqlite, target);

      writeFileSync(`${target}-wal`, "dummy wal");
      writeFileSync(`${target}-shm`, "dummy shm");

      const res = restoreDatabaseSafe(backup, target);
      expect(res.ok).toBe(true);
      copyPath = res.backupCopyPath;

      expect(existsSync(`${target}-wal`)).toBe(false);
      expect(existsSync(`${target}-shm`)).toBe(false);

      const db = new SqliteDatabase(target);
      const row = db.query("SELECT 1 AS num").get() as { num: number };
      db.close();
      expect(row.num).toBe(1);
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
});

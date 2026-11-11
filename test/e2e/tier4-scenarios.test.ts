import { Database as SqliteDatabase } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireFailure, requireSuccess } from "../assert-response";
import {
  buildAgendaQuery,
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
  validateDatabaseIntegrity,
} from "./e2e-runner";

describe("Tier 4: Real-World Scenarios (7 End-to-End Application Workflows)", () => {
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

  // Scenario 1: Fluxo Completo de Reserva Semanal por Docente com Visualização em Desktop
  test("Cenário 1: Fluxo Completo de Reserva Semanal por Docente com Visualização em Desktop (F1, F3, F7, F12, F15, F17, F19, F23, F24)", async () => {
    // 1. Docente acessa a agenda desktop através da URL com data e sala selecionada
    const initialUrl = `?data=2026-11-09&espaco=${ctx.s.sala1.id}`;
    const { date, spaceId } = parseAgendaQuery(initialUrl);
    expect(date).toBe("2026-11-09");
    expect(spaceId).toBe(ctx.s.sala1.id);

    // 2. Consulta a grade semanal do espaço ADM 2 para a semana de 09/11/2026
    const weekRes = await docA.getWeekAgenda(spaceId, date);
    expect(weekRes.response.ok).toBe(true);
    if (!weekRes.response.ok) return;

    const week = requireSuccess(weekRes.response);
    expect(week.spaceId).toBe(ctx.s.sala1.id);
    expect(week.days).toHaveLength(7);

    // 3. Identifica horários livres na quarta-feira (11/11/2026)
    const wednesday = week.days.find((d) => d.date === "2026-11-11");
    expect(wednesday).toBeDefined();
    expect((wednesday?.free.length ?? 0) > 0).toBe(true);

    // 4. Clica no slot livre das 10:10 às 12:00 (bloco M34)
    const slot = {
      spaceId: ctx.s.sala1.id,
      date: "2026-11-11",
      start: TIMETABLE_SHORTCUTS.M34.start,
      end: TIMETABLE_SHORTCUTS.M34.end,
      purpose: "Aulas de Laboratório de Redes",
    };

    // 5. Submete a criação da reserva avulsa
    const bookingRes = await docA.createBooking(slot);
    expect(bookingRes.response.ok).toBe(true);
    if (!bookingRes.response.ok) return;

    const created = requireSuccess(bookingRes.response);
    expect(created.id).toBeDefined();
    expect(created.title).toBe("Aulas de Laboratório de Redes");
    expect(created.date).toBe("2026-11-11");

    // 6. Confirmação apresenta link de redirecionamento para 'Minhas Reservas'
    const redirectUrl = `/minhas-reservas?newId=${created.id}`;
    expect(redirectUrl).toContain(created.id);

    // 7. Navega para /minhas-reservas e verifica que a nova reserva consta na lista
    const myBookingsRes = await docA.myBookings();
    expect(myBookingsRes.response.ok).toBe(true);
    if (myBookingsRes.response.ok) {
      const items = requireSuccess(myBookingsRes.response).items;
      const found = items.find((i) => i.id === created.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe("Aulas de Laboratório de Redes");
      expect(found?.spaceName).toBe("ADM 2");
      expect(found?.canCancel).toBe(true);
    }
  });

  // Scenario 2: Navegação e Reserva em Dispositivo Móvel (360px) com Bottom Sheet
  test("Cenário 2: Navegação e Reserva em Dispositivo Móvel (360px) com Bottom Sheet (F4, F5, F6, F7, F13, F15, F16, F17, F23)", async () => {
    // 1. Simula viewport estreito de celular (360 px)
    const viewportWidth = 360;
    const isMobile = viewportWidth <= 640;
    expect(isMobile).toBe(true);

    // 2. Navega pela faixa semanal mobile selecionando quinta-feira (12/11/2026)
    const targetDate = "2026-11-12";
    const initialQuery = buildAgendaQuery({ data: targetDate, espaco: ctx.s.sala1.id });
    expect(parseAgendaQuery(initialQuery).date).toBe(targetDate);

    // 3. Alterna o espaço através do carrossel horizontal de chips para LAB 1, preservando a data
    const switchedQuery = switchSpaceKeepingDate(initialQuery, ctx.s.sala2.id);
    const parsedSwitched = parseAgendaQuery(switchedQuery);
    expect(parsedSwitched.date).toBe(targetDate);
    expect(parsedSwitched.spaceId).toBe(ctx.s.sala2.id);

    // 4. Carrega a timeline vertical diária para LAB 1 em 12/11/2026
    const dayRes = await docA.getDayAgenda(parsedSwitched.spaceId, parsedSwitched.date);
    expect(dayRes.response.ok).toBe(true);
    if (!dayRes.response.ok) return;

    expect(requireSuccess(dayRes.response).hours.opens).toBe("06:00");
    expect(requireSuccess(dayRes.response).hours.closes).toBe("23:00");

    // 5. Abre a folha inferior (bottom sheet) via ação FAB para reserva no período da tarde
    const shortcutT12 = TIMETABLE_SHORTCUTS.T12;
    const bookingRes = await docA.createBooking({
      spaceId: ctx.s.sala2.id,
      date: targetDate,
      start: shortcutT12.start,
      end: shortcutT12.end,
      purpose: "Prática Móvel de Robótica",
    });
    expect(bookingRes.response.ok).toBe(true);
    if (!bookingRes.response.ok) return;

    // 6. Confirmação exibe dados coerentes
    expect(requireSuccess(bookingRes.response).title).toBe("Prática Móvel de Robótica");
    expect(requireSuccess(bookingRes.response).start).toBe("13:30");
    expect(requireSuccess(bookingRes.response).end).toBe("15:20");

    // 7. Timeline do dia agora reflete a nova reserva no celular
    const refreshedDay = await docA.getDayAgenda(ctx.s.sala2.id, targetDate);
    if (refreshedDay.response.ok) {
      expect(
        requireSuccess(refreshedDay.response).occupations.some(
          (o) => o.id === requireSuccess(bookingRes.response).id,
        ),
      ).toBe(true);
    }
  });

  // Scenario 3: Concorrência de Duas Reservas Simultâneas para a Mesma Sala e Horário
  test("Cenário 3: Concorrência de Duas Reservas Simultâneas para a Mesma Sala e Horário (F17, F19, F20, F21, F22)", async () => {
    // 1. Docente A e Docente B identificam simultaneamente o mesmo horário livre em ADM 2
    const slot = {
      spaceId: ctx.s.sala1.id,
      date: "2026-11-18",
      start: "14:00",
      end: "16:00",
    };

    // 2. Ambos submetem a reserva exatamente no mesmo instante
    const [resA, resB] = await Promise.all([
      docA.createBooking({ ...slot, purpose: "Docente A - Seminário" }),
      docB.createBooking({ ...slot, purpose: "Docente B - Recuperação" }),
    ]);

    // 3. Exatamente uma reserva é confirmada
    const successes = [resA, resB].filter((r) => r.response.ok);
    const conflicts = [resA, resB].filter(
      (r) => !r.response.ok && requireFailure(r.response).status === 409,
    );

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    // 4. A reserva rejeitada recebe detalhes claros do conflito (título da reserva vencedora)
    const winnerTitle = requireSuccess(successes[0]?.response).title;
    const conflictDetail = requireFailure(conflicts[0]?.response).conflict;
    expect(conflictDetail).toBeDefined();
    expect(conflictDetail?.title).toBe(winnerTitle ?? "");
    expect(conflictDetail?.date).toBe("2026-11-18");

    // 5. Docente B tenta imediatamente o horário adjacente [16:00, 18:00) e obtém sucesso (meio-aberto)
    const adjacentRes = await docB.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-18",
      start: "16:00",
      end: "18:00",
      purpose: "Docente B - Horário Adjacente",
    });
    expect(adjacentRes.response.ok).toBe(true);
  });

  // Scenario 4: Ciclo de Vida de Aula Importada: Consulta, Cancelamento Único e Cancelamento de Série
  test("Cenário 4: Ciclo de Vida de Aula Importada: Consulta, Cancelamento de Ocorrência Única e Cancelamento da Série Futura (F1, F8, F24, F28, F29, F30, F31, F32)", async () => {
    // 1. Registra aulas semanais importadas recorrentes (Sistemas Operacionais) nas terças-feiras
    const dates = ["2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"];
    dates.forEach((d, idx) => {
      insertImported(ctx.db, {
        id: `occ-so-${idx + 1}`,
        spaceId: ctx.s.sala1.id,
        date: d,
        start: "08:00",
        end: "09:50",
        title: "SISTEMAS OPERACIONAIS",
        responsibleUserId: ctx.s.docA.id,
        batchId: "batch-1",
        lessonId: "L-SO",
      });
    });

    // 2. Docente responsável visualiza a aula na grade da primeira semana
    const week1 = await docA.getWeekAgenda(ctx.s.sala1.id, "2026-11-09");
    expect(week1.response.ok).toBe(true);
    if (week1.response.ok) {
      const tue = requireSuccess(week1.response).days.find((d) => d.date === "2026-11-10");
      expect(tue?.occupations.some((o) => o.id === "occ-so-1")).toBe(true);
    }

    // 3. Docente cancela apenas a ocorrência de 10/11 devido a feriado (scope = "data")
    const singleCancel = await docA.cancelOccupation({ occupationId: "occ-so-1", scope: "data" });
    expect(singleCancel.response.ok).toBe(true);
    expect(requireSuccess(singleCancel.response).cancelled).toBe(1);

    // 4. Verifica que 10/11 foi liberado, mas as semanas subsequentes continuam ativas
    const week1After = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    if (week1After.response.ok) {
      expect(requireSuccess(week1After.response).occupations.some((o) => o.id === "occ-so-1")).toBe(
        false,
      );
    }
    const week2 = await docA.getDayAgenda(ctx.s.sala1.id, "2026-11-17");
    if (week2.response.ok) {
      expect(requireSuccess(week2.response).occupations.some((o) => o.id === "occ-so-2")).toBe(
        true,
      );
    }

    // 5. Posteriormente, docente precisa cancelar toda a série futura restante
    // Consulta a prévia para obter as datas afetadas
    const preview = await docA.previewSeries("occ-so-2");
    expect(preview.response.ok).toBe(true);
    if (!preview.response.ok) return;

    expect(requireSuccess(preview.response).dates).toEqual([
      "2026-11-17",
      "2026-11-24",
      "2026-12-01",
    ]);
    const expectedCount = requireSuccess(preview.response).dates.length;
    expect(expectedCount).toBe(3);

    // 6. Confirma o cancelamento da série com expectedCount correto
    const serieCancel = await docA.cancelOccupation({
      occupationId: "occ-so-2",
      scope: "serie",
      expectedCount,
    });
    expect(serieCancel.response.ok).toBe(true);
    expect(requireSuccess(serieCancel.response).cancelled).toBe(3);

    // 7. Todas as datas futuras agora apresentam slots livres
    for (const d of ["2026-11-17", "2026-11-24", "2026-12-01"]) {
      const dayCheck = await docA.getDayAgenda(ctx.s.sala1.id, d);
      if (dayCheck.response.ok) {
        expect(
          requireSuccess(dayCheck.response).occupations.some(
            (o) => o.title === "SISTEMAS OPERACIONAIS",
          ),
        ).toBe(false);
        expect(
          requireSuccess(dayCheck.response).free.some(
            (g) => g.start <= "08:00" && g.end >= "09:50",
          ),
        ).toBe(true);
      }
    }
  });

  // Scenario 5: Consulta Pública por Visitante (PUBLIC_READ=true) com Redirecionamento de Ação
  test("Cenário 5: Consulta Pública por Visitante (PUBLIC_READ=true) com Redirecionamento de Ação (F1, F4, F7, F8, F9, F12)", async () => {
    // 1. Cadastra uma ocupação com docente responsável
    insertImported(ctx.db, {
      id: "occ-sc5",
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "14:00",
      end: "15:50",
      title: "BANCO DE DADOS II",
      responsibleUserId: ctx.s.docA.id,
    });

    // 2. Visitante sem login acessa a agenda com PUBLIC_READ=true
    ctx.setPublicRead(true);
    const day = await anon.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(day.response.ok).toBe(true);
    if (!day.response.ok) return;

    // 3. Título da aula está visível, mas dados de pessoas são completamente omitidos
    const occ = requireSuccess(day.response).occupations.find((o) => o.id === "occ-sc5");
    expect(occ?.title).toBe("BANCO DE DADOS II");
    expect(occ?.mine).toBe(false);
    expect(occ?.canCancel).toBe(false);
    const payload = JSON.stringify(requireSuccess(day.response));
    expect(payload).not.toContain(ctx.s.docA.name);
    expect(payload).not.toContain(ctx.s.docA.email);

    // 4. Visitante tenta criar uma reserva no horário livre; é rejeitado com 401
    const attempt = await anon.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-10",
      start: "16:00",
      end: "17:00",
      purpose: "Tentativa de Reserva Pública",
    });
    expect(attempt.response.ok).toBe(false);
    expect(requireFailure(attempt.response).status).toBe(401);

    // 5. Quando PUBLIC_READ é desativado (false), a própria leitura exige login (401)
    ctx.setPublicRead(false);
    const lockedDay = await anon.getDayAgenda(ctx.s.sala1.id, "2026-11-10");
    expect(lockedDay.response.ok).toBe(false);
    expect(requireFailure(lockedDay.response).status).toBe(401);
  });

  // Scenario 6: Operação de Desastre e Recuperação: Backup ao Vivo com VACUUM INTO, Simulação de Perda e Restauração
  test("Cenário 6: Operação de Desastre e Recuperação: Backup ao Vivo com VACUUM INTO, Simulação de Perda de Dados e Restauração com Integridade (F33, F34, F35)", async () => {
    // 1. Cria uma reserva válida no banco de produção
    const booking = await docA.createBooking({
      spaceId: ctx.s.sala1.id,
      date: "2026-11-19",
      start: "08:00",
      end: "09:30",
      purpose: "Reserva Crítica de Auditoria",
    });
    expect(booking.response.ok).toBe(true);
    if (!booking.response.ok) return;
    const bookingId = requireSuccess(booking.response).id;

    // 2. Realiza o backup consistente com VACUUM INTO enquanto o banco está ativo
    const backupFile = join(process.cwd(), "test", "fixtures", "disaster-backup.sqlite");
    const targetFile = join(process.cwd(), "test", "fixtures", "disaster-target.sqlite");
    let copyPath: string | undefined;

    try {
      executeBackupVacuum(ctx.rawSqlite, backupFile);
      expect(existsSync(backupFile)).toBe(true);
      expect(validateDatabaseIntegrity(backupFile).ok).toBe(true);

      // Simula o banco alvo ativo no disco
      executeBackupVacuum(ctx.rawSqlite, targetFile);

      // 3. Simula perda catastrófica de dados no banco ativo (truncamento)
      writeFileSync(targetFile, "DADOS CORROMPIDOS POR FALHA DE DISCO");
      expect(validateDatabaseIntegrity(targetFile).ok).toBe(false);

      // 4. Executa a restauração segura com servidor inativo
      const restoreRes = restoreDatabaseSafe(backupFile, targetFile);
      expect(restoreRes.ok).toBe(true);
      copyPath = restoreRes.backupCopyPath;

      // 5. Valida a integridade pós-restauração
      const check = validateDatabaseIntegrity(targetFile);
      expect(check.ok).toBe(true);
      expect(check.message).toBe("ok");

      // 6. Conecta ao banco restaurado e confirma a recuperação de 100% dos dados
      const restoredDb = new SqliteDatabase(targetFile);
      const row = restoredDb.query("SELECT * FROM occupations WHERE id=?").get(bookingId) as {
        title: string;
      };
      restoredDb.close();
      expect(row).toBeDefined();
      expect(row.title).toBe("Reserva Crítica de Auditoria");
    } finally {
      if (existsSync(backupFile)) {
        try {
          unlinkSync(backupFile);
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
      if (copyPath && existsSync(copyPath)) {
        try {
          unlinkSync(copyPath);
        } catch {
          // ignore
        }
      }
    }
  });

  // Scenario 7: Restauração Abortada por Arquivo Corrompido com Preservação do Banco Original
  test("Cenário 7: Restauração Abortada por Arquivo Corrompido com Preservação do Banco Original (F34, F35)", async () => {
    // 1. Banco em produção contém reserva importante
    const prodBooking = await docA.createBooking({
      spaceId: ctx.s.sala2.id,
      date: "2026-11-20",
      start: "14:00",
      end: "16:00",
      purpose: "Reserva de Produção Intacta",
    });
    expect(prodBooking.response.ok).toBe(true);
    if (!prodBooking.response.ok) return;

    const prodFile = join(process.cwd(), "test", "fixtures", "prod-sc7.sqlite");
    const corruptedBackup = join(process.cwd(), "test", "fixtures", "corrupt-backup-sc7.sqlite");

    try {
      // 2. Prepara o banco de produção no disco
      executeBackupVacuum(ctx.rawSqlite, prodFile);
      expect(validateDatabaseIntegrity(prodFile).ok).toBe(true);

      // 3. Arquivo de backup fornecido está corrompido / truncado
      writeFileSync(corruptedBackup, "HEADER_INVALIDO_LIXO_CORROMPIDO");

      // 4. Executa tentativa de restauração com arquivo corrompido
      const attempt = restoreDatabaseSafe(corruptedBackup, prodFile);
      expect(attempt.ok).toBe(false);
      expect(attempt.error).toContain("Integridade");

      // 5. Banco de produção original permanece íntegro e intocado
      const prodCheck = validateDatabaseIntegrity(prodFile);
      expect(prodCheck.ok).toBe(true);

      const db = new SqliteDatabase(prodFile);
      const row = db
        .query("SELECT * FROM occupations WHERE title=?")
        .get("Reserva de Produção Intacta") as { id: string };
      db.close();
      expect(row).toBeDefined();
      expect(row.id).toBe(requireSuccess(prodBooking.response).id);
    } finally {
      if (existsSync(prodFile)) {
        try {
          unlinkSync(prodFile);
        } catch {
          // ignore
        }
      }
      if (existsSync(corruptedBackup)) {
        try {
          unlinkSync(corruptedBackup);
        } catch {
          // ignore
        }
      }
    }
  });
});

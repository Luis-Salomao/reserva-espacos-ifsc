import { describe, expect, test } from "bun:test";
import { createNoticesService } from "#/application/notifications";
import { createRoomRequestsService } from "#/application/room-requests";
import type { AppDb } from "#/infra/db/client";
import { createNotificationRepository } from "#/infra/db/repos/notification-repository";
import { createOccupationRepository } from "#/infra/db/repos/occupation-repository";
import { createRoomRequestRepository } from "#/infra/db/repos/room-request-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import {
  insertBatch,
  insertImported,
  makeService,
  NOW,
  openDb,
  rawAll,
  type Seed,
  seed,
} from "../../../../test/booking-env";

const clock = { now: () => NOW };
const timeZone = "America/Sao_Paulo";

async function setup() {
  const { db } = openDb();
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);
  const requests = createRoomRequestRepository(db);
  const notifications = createNotificationRepository(db);
  return {
    db,
    s,
    requests,
    notifications,
    bookings: makeService(db),
    rooms: createRoomRequestsService({
      occupations: createOccupationRepository(db),
      users: createUserRepository(db),
      spaces: createSpaceRepository(db),
      requests,
      clock,
      timeZone,
    }),
    notices: createNoticesService({ notifications, requests, clock, timeZone }),
  };
}

type Env = Awaited<ReturnType<typeof setup>>;

/** Reserva manual de docB (dono) em 10/11, 10:00-11:00. */
async function bookedByB(env: Env, date = "2026-11-10") {
  const created = await env.bookings.createBooking(env.s.docB, {
    spaceId: env.s.sala1.id,
    date,
    start: "10:00",
    end: "11:00",
    purpose: "Reunião de B",
  });
  if (!created.ok) throw new Error(created.message);
  return created.value.id;
}

const ask = (env: Env, occupationId: string, who: Seed["docA"], purpose = "Prova de A") =>
  env.rooms.request(who, { occupationId, purpose, message: "Por favor" });

const rows = (db: AppDb, query: string) => rawAll(db, query) as Array<Record<string, unknown>>;

describe("aviso de cancelamento", () => {
  test("admin cancelando a reserva de outra pessoa gera aviso com motivo; o dono cancelando a própria não", async () => {
    const env = await setup();
    const own = await bookedByB(env);
    const other = await bookedByB(env, "2026-11-11");
    expect(
      (await env.bookings.cancelOccupation(env.s.docB, { occupationId: own, scope: "data" })).ok,
    ).toBe(true);
    expect(rows(env.db, "SELECT * FROM notifications")).toHaveLength(0);

    const done = await env.bookings.cancelOccupation(env.s.admin, {
      occupationId: other,
      scope: "data",
      note: "  Manutenção do projetor  ",
    });
    expect(done.ok).toBe(true);
    const [notice] = rows(env.db, "SELECT * FROM notifications");
    expect(notice).toMatchObject({
      user_id: env.s.docB.id,
      kind: "reserva_cancelada",
      actor_id: env.s.admin.id,
      occupation_id: other,
      read_at: null,
    });
    expect(JSON.parse(String(notice?.data_json))).toMatchObject({
      date: "2026-11-11",
      title: "Reunião de B",
      note: "Manutenção do projetor",
    });
    expect(rows(env.db, `SELECT cancel_reason FROM occupations WHERE id = '${other}'`)).toEqual([
      { cancel_reason: "administracao" },
    ]);
    expect(rows(env.db, `SELECT cancel_reason FROM occupations WHERE id = '${own}'`)).toEqual([
      { cancel_reason: "usuario" },
    ]);
  });

  test("admin cancelando a própria reserva não gera aviso; motivo longo é recusado", async () => {
    const env = await setup();
    const mine = await env.bookings.createBooking(env.s.admin, {
      spaceId: env.s.sala1.id,
      date: "2026-11-10",
      start: "10:00",
      end: "11:00",
      purpose: "Da administração",
    });
    if (!mine.ok) throw new Error(mine.message);
    const tooLong = await env.bookings.cancelOccupation(env.s.admin, {
      occupationId: mine.value.id,
      scope: "data",
      note: "x".repeat(301),
    });
    expect(tooLong).toMatchObject({ ok: false, field: "note" });
    await env.bookings.cancelOccupation(env.s.admin, {
      occupationId: mine.value.id,
      scope: "data",
    });
    expect(rows(env.db, "SELECT * FROM notifications")).toHaveLength(0);
  });

  test("série importada cancelada pelo admin gera um único aviso com N datas", async () => {
    const env = await setup();
    for (const [index, date] of ["2026-11-10", "2026-11-17", "2026-11-24"].entries()) {
      insertImported(env.db, {
        id: `i${index}`,
        spaceId: env.s.sala1.id,
        date,
        start: "08:00",
        end: "09:40",
        title: "Cálculo I",
        responsibleUserId: env.s.docB.id,
        lessonId: "L-1",
      });
    }
    const result = await env.bookings.cancelOccupation(env.s.admin, {
      occupationId: "i0",
      scope: "serie",
      expectedCount: 3,
    });
    expect(result).toEqual({ ok: true, value: { cancelled: 3 } });
    const found = rows(env.db, "SELECT data_json FROM notifications");
    expect(found).toHaveLength(1);
    expect(JSON.parse(String(found[0]?.data_json))).toMatchObject({ count: 3, date: "2026-11-10" });
  });

  test("sem aviso quando o dono não existe, está inativo ou é conta fantasma", async () => {
    const env = await setup();
    insertImported(env.db, {
      id: "sem-dono",
      spaceId: env.s.sala1.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:40",
      title: "Sem dono",
      responsibleUserId: null,
    });
    insertImported(env.db, {
      id: "inativo",
      spaceId: env.s.sala1.id,
      date: "2026-11-11",
      start: "08:00",
      end: "09:40",
      title: "Inativo",
      responsibleUserId: env.s.docA.id,
    });
    insertImported(env.db, {
      id: "fantasma",
      spaceId: env.s.sala1.id,
      date: "2026-11-12",
      start: "08:00",
      end: "09:40",
      title: "Fantasma",
      responsibleUserId: env.s.docB.id,
    });
    rawAll(env.db, `UPDATE users SET active = 0 WHERE id = '${env.s.docA.id}'`);
    rawAll(env.db, `UPDATE users SET placeholder = 1 WHERE id = '${env.s.docB.id}'`);
    for (const id of ["sem-dono", "inativo", "fantasma"]) {
      const result = await env.bookings.cancelOccupation(env.s.admin, {
        occupationId: id,
        scope: "data",
      });
      expect(result.ok).toBe(true);
    }
    expect(rows(env.db, "SELECT * FROM notifications")).toHaveLength(0);
  });

  test("aviso não é gravado se a ocupação já tinha sido cancelada por outra chamada", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const occupations = createOccupationRepository(env.db);
    const notice = {
      id: "n1",
      userId: env.s.docB.id,
      kind: "reserva_cancelada" as const,
      actorId: env.s.admin.id,
      occupationId: id,
      requestId: null,
      data: { spaceName: "ADM 2", date: "2026-11-10", start: "10:00", end: "11:00", title: "x" },
      createdAt: NOW.toISOString(),
    };
    expect(await occupations.cancelOne(id, "usuario", "2026-11-03T11:00:00.000Z")).toBe(true);
    expect(await occupations.cancelOne(id, "administracao", NOW.toISOString(), notice)).toBe(false);
    expect(rows(env.db, "SELECT * FROM notifications")).toHaveLength(0);
  });
});

describe("pedido de sala", () => {
  test("o pedido gera aviso ao dono (que fica fora da lista) e conta no selo", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const result = await ask(env, id, env.s.docA);
    expect(result.ok).toBe(true);
    expect(rows(env.db, "SELECT kind, user_id FROM notifications")).toEqual([
      { kind: "pedido_recebido", user_id: env.s.docB.id },
    ]);
    const overview = await env.notices.overview(env.s.docB);
    if (!overview.ok) throw new Error(overview.message);
    expect(overview.value.notices).toHaveLength(0);
    expect(overview.value.incoming).toMatchObject([
      { requesterName: env.s.docA.name, purpose: "Prova de A", message: "Por favor" },
    ]);
    expect(await env.notices.badge(env.s.docB)).toBe(1);
    expect(await env.notices.badge(env.s.docA)).toBe(0);
  });

  test("recusa a própria ocupação, passada, sem responsável, papel sem permissão e finalidade vazia", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    expect(await ask(env, id, env.s.docB)).toMatchObject({ ok: false, kind: "validation" });
    expect(await ask(env, id, env.s.docA, "   ")).toMatchObject({ ok: false, field: "purpose" });
    expect(await ask(env, id, env.s.horarios)).toMatchObject({ ok: false, kind: "forbidden" });
    expect(await ask(env, "nada", env.s.docA)).toMatchObject({ ok: false, kind: "not_found" });
    insertImported(env.db, {
      id: "orfa",
      spaceId: env.s.sala2.id,
      date: "2026-11-10",
      start: "08:00",
      end: "09:40",
      title: "Sem responsável",
      responsibleUserId: null,
    });
    expect(await ask(env, "orfa", env.s.docA)).toMatchObject({
      ok: false,
      message: expect.stringContaining("coordenação"),
    });
    insertImported(env.db, {
      id: "passada",
      spaceId: env.s.sala2.id,
      date: "2026-11-02",
      start: "08:00",
      end: "09:40",
      title: "Passada",
      responsibleUserId: env.s.docB.id,
    });
    expect(await ask(env, "passada", env.s.docA)).toMatchObject({ ok: false, kind: "conflict" });
    const tooLong = await env.rooms.request(env.s.docA, {
      occupationId: id,
      purpose: "ok",
      message: "m".repeat(301),
    });
    expect(tooLong).toMatchObject({ ok: false, field: "message" });
  });

  test("pedido pendente repetido é recusado; depois de decidido, pode pedir de novo", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    expect((await ask(env, id, env.s.docA)).ok).toBe(true);
    expect(await ask(env, id, env.s.docA)).toMatchObject({ ok: false, kind: "conflict" });
    expect(rows(env.db, "SELECT * FROM room_requests")).toHaveLength(1);
    const [row] = rows(env.db, "SELECT id FROM room_requests");
    await env.rooms.decline(env.s.docB, { requestId: String(row?.id) });
    expect((await ask(env, id, env.s.docA)).ok).toBe(true);
  });

  test("índice único parcial: dois pendentes iguais falham, mas aceito + pendente convivem", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const insert = (rid: string, status: string) =>
      rawAll(
        env.db,
        `INSERT INTO room_requests (id, occupation_id, requester_id, owner_id, purpose, status, created_at)
         VALUES ('${rid}', '${id}', '${env.s.docA.id}', '${env.s.docB.id}', 'p', '${status}', 'x')`,
      );
    insert("r1", "pendente");
    expect(() => insert("r2", "pendente")).toThrow();
    insert("r3", "aceito");
    expect(rows(env.db, "SELECT id FROM room_requests ORDER BY id")).toHaveLength(2);
  });

  test("create devolve false (sem aviso) quando a corrida perde para o índice único", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const input = {
      id: "r-a",
      occupationId: id,
      requesterId: env.s.docA.id,
      ownerId: env.s.docB.id,
      purpose: "p",
      message: null,
      createdAt: NOW.toISOString(),
      notice: {
        id: "n-a",
        userId: env.s.docB.id,
        kind: "pedido_recebido" as const,
        actorId: env.s.docA.id,
        occupationId: id,
        requestId: "r-a",
        data: { spaceName: "ADM 2", date: "2026-11-10", start: "10:00", end: "11:00", title: "p" },
        createdAt: NOW.toISOString(),
      },
    };
    expect(await env.requests.create(input)).toBe(true);
    expect(
      await env.requests.create({
        ...input,
        id: "r-b",
        notice: { ...input.notice, id: "n-b", requestId: "r-b" },
      }),
    ).toBe(false);
    expect(rows(env.db, "SELECT * FROM notifications")).toHaveLength(1);
  });
});

describe("aceitar, recusar e desistir", () => {
  test("aceitar passa a ocupação a quem pediu, encerra os outros pedidos e avisa", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const first = await ask(env, id, env.s.docA, "Prova de A");
    const second = await ask(env, id, env.s.admin, "Reunião da administração");
    if (!first.ok || !second.ok) throw new Error("pedidos");
    const accepted = await env.rooms.accept(env.s.docB, first.value.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(
      rows(env.db, `SELECT status, cancel_reason FROM occupations WHERE id = '${id}'`),
    ).toEqual([{ status: "cancelada", cancel_reason: "cedida" }]);
    expect(
      rows(
        env.db,
        `SELECT space_id, starts_at, ends_at, title, source, created_by, responsible_user_id, status
         FROM occupations WHERE id = '${accepted.value.occupationId}'`,
      ),
    ).toEqual([
      {
        space_id: env.s.sala1.id,
        starts_at: "2026-11-10T10:00",
        ends_at: "2026-11-10T11:00",
        title: "Prova de A",
        source: "manual",
        created_by: env.s.docA.id,
        responsible_user_id: env.s.docA.id,
        status: "ativa",
      },
    ]);
    expect(
      rows(
        env.db,
        "SELECT id, status, new_occupation_id FROM room_requests ORDER BY created_at, id",
      )
        .map((row) => [row.id === first.value.id, row.status, row.new_occupation_id])
        .sort(),
    ).toEqual(
      [
        [true, "aceito", accepted.value.occupationId],
        [false, "encerrado", null],
      ].sort(),
    );
    const noticeForA = await env.notices.overview(env.s.docA);
    if (!noticeForA.ok) throw new Error(noticeForA.message);
    expect(noticeForA.value.notices[0]?.text).toContain("aceitou seu pedido");
    expect(noticeForA.value.outgoing[0]?.status).toBe("aceito");
    // O novo dono já aparece na lista de Minhas reservas; o antigo não.
    const mineA = await env.bookings.myBookings(env.s.docA, {});
    expect(mineA.ok && mineA.value.items.map((item) => item.title)).toEqual(["Prova de A"]);
    const mineB = await env.bookings.myBookings(env.s.docB, {});
    expect(mineB.ok && mineB.value.items).toHaveLength(0);
  });

  test("só o dono aceita ou recusa; só quem pediu desiste", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const asked = await ask(env, id, env.s.docA);
    if (!asked.ok) throw new Error("pedido");
    const rid = asked.value.id;
    expect(await env.rooms.accept(env.s.docA, rid)).toMatchObject({ ok: false, kind: "forbidden" });
    expect(await env.rooms.accept(env.s.admin, rid)).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(await env.rooms.decline(env.s.docA, { requestId: rid })).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(await env.rooms.withdraw(env.s.docB, rid)).toMatchObject({
      ok: false,
      kind: "forbidden",
    });
    expect(await env.rooms.accept(env.s.docB, "nada")).toMatchObject({
      ok: false,
      kind: "not_found",
    });
    expect(await env.rooms.withdraw(env.s.docA, "nada")).toMatchObject({
      ok: false,
      kind: "not_found",
    });
    expect(rows(env.db, `SELECT status FROM occupations WHERE id = '${id}'`)).toEqual([
      { status: "ativa" },
    ]);
  });

  test("aceite obsoleto (ocupação já cancelada) dá conflito e não altera nada", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const asked = await ask(env, id, env.s.docA);
    if (!asked.ok) throw new Error("pedido");
    await env.bookings.cancelOccupation(env.s.admin, { occupationId: id, scope: "data" });
    const before = rows(env.db, "SELECT id, status FROM occupations ORDER BY id");
    expect(await env.rooms.accept(env.s.docB, asked.value.id)).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(rows(env.db, "SELECT id, status FROM occupations ORDER BY id")).toEqual(before);
    expect(rows(env.db, "SELECT status FROM room_requests")).toEqual([{ status: "pendente" }]);
    // O aviso de aceite também não existe.
    expect(
      rows(env.db, "SELECT kind FROM notifications WHERE kind = 'pedido_aceito'"),
    ).toHaveLength(0);
    const overview = await env.notices.overview(env.s.docA);
    expect(overview.ok && overview.value.outgoing[0]?.status).toBe("indisponivel");
    const owner = await env.notices.overview(env.s.docB);
    expect(owner.ok && owner.value.incoming).toHaveLength(0);
  });

  test("a cadeia do accept no repositório não faz nada se o pedido deixou de ser pendente", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const asked = await ask(env, id, env.s.docA);
    if (!asked.ok) throw new Error("pedido");
    await env.rooms.withdraw(env.s.docA, asked.value.id);
    const accepted = await env.requests.accept({
      requestId: asked.value.id,
      ownerId: env.s.docB.id,
      newOccupationId: "novo",
      at: NOW.toISOString(),
      nowLocal: "2026-11-03T09:00",
      notice: {
        id: "n",
        userId: env.s.docA.id,
        kind: "pedido_aceito",
        actorId: env.s.docB.id,
        occupationId: id,
        requestId: asked.value.id,
        data: { spaceName: "ADM 2", date: "2026-11-10", start: "10:00", end: "11:00", title: "x" },
        createdAt: NOW.toISOString(),
      },
    });
    expect(accepted).toBe(false);
    expect(rows(env.db, `SELECT status FROM occupations WHERE id = '${id}'`)).toEqual([
      { status: "ativa" },
    ]);
    expect(rows(env.db, "SELECT id FROM occupations WHERE id = 'novo'")).toHaveLength(0);
    expect(rows(env.db, "SELECT id FROM notifications WHERE id = 'n'")).toHaveLength(0);
  });

  test("dois aceites concorrentes (do mesmo pedido ou de pedidos diferentes) criam só uma ocupação nova", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const a = await ask(env, id, env.s.docA, "Prova de A");
    const c = await ask(env, id, env.s.admin, "Reunião");
    if (!a.ok || !c.ok) throw new Error("pedidos");
    const results = await Promise.all([
      env.rooms.accept(env.s.docB, a.value.id),
      env.rooms.accept(env.s.docB, a.value.id),
      env.rooms.accept(env.s.docB, c.value.id),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      rows(env.db, "SELECT id FROM occupations WHERE source = 'manual' AND status = 'ativa'"),
    ).toHaveLength(1);
    expect(rows(env.db, "SELECT status FROM room_requests WHERE status = 'aceito'")).toHaveLength(
      1,
    );
    expect(rows(env.db, "SELECT status FROM room_requests WHERE status = 'pendente'")).toHaveLength(
      0,
    );
  });

  test("recusar com motivo avisa quem pediu; desistir não gera aviso", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const a = await ask(env, id, env.s.docA);
    const c = await ask(env, id, env.s.admin);
    if (!a.ok || !c.ok) throw new Error("pedidos");
    expect(
      (await env.rooms.decline(env.s.docB, { requestId: a.value.id, note: " Uso a sala " })).ok,
    ).toBe(true);
    expect(await env.rooms.decline(env.s.docB, { requestId: a.value.id })).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(
      await env.rooms.decline(env.s.docB, { requestId: c.value.id, note: "n".repeat(301) }),
    ).toMatchObject({ ok: false, field: "note" });
    const overview = await env.notices.overview(env.s.docA);
    if (!overview.ok) throw new Error(overview.message);
    expect(overview.value.notices[0]?.text).toContain("Motivo: Uso a sala");
    expect(overview.value.outgoing[0]).toMatchObject({
      status: "recusado",
      decisionNote: "Uso a sala",
    });

    expect((await env.rooms.withdraw(env.s.admin, c.value.id)).ok).toBe(true);
    expect(await env.rooms.withdraw(env.s.admin, c.value.id)).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    const forAdmin = await env.notices.overview(env.s.admin);
    expect(forAdmin.ok && forAdmin.value.notices).toHaveLength(0);
    expect(forAdmin.ok && forAdmin.value.outgoing[0]?.status).toBe("cancelado");
  });

  test("aceitar falha se quem pediu perdeu a conta ativa", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    const a = await ask(env, id, env.s.docA);
    if (!a.ok) throw new Error("pedido");
    rawAll(env.db, `UPDATE users SET active = 0 WHERE id = '${env.s.docA.id}'`);
    expect(await env.rooms.accept(env.s.docB, a.value.id)).toMatchObject({
      ok: false,
      kind: "conflict",
    });
  });
});

describe("avisos lidos", () => {
  test("marcar como lido zera o selo e mantém os avisos", async () => {
    const env = await setup();
    const id = await bookedByB(env);
    await env.bookings.cancelOccupation(env.s.admin, { occupationId: id, scope: "data" });
    expect(await env.notices.badge(env.s.docB)).toBe(1);
    const before = await env.notices.overview(env.s.docB);
    expect(before.ok && before.value.notices.map((notice) => notice.unread)).toEqual([true]);
    expect((await env.notices.markRead(env.s.docB)).ok).toBe(true);
    expect(await env.notices.badge(env.s.docB)).toBe(0);
    const after = await env.notices.overview(env.s.docB);
    expect(after.ok && after.value.notices.map((notice) => notice.unread)).toEqual([false]);
    // Outra pessoa não é afetada.
    expect(await env.notices.badge(env.s.docA)).toBe(0);
  });
});

describe("fusão de contas", () => {
  test("mergeInto move avisos e pedidos (de quem pede e de quem recebe)", async () => {
    const env = await setup();
    const users = createUserRepository(env.db);
    const ghost = await users.create({
      email: "fantasma@x.org",
      name: "Fantasma",
      code: "FAN",
      roles: ["docente"],
      passwordHash: "x",
    });
    rawAll(env.db, `UPDATE users SET placeholder = 1 WHERE id = '${ghost.id}'`);
    const id = await bookedByB(env);
    const stamp = "2026-11-03T12:00:00.000Z";
    rawAll(
      env.db,
      `INSERT INTO notifications (id, user_id, kind, actor_id, data_json, created_at)
       VALUES ('n1', '${ghost.id}', 'reserva_cancelada', '${env.s.admin.id}', '{}', '${stamp}'),
              ('n2', '${env.s.docA.id}', 'pedido_aceito', '${ghost.id}', '{}', '${stamp}')`,
    );
    rawAll(
      env.db,
      `INSERT INTO room_requests (id, occupation_id, requester_id, owner_id, purpose, status, created_at)
       VALUES ('r1', '${id}', '${ghost.id}', '${env.s.docB.id}', 'p', 'recusado', '${stamp}'),
              ('r2', '${id}', '${env.s.docA.id}', '${ghost.id}', 'p', 'recusado', '${stamp}')`,
    );
    expect(await users.mergeInto(ghost.id, env.s.docB.id)).toBe(true);
    expect(rows(env.db, "SELECT id, user_id, actor_id FROM notifications ORDER BY id")).toEqual([
      { id: "n1", user_id: env.s.docB.id, actor_id: env.s.admin.id },
      { id: "n2", user_id: env.s.docA.id, actor_id: env.s.docB.id },
    ]);
    expect(
      rows(env.db, "SELECT id, requester_id, owner_id FROM room_requests ORDER BY id"),
    ).toEqual([
      { id: "r1", requester_id: env.s.docB.id, owner_id: env.s.docB.id },
      { id: "r2", requester_id: env.s.docA.id, owner_id: env.s.docB.id },
    ]);
  });
});

describe("canRequest na agenda", () => {
  test("só quem pode pedir vê o botão, e só nas ocupações de outra pessoa", async () => {
    const env = await setup();
    await bookedByB(env);
    const query = { spaceId: env.s.sala1.id, date: "2026-11-10" };
    const flag = async (viewer: Seed["docA"] | null) => {
      const day = await env.bookings.dayAgenda(viewer, query);
      if (!day.ok) throw new Error(day.message);
      return day.value.occupations[0]?.canRequest;
    };
    expect(await flag(env.s.docA)).toBe(true);
    expect(await flag(env.s.admin)).toBe(true);
    expect(await flag(env.s.docB)).toBe(false);
    expect(await flag(env.s.horarios)).toBe(false);
    expect(await flag(null)).toBe(false);
    rawAll(env.db, `UPDATE users SET placeholder = 1 WHERE id = '${env.s.docB.id}'`);
    expect(await flag(env.s.docA)).toBe(false);
  });
});

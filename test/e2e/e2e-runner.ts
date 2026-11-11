import { Database as SqliteDatabase } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidDate } from "#/domain/semester";
import type { User } from "#/domain/user";
import type { AppDb } from "#/infra/db/client";
import {
  type BookingDeps,
  cancelOccupationAction,
  createBookingAction,
  getDayAgenda,
  getWeekAgenda,
  myBookingsAction,
  previewSeriesAction,
} from "#/server/booking-actions";
import {
  connect,
  insertBatch,
  insertImported,
  makeService,
  NOW,
  openDb,
  type Seed,
  seed,
  TODAY,
} from "../booking-env";

export { connect, insertImported, NOW, TODAY };

export type E2EContext = {
  db: AppDb;
  dbPath?: string | undefined;
  s: Seed;
  deps: BookingDeps;
  setPublicRead: (value: boolean) => void;
  setNow: (now: Date) => void;
  rawSqlite: SqliteDatabase;
  cleanup: () => void;
};

export type E2EClient = {
  getDayAgenda: (spaceId: string, date: string) => ReturnType<typeof getDayAgenda>;
  getWeekAgenda: (spaceId: string, weekStart: string) => ReturnType<typeof getWeekAgenda>;
  createBooking: (input: {
    spaceId: string;
    date: string;
    start: string;
    end: string;
    purpose: string;
  }) => ReturnType<typeof createBookingAction>;
  cancelOccupation: (input: {
    occupationId: string;
    scope: "data" | "serie";
    expectedCount?: number;
  }) => ReturnType<typeof cancelOccupationAction>;
  previewSeries: (occupationId: string) => ReturnType<typeof previewSeriesAction>;
  myBookings: (input?: {
    from?: string;
    limit?: number;
    offset?: number;
  }) => ReturnType<typeof myBookingsAction>;
};

export async function createE2EContext(options?: {
  publicRead?: boolean;
  now?: Date;
  dbPath?: string;
}): Promise<E2EContext> {
  const isDisk = options?.dbPath !== undefined;
  const path = options?.dbPath ?? ":memory:";

  if (isDisk && existsSync(path)) {
    try {
      unlinkSync(path);
      if (existsSync(`${path}-wal`)) unlinkSync(`${path}-wal`);
      if (existsSync(`${path}-shm`)) unlinkSync(`${path}-shm`);
    } catch {
      // ignore
    }
  }

  const { db } = openDb(path);
  const s = await seed(db);
  insertBatch(db, s.semester.id, s.admin.id);

  let currentNow = options?.now ?? NOW;
  let currentPublicRead = options?.publicRead ?? true;

  const rawSqlite = (db as unknown as { $client: SqliteDatabase }).$client;

  const tokens = new Map<string, User>([
    ["adm", s.admin],
    ["hor", s.horarios],
    ["doca", s.docA],
    ["docb", s.docB],
    ["off", { ...s.docA, active: false }],
  ]);

  const deps: BookingDeps = {
    auth: {
      login: async () => ({ ok: false, reason: "invalid" }),
      authenticate: async (token) => {
        const found = tokens.get(token) ?? null;
        return found?.active ? found : null;
      },
      logout: async () => {},
    },
    bookings: makeService(db, currentNow),
    cookieSecure: "auto",
    publicRead: currentPublicRead,
  };

  const setPublicRead = (value: boolean) => {
    currentPublicRead = value;
    deps.publicRead = value;
  };

  const setNow = (now: Date) => {
    currentNow = now;
    deps.bookings = makeService(db, now);
  };

  const cleanup = () => {
    try {
      rawSqlite.close();
    } catch {
      // ignore
    }
    if (isDisk && options?.dbPath) {
      try {
        if (existsSync(options.dbPath)) unlinkSync(options.dbPath);
        if (existsSync(`${options.dbPath}-wal`)) unlinkSync(`${options.dbPath}-wal`);
        if (existsSync(`${options.dbPath}-shm`)) unlinkSync(`${options.dbPath}-shm`);
      } catch {
        // ignore
      }
    }
  };

  return {
    db,
    dbPath: options?.dbPath,
    s,
    deps,
    setPublicRead,
    setNow,
    rawSqlite,
    cleanup,
  };
}

export function createE2EClient(ctx: E2EContext, token: string | null = null): E2EClient {
  const req = () => ({
    url: "https://reservas.ifsc.edu.br/_serverFn/x",
    headers: new Headers(token === null ? {} : { cookie: `sid=${token}` }),
  });

  return {
    getDayAgenda: (spaceId, date) => getDayAgenda(ctx.deps, req(), { spaceId, date }),
    getWeekAgenda: (spaceId, weekStart) => getWeekAgenda(ctx.deps, req(), { spaceId, weekStart }),
    createBooking: (input) => createBookingAction(ctx.deps, req(), input),
    cancelOccupation: (input) => cancelOccupationAction(ctx.deps, req(), input),
    previewSeries: (occupationId) => previewSeriesAction(ctx.deps, req(), { occupationId }),
    myBookings: (input = {}) => myBookingsAction(ctx.deps, req(), input),
  };
}

/** Sincronização de URL (?data=YYYY-MM-DD&espaco=<id>). */
export function parseAgendaQuery(
  search: string | URLSearchParams,
  fallbackDate: string = TODAY,
  fallbackSpaceId: string = "",
): { date: string; spaceId: string } {
  const params =
    typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
  const rawDate = params.get("data");
  const rawSpace = params.get("espaco");

  const dateValid = rawDate !== null && isValidDate(rawDate);
  const date = dateValid ? rawDate : fallbackDate;
  const spaceId = rawSpace && rawSpace.trim().length > 0 ? rawSpace.trim() : fallbackSpaceId;

  return { date, spaceId };
}

export function buildAgendaQuery(params: { data?: string; espaco?: string }): string {
  const search = new URLSearchParams();
  if (params.data) search.set("data", params.data);
  if (params.espaco) search.set("espaco", params.espaco);
  return search.toString();
}

export function switchSpaceKeepingDate(currentQuery: string, newSpaceId: string): string {
  const parsed = parseAgendaQuery(currentQuery);
  return buildAgendaQuery({ data: parsed.date, espaco: newSpaceId });
}

/** Atalhos padrão de blocos de aula. */
export const TIMETABLE_SHORTCUTS = {
  M12: { start: "08:00", end: "09:50", name: "Manhã 1-2" },
  M34: { start: "10:10", end: "12:00", name: "Manhã 3-4" },
  T12: { start: "13:30", end: "15:20", name: "Tarde 1-2" },
  T34: { start: "15:40", end: "17:30", name: "Tarde 3-4" },
  N12: { start: "18:00", end: "19:50", name: "Noite 1-2" },
  N34: { start: "20:10", end: "22:00", name: "Noite 3-4" },
  N123: { start: "19:00", end: "22:00", name: "Noite 1-3" },
};

/** Algoritmo de empacotamento em faixas paralelas (lanes) para ocupações sobrepostas. */
export function calculateMultiLanes(
  items: Array<{ id: string; start: string; end: string }>,
): Map<string, { lane: number; totalLanes: number }> {
  const result = new Map<string, { lane: number; totalLanes: number }>();
  if (items.length === 0) return result;

  const sorted = [...items].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );

  const clusters: Array<typeof sorted> = [];
  let currentCluster: typeof sorted = [];
  let clusterEnd = "";

  for (const item of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.end;
    } else if (item.start < clusterEnd) {
      currentCluster.push(item);
      if (item.end > clusterEnd) clusterEnd = item.end;
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.end;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  for (const cluster of clusters) {
    const laneEnds: string[] = [];
    const clusterAssignments: Array<{ id: string; lane: number }> = [];

    for (const item of cluster) {
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        const laneEnd = laneEnds[i];
        if (laneEnd !== undefined && item.start >= laneEnd) {
          laneEnds[i] = item.end;
          clusterAssignments.push({ id: item.id, lane: i });
          placed = true;
          break;
        }
      }
      if (!placed) {
        laneEnds.push(item.end);
        clusterAssignments.push({ id: item.id, lane: laneEnds.length - 1 });
      }
    }

    const totalLanes = laneEnds.length;
    for (const assignment of clusterAssignments) {
      result.set(assignment.id, { lane: assignment.lane, totalLanes });
    }
  }

  return result;
}

/** Backup e integridade via SQLite nativo (especificação RO-01). */
export function executeBackupVacuum(sqliteOrDb: SqliteDatabase | AppDb, outputPath: string): void {
  const sqlite =
    (sqliteOrDb as unknown as { $client?: SqliteDatabase }).$client ??
    (sqliteOrDb as SqliteDatabase);
  const dir = dirname(outputPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (existsSync(outputPath)) unlinkSync(outputPath);

  const escaped = outputPath.replace(/'/g, "''");
  sqlite.run(`VACUUM INTO '${escaped}'`);
}

export function validateDatabaseIntegrity(filePath: string): { ok: boolean; message: string } {
  if (!existsSync(filePath)) return { ok: false, message: "Arquivo não existe" };
  try {
    const stat = statSync(filePath);
    if (stat.size === 0) return { ok: false, message: "Arquivo vazio (0 bytes)" };
    const db = new SqliteDatabase(filePath);
    try {
      const result = db.query("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
      const isOk = result.length > 0 && result[0]?.integrity_check === "ok";
      return { ok: isOk, message: result[0]?.integrity_check ?? "Falha na checagem" };
    } finally {
      db.close();
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export function restoreDatabaseSafe(
  backupPath: string,
  targetPath: string,
): { ok: boolean; backupCopyPath?: string | undefined; error?: string | undefined } {
  const integrity = validateDatabaseIntegrity(backupPath);
  if (!integrity.ok) {
    return { ok: false, error: `Integridade inválida do arquivo de backup: ${integrity.message}` };
  }

  let backupCopyPath: string | undefined;
  if (existsSync(targetPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupCopyPath = `${targetPath}.bak-${timestamp}`;
    const sourceContent = readFileSync(targetPath);
    writeFileSync(backupCopyPath, sourceContent);
  }

  // Limpeza de WAL e SHM residuais
  for (const ext of ["-wal", "-shm"]) {
    const sideFile = `${targetPath}${ext}`;
    if (existsSync(sideFile)) {
      try {
        unlinkSync(sideFile);
      } catch {
        // ignore
      }
    }
  }

  const backupContent = readFileSync(backupPath);
  writeFileSync(targetPath, backupContent);

  const postCheck = validateDatabaseIntegrity(targetPath);
  if (!postCheck.ok) {
    return {
      ok: false,
      backupCopyPath,
      error: `Integridade pós-restauração falhou: ${postCheck.message}`,
    };
  }

  return { ok: true, backupCopyPath };
}

export async function checkCliHasCommand(cmd: "backup" | "restore"): Promise<boolean> {
  try {
    const proc = Bun.spawn([process.execPath, "cli/index.ts", "--help"], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [text, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return exitCode === 0 && text.includes(cmd);
  } catch {
    return false;
  }
}

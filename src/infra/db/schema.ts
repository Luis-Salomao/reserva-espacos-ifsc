import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  capacity: integer("capacity"),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  code: text("code").unique(),
  roles: text("roles").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** Conta fantasma: criada para um docente do XML sem conta; não entra até ser ativada. */
  placeholder: integer("placeholder", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    email: text("email").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
  },
  (table) => [index("login_attempts_email_idx").on(table.email, table.attemptedAt)],
);

export const semesters = sqliteTable("semesters", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const semesterTerms = sqliteTable(
  "semester_terms",
  {
    semesterId: text("semester_id")
      .notNull()
      .references(() => semesters.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
  },
  (table) => [primaryKey({ columns: [table.semesterId, table.position] })],
);

export const semesterBlocks = sqliteTable(
  "semester_blocks",
  {
    semesterId: text("semester_id")
      .notNull()
      .references(() => semesters.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    short: text("short").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (table) => [primaryKey({ columns: [table.semesterId, table.number] })],
);

/** Vínculo sala do XML (id do aSc) -> espaço. `ignored` = não gerar ocupações para essa sala. */
export const roomMappings = sqliteTable("room_mappings", {
  sourceRoomId: text("source_room_id").primaryKey(),
  sourceShort: text("source_short").notNull(),
  spaceId: text("space_id").references(() => spaces.id),
  ignored: integer("ignored", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

/** Vínculo docente do XML (id e sigla) -> conta local. */
export const teacherMappings = sqliteTable("teacher_mappings", {
  sourceTeacherId: text("source_teacher_id").primaryKey(),
  sourceShort: text("source_short").notNull(),
  userId: text("user_id").references(() => users.id),
  updatedAt: text("updated_at").notNull(),
});

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    semesterId: text("semester_id")
      .notNull()
      .references(() => semesters.id),
    fileHash: text("file_hash").notNull(),
    summaryJson: text("summary_json").notNull(),
    planHash: text("plan_hash"),
    status: text("status", {
      enum: ["preparando", "rascunho", "aplicando", "aplicado", "falhou"],
    }).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
    appliedAt: text("applied_at"),
    /** Último lote aplicado do semestre quando este foi preparado como nova versão (só rastreio). */
    supersedesBatchId: text("supersedes_batch_id"),
  },
  (table) => [
    uniqueIndex("import_batches_hash_semester_unique").on(table.fileHash, table.semesterId),
  ],
);

/** Resultado por linha do lote: o que foi aplicado, o que não se aplica e por quê, conflitos e falhas. */
export const importRows = sqliteTable(
  "import_rows",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowKey: text("row_key").notNull(),
    lessonId: text("lesson_id").notNull(),
    weekday: integer("weekday"),
    spaceId: text("space_id"),
    date: text("date"),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    title: text("title").notNull(),
    responsibleUserId: text("responsible_user_id"),
    status: text("status", {
      enum: [
        "pendente",
        "aplicada",
        "nao_aplicavel",
        "conflito",
        "conflito_interno",
        "falha",
        "inalterada",
        "mantida_cancelada",
        "cancelar",
        "cancelada_versao",
        "responsavel",
        "responsavel_atualizado",
        "alteracao_bloqueada",
      ],
    }).notNull(),
    reasonCode: text("reason_code"),
    reasonDetail: text("reason_detail"),
    occupationId: text("occupation_id"),
    conflictOccupationId: text("conflict_occupation_id"),
    /** Natureza da mudança na nova versão; `null` nos lotes da primeira versão do semestre. */
    changeKind: text("change_kind", {
      enum: ["inclusao", "alteracao", "remocao", "inalterada", "mantida_cancelada", "responsavel"],
    }),
  },
  (table) => [
    primaryKey({ columns: [table.batchId, table.rowKey] }),
    index("import_rows_batch_status_idx").on(table.batchId, table.status),
  ],
);

export const occupations = sqliteTable(
  "occupations",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    source: text("source", { enum: ["import", "manual"] }).notNull(),
    batchId: text("batch_id").references(() => importBatches.id),
    lessonId: text("lesson_id"),
    responsibleUserId: text("responsible_user_id").references(() => users.id),
    title: text("title").notNull(),
    status: text("status", { enum: ["ativa", "cancelada"] }).notNull(),
    createdAt: text("created_at").notNull(),
    /** Por que foi cancelada (`nova_versao` = substituída por uma nova versão da grade). */
    cancelReason: text("cancel_reason"),
    cancelledAt: text("cancelled_at"),
    /** Quem criou a reserva avulsa (`null` nas importadas). */
    createdBy: text("created_by").references(() => users.id),
    /** Série de reservas avulsas recorrentes (`null` na reserva simples e nas importadas). */
    seriesId: text("series_id"),
  },
  (table) => [
    index("occupations_space_starts_idx").on(table.spaceId, table.startsAt),
    index("occupations_series_idx").on(table.seriesId, table.startsAt),
    index("occupations_created_by_idx").on(table.createdBy, table.startsAt),
    index("occupations_responsible_idx").on(table.responsibleUserId, table.startsAt),
    index("occupations_space_ends_idx").on(table.spaceId, table.endsAt),
    uniqueIndex("occupations_import_unique").on(
      table.batchId,
      table.lessonId,
      table.spaceId,
      table.startsAt,
    ),
  ],
);

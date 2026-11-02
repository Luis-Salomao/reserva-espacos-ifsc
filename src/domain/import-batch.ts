export type ImportBatchStatus = "rascunho" | "aplicando" | "aplicado" | "falhou";

export type ImportRowStatus =
  | "pendente"
  | "aplicada"
  | "nao_aplicavel"
  | "conflito"
  | "conflito_interno"
  | "falha";

/** Contagens por situação das linhas do lote (sempre todas as chaves). */
export type ImportRowCounts = Record<ImportRowStatus, number>;

export type ImportSummary = {
  rows: number;
  /** Não aplicáveis, por motivo. */
  notApplicable: Record<string, number>;
  counts: ImportRowCounts;
};

export type ImportBatch = {
  id: string;
  semesterId: string;
  fileHash: string;
  summary: ImportSummary;
  status: ImportBatchStatus;
  createdBy: string;
  createdAt: string;
  appliedAt: string | null;
};

/** Resultado por linha do lote; é o que a tela mostra para o usuário ver o que deu errado. */
export type ImportRow = {
  batchId: string;
  rowKey: string;
  lessonId: string;
  spaceId: string | null;
  /** "YYYY-MM-DD"; `null` nas linhas não aplicáveis (sem data). */
  date: string | null;
  startTime: string;
  endTime: string;
  title: string;
  responsibleUserId: string | null;
  status: ImportRowStatus;
  reasonCode: string | null;
  reasonDetail: string | null;
  occupationId: string | null;
  conflictOccupationId: string | null;
};

export type RoomMapping = {
  sourceRoomId: string;
  sourceShort: string;
  spaceId: string | null;
  ignored: boolean;
};

export type TeacherMapping = {
  sourceTeacherId: string;
  sourceShort: string;
  userId: string | null;
};

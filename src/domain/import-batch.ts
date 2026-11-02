export type ImportBatchStatus = "preparando" | "rascunho" | "aplicando" | "aplicado" | "falhou";

export type ImportRowStatus =
  | "pendente"
  | "aplicada"
  | "nao_aplicavel"
  | "conflito"
  | "conflito_interno"
  | "falha"
  /** Nova versão: ocorrência igual na vigente e na nova (nada a fazer). */
  | "inalterada"
  /** Nova versão: estava cancelada e continua cancelada (nunca reativada). */
  | "mantida_cancelada"
  /** Nova versão: ocupação vigente a cancelar (pendente). */
  | "cancelar"
  | "cancelada_versao"
  /** Nova versão: ocupação vigente cujo responsável muda (pendente). */
  | "responsavel"
  | "responsavel_atualizado"
  /** Nova versão: alteração segurada porque a nova ocorrência conflita; a versão anterior fica ativa. */
  | "alteracao_bloqueada";

/** Natureza da linha numa nova versão da grade (agrupa a tela); `null` na primeira versão. */
export type ImportChangeKind =
  | "inclusao"
  | "alteracao"
  | "remocao"
  | "inalterada"
  | "mantida_cancelada"
  | "responsavel";

/** Contagens por situação das linhas do lote (sempre todas as chaves). */
export type ImportRowCounts = Record<ImportRowStatus, number>;

export const EMPTY_COUNTS: ImportRowCounts = {
  pendente: 0,
  aplicada: 0,
  nao_aplicavel: 0,
  conflito: 0,
  conflito_interno: 0,
  falha: 0,
  inalterada: 0,
  mantida_cancelada: 0,
  cancelar: 0,
  cancelada_versao: 0,
  responsavel: 0,
  responsavel_atualizado: 0,
  alteracao_bloqueada: 0,
};

/** Situações que ainda pedem trabalho de aplicação. */
export function pendingTotal(counts: ImportRowCounts): number {
  return counts.pendente + counts.falha + counts.cancelar + counts.responsavel;
}

/** Resumo da nova versão em relação à vigente (só em lotes preparados sobre uma versão aplicada). */
export type VersionSummary = {
  supersedesBatchId: string;
  inclusoes: number;
  /** Grupos (aula + data) com cancelar/inserir que serão aplicados. */
  alteracoes: number;
  /** Grupos de alteração segurados por conflito (a versão anterior continua). */
  bloqueadas: number;
  remocoes: number;
  responsaveis: number;
  inalteradas: number;
  mantidasCanceladas: number;
  /** Responsáveis de ocupações canceladas/alteradas, para comunicação futura (regra 4). */
  affectedUserIds: string[];
};

export type ImportSummary = {
  rows: number;
  /** Não aplicáveis, por motivo. */
  notApplicable: Record<string, number>;
  counts: ImportRowCounts;
  version?: VersionSummary;
};

export type ImportBatch = {
  id: string;
  semesterId: string;
  fileHash: string;
  summary: ImportSummary;
  /** SHA-256 das linhas planejadas; detecta plano que mudou durante o preparo. */
  planHash: string | null;
  status: ImportBatchStatus;
  createdBy: string;
  createdAt: string;
  appliedAt: string | null;
  /** Último lote aplicado do semestre no preparo (`null` = primeira versão). */
  supersedesBatchId: string | null;
};

/** Resultado por linha do lote; é o que a tela mostra para o usuário ver o que deu errado. */
export type ImportRow = {
  batchId: string;
  rowKey: string;
  lessonId: string;
  /** 0 = segunda-feira. */
  weekday: number | null;
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
  changeKind: ImportChangeKind | null;
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

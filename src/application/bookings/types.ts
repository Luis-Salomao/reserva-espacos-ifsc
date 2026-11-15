import type {
  Clock,
  OccupationRepository,
  SemesterRepository,
  SpaceRepository,
  UserRepository,
} from "#/application/ports";
import type { Failure } from "#/application/validation";
import type { Hours, TimeRange } from "#/domain/availability";
import type { SpaceEquipment } from "#/domain/equipment";
import type { Recurrence } from "#/domain/recurrence";

/**
 * Pessoa ligada à ocupação: responsável (importada) ou quem reservou (avulsa). `placeholder`:
 * conta fantasma, criada pela importação e ainda não ativada.
 */
export type AgendaPerson = { name: string; code: string | null; placeholder: boolean };

/**
 * Item da agenda, sem ids de pessoas. `person` só vem para quem está logado (visitante recebe
 * `null`); `mine`/`canCancel` valem para quem consulta.
 */
export type AgendaItem = {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM". */
  start: string;
  end: string;
  title: string;
  source: "import" | "manual";
  status: "ativa";
  canCancel: boolean;
  mine: boolean;
  person: AgendaPerson | null;
  /** Quem consulta pode pedir esta sala ao dono (outra pessoa, ocupação futura, dono com conta ativa). */
  canRequest?: boolean;
};

export type AgendaBlock = { label: string; short: string; start: string; end: string };

export type DayAgenda = {
  spaceId: string;
  date: string;
  /** Agora em hora de parede do TIMEZONE ("YYYY-MM-DDTHH:MM"): a tela desabilita o horário passado. */
  now: string;
  hours: Hours;
  occupations: AgendaItem[];
  free: TimeRange[];
  /** Blocos de horário do semestre, só para exibir a grade (intervalos entre eles ficam livres). */
  blocks: AgendaBlock[];
};

export type WeekAgenda = {
  spaceId: string;
  weekStart: string;
  now: string;
  days: DayAgenda[];
};

/** Agenda de um dia de uma sala, com o nome e a capacidade (`null` = não cadastrada). */
export type RoomDay = DayAgenda & {
  space: { id: string; name: string; capacity: number | null; equipment?: SpaceEquipment };
};

export type RoomsDay = { date: string; now: string; rooms: RoomDay[] };

/** Todas as salas num intervalo de datas: blocos de cada dia e as ocupações do intervalo de cada sala. */
export type RoomsRange = {
  from: string;
  to: string;
  now: string;
  days: Array<{ date: string; blocks: AgendaBlock[] }>;
  rooms: Array<{
    space: { id: string; name: string; capacity: number | null; equipment?: SpaceEquipment };
    occupations: AgendaItem[];
  }>;
};

export type BookingView = {
  id: string;
  spaceId: string;
  date: string;
  start: string;
  end: string;
  title: string;
};

export type ConflictInfo = {
  title: string;
  spaceName: string;
  date: string;
  start: string;
  end: string;
};

/** Falha de conflito carrega a ocupação que bloqueou (título e horários, sem pessoas). */
type BookingFailure = Failure & { conflict?: ConflictInfo };
export type BookingResult = { ok: true; value: BookingView } | BookingFailure;

type SeriesUpdateScope = "future" | "serie";
export type SeriesUpdateInput = {
  occupationId: string;
  spaceId: string;
  date: string;
  start: string;
  end: string;
  purpose: string;
  scope: SeriesUpdateScope;
};
export type SeriesUpdatePreview = {
  scope: SeriesUpdateScope;
  count: number;
  revision: string;
  changes: Array<{ from: string; to: string }>;
};

/** `inSeries`: faz parte de uma série de reservas recorrentes. */
export type MyBooking = AgendaItem & {
  spaceId: string;
  spaceName: string;
  inSeries: boolean;
  /** Para aulas importadas, distingue o docente responsável de quem apenas importou o arquivo. */
  responsible: boolean;
  /** Identificador interno da série; só acompanha a lista autenticada de reservas próprias. */
  seriesId?: string | null;
  canEdit?: boolean;
};

/** Disciplina agrupada por `key` (título normalizado); `label` é a grafia mais frequente. */
export type MySubject = { key: string; label: string; count: number };
export type MyWeek = WeekAgenda & { items: MyBooking[] };
export type MyDates = { now: string; items: MyBooking[] };

/** Data da série na prévia: livre, ou com o motivo do conflito (título e horário, sem pessoas). */
export type RecurringDate =
  | { date: string; free: true }
  | { date: string; free: false; reason: string };

export type RecurringPreview = { summary: string; dates: RecurringDate[] };

export type RecurringInput = {
  spaceId: string;
  date: string;
  start: string;
  end: string;
  purpose: string;
  rule: Recurrence;
};

/**
 * Confirmação da série: `created` com as datas gravadas e as puladas; ou nada gravado (nenhuma
 * livre, ou as livres mudaram desde a prévia) com o motivo e a prévia atualizada.
 */
export type RecurringOutcome =
  | { created: true; seriesId: string; dates: string[]; skipped: RecurringDate[] }
  | { created: false; message: string; preview: RecurringPreview };

export type BookingsDeps = {
  occupations: OccupationRepository;
  spaces: SpaceRepository;
  semesters: SemesterRepository;
  users: Pick<UserRepository, "list" | "findById">;
  clock: Clock;
  /** TIMEZONE: define "hoje" e "agora" em hora de parede. */
  timeZone: string;
  hours: Hours;
};

export type CancelScope = "data" | "serie";

/** `active` só serve às regras do servidor: não vai para a tela. */
export type People = ReadonlyMap<string, AgendaPerson & { active: boolean }>;

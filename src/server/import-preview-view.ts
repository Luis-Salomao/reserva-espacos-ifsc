import type { ImportPreview } from "#/import-asc/index.ts";

/** Um horário semanal pronto para exibição: só rótulos, sem o modelo bruto da grade. */
export type SlotView = {
  key: string;
  /** 0 = segunda-feira. */
  weekday: number;
  start: string;
  end: string;
  periodFrom: number;
  periodTo: number;
  /** Períodos de cada card do horário, em ordem de relógio (o primeiro é `periodFrom`). */
  periods: number[];
  subject: string;
  classes: string;
  /** Apenas siglas de docentes. */
  teachers: string;
  termsLabel: string;
  status: "applicable" | "no_room" | "multiple_rooms";
  /** Siglas das salas (vazio quando não há sala). */
  rooms: string[];
};

export type RoomView = { id: string; short: string; name: string; slots: SlotView[] };

/** Um lado de uma sobreposição: sigla da disciplina e siglas das turmas. */
export type OverlapSide = { label: string; classes: string; start: string; end: string };

export type OverlapView = {
  key: string;
  room: string;
  weekday: number;
  kind: "certain" | "possible";
  a: OverlapSide;
  b: OverlapSide;
};

/** O que o cliente recebe da prévia (nunca o `timetable` bruto). */
export type PreviewView = {
  counts: ImportPreview["counts"];
  slotsByStatus: ImportPreview["slotsByStatus"];
  warnings: ImportPreview["warnings"];
  overlaps: ImportPreview["overlaps"];
  overlapsDetail: OverlapView[];
  overlapsTruncated: boolean;
  partial: boolean;
  termsUsed: ImportPreview["termsUsed"];
  periods: ImportPreview["periods"];
  rooms: RoomView[];
  /** Docentes do arquivo: id, sigla e nome (AD-001). */
  teachers: Array<{ id: string; short: string; name: string }>;
  withoutRoom: SlotView[];
  multipleRooms: SlotView[];
};

const ALL_TERMS_LABEL = "Todas as durações";

function compareSlotViews(a: SlotView, b: SlotView): number {
  return (
    a.weekday - b.weekday ||
    (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) ||
    (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0)
  );
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/** Converte a prévia agregada na visão enviada ao cliente. Pura. */
export function toPreviewView(preview: ImportPreview): PreviewView {
  const { timetable } = preview;
  const lessons = byId(timetable.lessons);
  const subjects = byId(timetable.subjects);
  const classes = byId(timetable.classes);
  const teachers = byId(timetable.teachers);
  const rooms = byId(timetable.classrooms);
  const termLabels = new Map(preview.termsUsed.map((term) => [term.mask, term.label]));
  const roomName = (id: string) => rooms.get(id)?.short || rooms.get(id)?.name || id;
  const classLabels = (lessonId: string): string =>
    (lessons.get(lessonId)?.classIds ?? []).map((id) => classes.get(id)?.short || id).join(", ");

  const lessonLabel = (lessonId: string): string => {
    const subject = subjects.get(lessons.get(lessonId)?.subjectId ?? "");
    return subject?.short || subject?.name || lessonId;
  };

  const slotViews = preview.slots.map((slot, index): SlotView => {
    const lesson = lessons.get(slot.lessonId);
    return {
      key: `${slot.lessonId}:${slot.weekday}:${slot.periodFrom}:${index}`,
      weekday: slot.weekday,
      start: slot.start,
      end: slot.end,
      periodFrom: slot.periodFrom,
      periodTo: slot.periodTo,
      periods: slot.segments.map((segment) => segment.period),
      subject: lessonLabel(slot.lessonId),
      classes: (lesson?.classIds ?? []).map((id) => classes.get(id)?.short || id).join(", "),
      teachers: (lesson?.teacherIds ?? []).map((id) => teachers.get(id)?.short || id).join(", "),
      termsLabel: termLabels.get(slot.termsMask ?? "") ?? ALL_TERMS_LABEL,
      status: slot.status,
      rooms: slot.classroomIds.map(roomName),
    };
  });

  const slotsByRoom = new Map<string, SlotView[]>();
  preview.slots.forEach((slot, index) => {
    const view = slotViews[index];
    if (view === undefined || slot.status !== "applicable") return;
    const [roomId = ""] = slot.classroomIds;
    slotsByRoom.set(roomId, [...(slotsByRoom.get(roomId) ?? []), view]);
  });
  const sideOf = (slot: ImportPreview["slots"][number]): OverlapSide => ({
    label: lessonLabel(slot.lessonId),
    classes: classLabels(slot.lessonId),
    start: slot.start,
    end: slot.end,
  });

  return {
    counts: preview.counts,
    slotsByStatus: preview.slotsByStatus,
    warnings: preview.warnings,
    overlaps: preview.overlaps,
    overlapsTruncated: preview.overlapsTruncated,
    partial: preview.partial,
    overlapsDetail: preview.overlapsDetail.map((overlap, index) => ({
      key: `${index}:${overlap.classroomId}:${overlap.weekday}:${overlap.a.lessonId}:${overlap.b.lessonId}`,
      room: roomName(overlap.classroomId),
      weekday: overlap.weekday,
      kind: overlap.kind,
      a: sideOf(overlap.a),
      b: sideOf(overlap.b),
    })),
    termsUsed: preview.termsUsed,
    teachers: timetable.teachers.map((teacher) => ({
      id: teacher.id,
      short: teacher.short || teacher.id,
      name: teacher.name,
    })),
    periods: preview.periods,
    rooms: preview.classrooms.map((room) => ({
      id: room.id,
      short: room.short || room.id,
      name: room.name,
      slots: (slotsByRoom.get(room.id) ?? []).sort(compareSlotViews),
    })),
    withoutRoom: slotViews.filter((slot) => slot.status === "no_room").sort(compareSlotViews),
    multipleRooms: slotViews
      .filter((slot) => slot.status === "multiple_rooms")
      .sort(compareSlotViews),
  };
}

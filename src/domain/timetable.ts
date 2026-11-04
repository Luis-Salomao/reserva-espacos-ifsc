/**
 * Modelo mínimo da grade de horários importada. Do docente só o nome (AD-001); nenhum outro dado
 * pessoal de docentes ou alunos.
 */
export type Period = { number: number; name: string; short: string; start: string; end: string };
export type DayDef = { id: string; name: string; masks: string[] };
export type TermDef = { id: string; name: string; short: string; masks: string[] };
export type WeekDef = { id: string; name: string; masks: string[] };
export type Classroom = { id: string; name: string; short: string; capacity: number | null };
/** `name`: o `name` do XML, senão `firstname lastname`, senão a sigla (vazio se nada disso). */
export type Teacher = { id: string; short: string; name: string };
export type Subject = { id: string; name: string; short: string };
export type SchoolClass = { id: string; name: string; short: string };

export type Lesson = {
  id: string;
  subjectId: string | null;
  classIds: string[];
  teacherIds: string[];
  classroomIds: string[];
  periodsPerCard: number;
  termsDefId: string | null;
  weeksDefId: string | null;
  daysDefId: string | null;
};

export type Card = {
  lessonId: string;
  period: number | null;
  days: string | null;
  weeks: string | null;
  terms: string | null;
  classroomIds: string[];
  /** O card listava salas, mas todas eram desconhecidas: não herda as salas da aula. */
  roomsUnknown?: boolean;
};

export type AscTimetable = {
  periods: Period[];
  days: DayDef[];
  terms: TermDef[];
  weeks: WeekDef[];
  classrooms: Classroom[];
  teachers: Teacher[];
  subjects: Subject[];
  classes: SchoolClass[];
  lessons: Lesson[];
  cards: Card[];
};

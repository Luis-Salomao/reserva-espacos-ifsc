import type {
  AscTimetable,
  Card,
  Classroom,
  DayDef,
  Lesson,
  Period,
  SchoolClass,
  Subject,
  Teacher,
  TermDef,
  WeekDef,
} from "#/domain/timetable.ts";
import {
  attr,
  idList,
  parseInteger,
  parseMasks,
  parseTime,
  readSection,
  singleMask,
  text,
} from "./helpers.ts";
import type { XmlNode } from "./read.ts";
import type { ImportWarning } from "./warnings.ts";

export type NormalizeResult = { timetable: AscTimetable; warnings: ImportWarning[] };

const values = <T>(entries: { value: T }[]): T[] => entries.map((entry) => entry.value);

/**
 * Converte a árvore XML em `AscTimetable`. Nunca lança: problemas viram avisos.
 * Dados de alunos (students, groups.studentids, studentsubjects) e campos pessoais
 * de docentes nunca são lidos.
 */
export function normalizeAsc(root: XmlNode): NormalizeResult {
  const warnings: ImportWarning[] = [];

  const periods = readSection<Period>(
    root,
    {
      section: "periods",
      item: "period",
      keyAttr: "period",
      build: (node, key, warn) => {
        const number = parseInteger(key);
        if (number === null) {
          warn("invalid_number", key);
          return null;
        }
        const start = parseTime(attr(node, "starttime"));
        const end = parseTime(attr(node, "endtime"));
        if (start === null || end === null) {
          warn("invalid_time", key);
          return null;
        }
        return { number, name: text(node, "name"), short: text(node, "short"), start, end };
      },
    },
    warnings,
  );

  const days = readSection<DayDef>(
    root,
    {
      section: "daysdefs",
      item: "daysdef",
      keyAttr: "id",
      build: (node, id, warn) => ({
        id,
        name: text(node, "name"),
        masks: parseMasks(attr(node, "days"), warn, id),
      }),
    },
    warnings,
  );

  const weeks = readSection<WeekDef>(
    root,
    {
      section: "weeksdefs",
      item: "weeksdef",
      keyAttr: "id",
      build: (node, id, warn) => ({
        id,
        name: text(node, "name"),
        masks: parseMasks(attr(node, "weeks"), warn, id),
      }),
    },
    warnings,
  );

  const terms = readSection<TermDef>(
    root,
    {
      section: "termsdefs",
      item: "termsdef",
      keyAttr: "id",
      build: (node, id, warn) => ({
        id,
        name: text(node, "name"),
        short: text(node, "short"),
        masks: parseMasks(attr(node, "terms"), warn, id),
      }),
    },
    warnings,
  );

  const classrooms = readSection<Classroom>(
    root,
    {
      section: "classrooms",
      item: "classroom",
      keyAttr: "id",
      build: (node, id, warn) => {
        const raw = attr(node, "capacity");
        let capacity: number | null = null;
        if (raw !== undefined && raw !== "*") {
          capacity = parseInteger(raw);
          if (capacity === null) warn("invalid_number", id, "capacity");
        }
        return { id, name: text(node, "name"), short: text(node, "short"), capacity };
      },
    },
    warnings,
  );

  // Somente id e short: nome, e-mail, celular, gênero e cor nunca entram no DTO.
  const teachers = readSection<Teacher>(
    root,
    {
      section: "teachers",
      item: "teacher",
      keyAttr: "id",
      build: (node, id) => ({ id, short: text(node, "short") }),
    },
    warnings,
  );

  const subjects = readSection<Subject>(
    root,
    {
      section: "subjects",
      item: "subject",
      keyAttr: "id",
      build: (node, id) => ({ id, name: text(node, "name"), short: text(node, "short") }),
    },
    warnings,
  );

  const classes = readSection<SchoolClass>(
    root,
    {
      section: "classes",
      item: "class",
      keyAttr: "id",
      build: (node, id) => ({ id, name: text(node, "name"), short: text(node, "short") }),
    },
    warnings,
  );

  const lessons = readSection<Lesson>(
    root,
    {
      section: "lessons",
      item: "lesson",
      keyAttr: "id",
      build: (node, id, warn) => {
        let periodsPerCard = parseInteger(attr(node, "periodspercard"));
        if (periodsPerCard === null || periodsPerCard < 1) {
          warn("invalid_number", id, "periodspercard");
          periodsPerCard = 1;
        }
        return {
          id,
          subjectId: attr(node, "subjectid") ?? null,
          classIds: idList(attr(node, "classids")),
          teacherIds: idList(attr(node, "teacherids")),
          classroomIds: idList(attr(node, "classroomids")),
          periodsPerCard,
          termsDefId: attr(node, "termsdefid") ?? null,
          weeksDefId: attr(node, "weeksdefid") ?? null,
          daysDefId: attr(node, "daysdefid") ?? null,
        };
      },
    },
    warnings,
  );

  const lessonIds = new Set(lessons.map((entry) => entry.key));
  const cards = readSection<Card>(
    root,
    {
      section: "cards",
      item: "card",
      keyAttr: null,
      build: (node, _key, warn) => {
        const lessonId = attr(node, "lessonid");
        if (lessonId === undefined) {
          warn("missing_attribute", undefined, "lessonid");
          return null;
        }
        if (!lessonIds.has(lessonId)) {
          warn("unknown_reference", lessonId, "lessonid");
          return null;
        }
        const rawPeriod = attr(node, "period");
        const period = parseInteger(rawPeriod);
        if (rawPeriod !== undefined && period === null) warn("invalid_number", lessonId, "period");
        return {
          lessonId,
          period,
          days: singleMask(attr(node, "days"), warn, lessonId),
          weeks: singleMask(attr(node, "weeks"), warn, lessonId),
          terms: singleMask(attr(node, "terms"), warn, lessonId),
          classroomIds: idList(attr(node, "classroomids")),
        };
      },
    },
    warnings,
  );

  return {
    timetable: {
      periods: values(periods),
      days: values(days),
      terms: values(terms),
      weeks: values(weeks),
      classrooms: values(classrooms),
      teachers: values(teachers),
      subjects: values(subjects),
      classes: values(classes),
      lessons: values(lessons),
      cards: values(cards),
    },
    warnings,
  };
}

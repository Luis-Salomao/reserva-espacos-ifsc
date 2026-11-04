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

/** Acima disso a prévia é parcial: o resto dos cards é ignorado (proteção de memória e tempo). */
const MAX_CARDS = 5000;

const values = <T>(entries: { value: T }[]): T[] => entries.map((entry) => entry.value);

type KnownIds = {
  subjects: Set<string>;
  classes: Set<string>;
  teachers: Set<string>;
  classrooms: Set<string>;
  termsDefs: Set<string>;
  weeksDefs: Set<string>;
  daysDefs: Set<string>;
};

type Entry<T> = { key: string; value: T };

/**
 * Valida os ids de cada aula (§7.2): referência inexistente vira `unknown_reference` (só o id da
 * aula e o nome do atributo, nunca o valor) e é descartada; aula sem turma vira `lesson_without_class`.
 */
function checkLessonReferences(
  entries: Entry<Lesson>[],
  known: KnownIds,
  warnings: ImportWarning[],
): Entry<Lesson>[] {
  return entries.map(({ key, value: lesson }) => {
    const unknown = (detail: string) =>
      warnings.push({ code: "unknown_reference", section: "lessons", ref: key, detail });
    const keepKnown = (ids: string[], set: Set<string>, detail: string): string[] => {
      const kept = ids.filter((id) => set.has(id));
      if (kept.length < ids.length) unknown(detail);
      return kept;
    };
    const single = (id: string | null, set: Set<string>, detail: string): string | null => {
      if (id === null || set.has(id)) return id;
      unknown(detail);
      return null;
    };
    const checked: Lesson = {
      ...lesson,
      subjectId: single(lesson.subjectId, known.subjects, "subjectid"),
      classIds: keepKnown(lesson.classIds, known.classes, "classids"),
      teacherIds: keepKnown(lesson.teacherIds, known.teachers, "teacherids"),
      classroomIds: keepKnown(lesson.classroomIds, known.classrooms, "classroomids"),
      termsDefId: single(lesson.termsDefId, known.termsDefs, "termsdefid"),
      weeksDefId: single(lesson.weeksDefId, known.weeksDefs, "weeksdefid"),
      daysDefId: single(lesson.daysDefId, known.daysDefs, "daysdefid"),
    };
    if (checked.classIds.length === 0) {
      warnings.push({ code: "lesson_without_class", section: "lessons", ref: key });
    }
    return { key, value: checked };
  });
}

/** Remove cards exatamente iguais (a ordem das salas não importa); o primeiro vence. */
function dedupeCards(cards: Card[], warnings: ImportWarning[]): Card[] {
  const seen = new Set<string>();
  const kept: Card[] = [];
  for (const card of cards) {
    const key = JSON.stringify([
      card.lessonId,
      card.period,
      card.days,
      card.weeks,
      card.terms,
      [...card.classroomIds].sort(),
      card.roomsUnknown === true,
    ]);
    if (seen.has(key)) {
      warnings.push({ code: "duplicate_card", section: "cards", ref: card.lessonId });
      continue;
    }
    seen.add(key);
    kept.push(card);
  }
  return kept;
}

function limitCards(cards: Card[], warnings: ImportWarning[]): Card[] {
  if (cards.length <= MAX_CARDS) return cards;
  warnings.push({ code: "too_many_cards", section: "cards", detail: String(cards.length) });
  return cards.slice(0, MAX_CARDS);
}

/**
 * Converte a árvore XML em `AscTimetable`. Nunca lança: problemas viram avisos.
 * Dados de alunos (students, groups.studentids, studentsubjects) e campos pessoais
 * de docentes além do nome (AD-001) nunca são lidos.
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

  // Id, sigla e nome (AD-001): e-mail, celular, gênero e cor nunca entram no DTO.
  const teachers = readSection<Teacher>(
    root,
    {
      section: "teachers",
      item: "teacher",
      keyAttr: "id",
      build: (node, id) => {
        const short = text(node, "short");
        const fullName = [text(node, "firstname"), text(node, "lastname")].join(" ").trim();
        return { id, short, name: attr(node, "name") ?? (fullName || short) };
      },
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

  const known: KnownIds = {
    subjects: new Set(subjects.map((entry) => entry.key)),
    classes: new Set(classes.map((entry) => entry.key)),
    teachers: new Set(teachers.map((entry) => entry.key)),
    classrooms: new Set(classrooms.map((entry) => entry.key)),
    termsDefs: new Set(terms.map((entry) => entry.key)),
    weeksDefs: new Set(weeks.map((entry) => entry.key)),
    daysDefs: new Set(days.map((entry) => entry.key)),
  };

  const rawLessons = readSection<Lesson>(
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

  const lessons = checkLessonReferences(rawLessons, known, warnings);
  const lessonIds = new Set(lessons.map((entry) => entry.key));
  const rawCards = readSection<Card>(
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
        const listed = idList(attr(node, "classroomids"));
        const classroomIds = listed.filter((id) => known.classrooms.has(id));
        if (classroomIds.length < listed.length)
          warn("unknown_reference", lessonId, "classroomids");
        const card: Card = {
          lessonId,
          period,
          days: singleMask(attr(node, "days"), warn, lessonId),
          weeks: singleMask(attr(node, "weeks"), warn, lessonId),
          terms: singleMask(attr(node, "terms"), warn, lessonId),
          classroomIds,
        };
        if (listed.length > 0 && classroomIds.length === 0) card.roomsUnknown = true;
        return card;
      },
    },
    warnings,
  );

  const cards = limitCards(dedupeCards(values(rawCards), warnings), warnings);

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
      cards,
    },
    warnings,
  };
}

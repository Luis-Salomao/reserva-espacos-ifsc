/** Grupos já separados pelo servidor: "minhas" não se repetem em "todas". */
export type SubjectGroups = {
  mine: readonly string[];
  all: readonly string[];
};

/** Minúsculas, sem acento e sem espaços nas pontas. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Chave de agrupamento de disciplinas: normaliza texto, travessões e espaçamento em volta do traço. */
export function normalizeSubject(title: string): string {
  return normalizeText(title)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/ ?- ?/g, " - ")
    .trim();
}

/**
 * Filtra os dois grupos pelo texto (contém, sem acento nem caixa). `exact` só é verdadeiro quando
 * o texto, depois de normalizar, é igual a algum item — não basta ser um pedaço.
 */
export function matchSubjects(
  groups: SubjectGroups,
  query: string,
): { mine: string[]; all: string[]; exact: boolean } {
  const needle = normalizeText(query);
  const keep = (title: string) => needle === "" || normalizeText(title).includes(needle);
  const mine = groups.mine.filter(keep);
  const all = groups.all.filter(keep);
  const exact =
    needle !== "" &&
    [...groups.mine, ...groups.all].some((title) => normalizeText(title) === needle);
  return { mine, all, exact };
}

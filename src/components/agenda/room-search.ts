/** Busca local: números e filtros estruturais são exatos; palavras aceitam pequenos erros. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^(lab|labs|laboratorio|laboratorios)$/.test(word)) return "laboratorio";
      return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
    });
}

/** Distância de edição com transposição, para erros como rdees → redes. */
function distance(a: string, b: string): number {
  const width = b.length + 1;
  const grid = new Uint16Array((a.length + 1) * width);
  const read = (i: number, j: number) => grid[i * width + j] ?? 0;
  for (let i = 0; i <= a.length; i++) grid[i * width] = i;
  for (let j = 0; j <= b.length; j++) grid[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let value = Math.min(
        read(i - 1, j) + 1,
        read(i, j - 1) + 1,
        read(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, read(i - 2, j - 2) + 1);
      grid[i * width + j] = value;
    }
  }
  return read(a.length, b.length);
}

export function matchesRoomSearch(name: string, query: string): boolean {
  let search = normalize(query).slice(0, 200);
  if (!search) return true;
  const code = /(?:^|\s)([a-z])\s*(\d{3})(?!\d)/.exec(normalize(name));
  const block = code?.[1];
  const floor = code?.[2]?.[0];
  search = search
    .replace(/\b(primeiro|primeira)\b/g, "1")
    .replace(/\b(segundo|segunda)\b/g, "2")
    .replace(/\b(terceiro|terceira)\b/g, "3");
  let valid = true;
  search = search.replace(/\bbloco\s+([a-z])\b/g, (_, value: string) => {
    if (block !== value) valid = false;
    return " ";
  });
  search = search.replace(
    /\b(?:andar|piso)\s+(\d)\b|\b(\d)\s+(?:andar|piso)\b/g,
    (_, first: string | undefined, last: string | undefined) => {
      if (floor !== (first ?? last)) valid = false;
      return " ";
    },
  );
  search = search.replace(/\b([a-z])\s*(\d{3})\b/g, (_, letter: string, number: string) => {
    if (block !== letter || code?.[2] !== number) valid = false;
    return " ";
  });
  if (!valid) return false;
  const candidates = words(normalize(name).replace(/([a-z])(\d)/g, "$1 $2"));
  if (block) candidates.push(block);
  const terms = words(search).filter(
    (term) =>
      !["de", "do", "da", "dos", "das", "sala", "salas", "o", "no", "na"].includes(term) ||
      term === block,
  );
  return terms.every((term) =>
    candidates.some((candidate) => {
      if (/\d/.test(term) || term.length === 1) return candidate === term;
      if (candidate.startsWith(term)) return true;
      const tolerance = term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0;
      return (
        tolerance > 0 &&
        Math.abs(candidate.length - term.length) <= tolerance &&
        distance(term, candidate) <= tolerance
      );
    }),
  );
}

/** Ocorrência de uma versão da grade; horários locais de parede "YYYY-MM-DDTHH:MM". */
export type VersionOccurrence = {
  lessonKey: string;
  date: string;
  spaceId: string;
  startsAt: string;
  endsAt: string;
  responsibleUserId: string | null;
  occupationId?: string;
  status?: "ativa" | "cancelada";
};

/** Par de ocorrências equivalentes entre a versão vigente e a nova. */
type VersionPair = { current: VersionOccurrence; next: VersionOccurrence };

/** Alteração de um grupo (lessonKey + date): cancelar o que sumiu e inserir o que surgiu. */
type VersionChange = {
  lessonKey: string;
  date: string;
  cancel: VersionOccurrence[];
  alreadyCancelled: VersionOccurrence[];
  insert: VersionOccurrence[];
};

export type VersionDiff = {
  unchanged: VersionPair[];
  keptCancelled: VersionPair[];
  responsibleChanged: VersionPair[];
  changed: VersionChange[];
  removed: VersionOccurrence[];
  removedAlreadyCancelled: VersionOccurrence[];
  added: VersionOccurrence[];
};

function compareOccurrences(a: VersionOccurrence, b: VersionOccurrence): number {
  return (
    a.date.localeCompare(b.date) ||
    a.lessonKey.localeCompare(b.lessonKey) ||
    a.startsAt.localeCompare(b.startsAt) ||
    a.spaceId.localeCompare(b.spaceId) ||
    a.endsAt.localeCompare(b.endsAt) ||
    // Ativas antes das canceladas: a correspondência exata consome a ativa primeiro.
    Number(a.status === "cancelada") - Number(b.status === "cancelada") ||
    (a.responsibleUserId ?? "").localeCompare(b.responsibleUserId ?? "") ||
    (a.occupationId ?? "").localeCompare(b.occupationId ?? "")
  );
}

function comparePairs(a: VersionPair, b: VersionPair): number {
  return compareOccurrences(a.next, b.next);
}

const groupKey = (o: VersionOccurrence) => `${o.lessonKey}\u0000${o.date}`;
const slotKey = (o: VersionOccurrence) => `${o.spaceId}\u0000${o.startsAt}\u0000${o.endsAt}`;

function groupBy(list: VersionOccurrence[]): Map<string, VersionOccurrence[]> {
  const groups = new Map<string, VersionOccurrence[]>();
  for (const o of [...list].sort(compareOccurrences)) {
    const key = groupKey(o);
    const bucket = groups.get(key);
    if (bucket) bucket.push(o);
    else groups.set(key, [o]);
  }
  return groups;
}

/**
 * Compara a versão vigente com a nova pela identidade natural (lessonKey + date), tratando
 * (spaceId, startsAt, endsAt) como multiconjunto. Ocorrência cancelada que continua igual é
 * mantida cancelada e nunca reativada. Saída determinística, ordenada por (date, lessonKey, startsAt, spaceId).
 */
export function diffVersions(current: VersionOccurrence[], next: VersionOccurrence[]): VersionDiff {
  const result: VersionDiff = {
    unchanged: [],
    keptCancelled: [],
    responsibleChanged: [],
    changed: [],
    removed: [],
    removedAlreadyCancelled: [],
    added: [],
  };
  const currentGroups = groupBy(current);
  const nextGroups = groupBy(next);
  const keys = new Set([...currentGroups.keys(), ...nextGroups.keys()]);

  for (const key of keys) {
    const cur = currentGroups.get(key) ?? [];
    const nxt = nextGroups.get(key) ?? [];
    const available = new Map<string, VersionOccurrence[]>();
    for (const o of cur) {
      const k = slotKey(o);
      const bucket = available.get(k);
      if (bucket) bucket.push(o);
      else available.set(k, [o]);
    }
    const leftoverNext: VersionOccurrence[] = [];
    for (const n of nxt) {
      const match = available.get(slotKey(n))?.shift();
      if (!match) {
        leftoverNext.push(n);
        continue;
      }
      const pair = { current: match, next: n };
      if (match.status === "cancelada") result.keptCancelled.push(pair);
      else if (match.responsibleUserId !== n.responsibleUserId)
        result.responsibleChanged.push(pair);
      else result.unchanged.push(pair);
    }
    const leftoverCurrent = [...available.values()].flat().sort(compareOccurrences);
    const sample = cur[0] ?? nxt[0];
    if (!sample) continue;
    if (leftoverCurrent.length > 0 && leftoverNext.length > 0) {
      result.changed.push({
        lessonKey: sample.lessonKey,
        date: sample.date,
        cancel: leftoverCurrent.filter((o) => o.status !== "cancelada"),
        alreadyCancelled: leftoverCurrent.filter((o) => o.status === "cancelada"),
        insert: leftoverNext,
      });
    } else if (leftoverCurrent.length > 0) {
      for (const o of leftoverCurrent) {
        (o.status === "cancelada" ? result.removedAlreadyCancelled : result.removed).push(o);
      }
    } else {
      result.added.push(...leftoverNext);
    }
  }

  result.unchanged.sort(comparePairs);
  result.keptCancelled.sort(comparePairs);
  result.responsibleChanged.sort(comparePairs);
  result.changed.sort(
    (a, b) => a.date.localeCompare(b.date) || a.lessonKey.localeCompare(b.lessonKey),
  );
  result.removed.sort(compareOccurrences);
  result.removedAlreadyCancelled.sort(compareOccurrences);
  result.added.sort(compareOccurrences);
  return result;
}

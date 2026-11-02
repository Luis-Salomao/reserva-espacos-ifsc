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
  insert: VersionOccurrence[];
};

export type VersionDiff = {
  unchanged: VersionPair[];
  keptCancelled: VersionPair[];
  /** Cancelada antes cuja sala/horário mudou: a nova ocorrência pareia com ela e não é inserida. */
  movedCancelled: VersionPair[];
  responsibleChanged: VersionPair[];
  changed: VersionChange[];
  removed: VersionOccurrence[];
  removedAlreadyCancelled: VersionOccurrence[];
  added: VersionOccurrence[];
};

/** Comparação de texto por unidades de código (determinística, sem depender de locale). */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareOccurrences(a: VersionOccurrence, b: VersionOccurrence): number {
  return (
    cmp(a.date, b.date) ||
    cmp(a.lessonKey, b.lessonKey) ||
    cmp(a.startsAt, b.startsAt) ||
    cmp(a.spaceId, b.spaceId) ||
    cmp(a.endsAt, b.endsAt) ||
    // Ativas antes das canceladas: a correspondência exata consome a ativa primeiro.
    Number(a.status === "cancelada") - Number(b.status === "cancelada") ||
    cmp(a.responsibleUserId ?? "", b.responsibleUserId ?? "") ||
    cmp(a.occupationId ?? "", b.occupationId ?? "")
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
    movedCancelled: [],
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
    // Duas passadas: primeiro o mesmo horário com o mesmo responsável; depois o mesmo horário
    // com qualquer responsável (o que sobrou vira só troca de responsável, não cancelamento).
    const matches = new Map<VersionOccurrence, VersionOccurrence>();
    for (const sameResponsible of [true, false]) {
      for (const n of nxt) {
        if (matches.has(n)) continue;
        const bucket = available.get(slotKey(n));
        const index =
          bucket?.findIndex(
            (c) => !sameResponsible || c.responsibleUserId === n.responsibleUserId,
          ) ?? -1;
        const match = index >= 0 ? bucket?.splice(index, 1)[0] : undefined;
        if (match) matches.set(n, match);
      }
    }
    let leftoverNext: VersionOccurrence[] = [];
    for (const n of nxt) {
      const match = matches.get(n);
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
    let leftoverCurrent = [...available.values()].flat().sort(compareOccurrences);
    if (leftoverNext.length > 0) {
      // Regra 6: cancelamento anterior é preservado. As ocorrências novas do grupo pareiam 1:1
      // (ordem determinística) com as canceladas que sobraram; as pareadas não são inseridas.
      const cancelledLeft = leftoverCurrent.filter((o) => o.status === "cancelada");
      const paired = Math.min(cancelledLeft.length, leftoverNext.length);
      for (let index = 0; index < paired; index++) {
        result.movedCancelled.push({
          current: cancelledLeft[index] as VersionOccurrence,
          next: leftoverNext[index] as VersionOccurrence,
        });
      }
      const usedCurrent = new Set(cancelledLeft.slice(0, paired));
      leftoverCurrent = leftoverCurrent.filter((o) => !usedCurrent.has(o));
      leftoverNext = leftoverNext.slice(paired);
    }
    const sample = cur[0] ?? nxt[0];
    if (!sample) continue;
    if (leftoverCurrent.length > 0 && leftoverNext.length > 0) {
      result.changed.push({
        lessonKey: sample.lessonKey,
        date: sample.date,
        cancel: leftoverCurrent.filter((o) => o.status !== "cancelada"),
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
  result.movedCancelled.sort(comparePairs);
  result.responsibleChanged.sort(comparePairs);
  result.changed.sort((a, b) => cmp(a.date, b.date) || cmp(a.lessonKey, b.lessonKey));
  result.removed.sort(compareOccurrences);
  result.removedAlreadyCancelled.sort(compareOccurrences);
  result.added.sort(compareOccurrences);
  return result;
}

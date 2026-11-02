import type { ImportPreview } from "#/import-asc/index.ts";

/** Saída do `--json`: sem a grade completa, a menos que `full`. */
export function previewForJson(preview: ImportPreview, full: boolean): unknown {
  if (full) return preview;
  const { timetable: _timetable, slots: _slots, overlapsDetail: _overlaps, ...summary } = preview;
  return summary;
}

function section(title: string, lines: string[]): string[] {
  return ["", title, ...lines.map((line) => `  ${line}`)];
}

function warningLines(preview: ImportPreview): string[] {
  if (preview.warnings.length === 0) return ["Nenhum"];
  return preview.warnings.map((group) => {
    const origin = group.source === "xml" ? "arquivo" : "grade";
    const examples = group.examples.length > 0 ? ` (ex.: ${group.examples.join(", ")})` : "";
    return `${group.count}x [${origin}/${group.section}] ${group.message}${examples}`;
  });
}

/** Resumo em pt-BR, linhas curtas para terminais estreitos. Sem dados de docentes. */
export function formatPreviewText(preview: ImportPreview): string {
  const { counts, slotsByStatus, overlaps } = preview;
  const lines: string[] = ["Prévia da importação (nada foi gravado)"];
  if (preview.partial) {
    lines.push(
      "ATENÇÃO: prévia parcial; o arquivo tem cards demais e só os primeiros foram lidos.",
    );
  }

  lines.push(
    ...section("Conteúdo do arquivo", [
      `Períodos: ${counts.periods}`,
      `Salas: ${counts.classrooms}`,
      `Docentes: ${counts.teachers}`,
      `Disciplinas: ${counts.subjects}`,
      `Turmas: ${counts.classes}`,
      `Aulas: ${counts.lessons}`,
      `Cards: ${counts.cards}`,
    ]),
    ...section(`Horários semanais: ${counts.slots}`, [
      `Com uma sala: ${slotsByStatus.applicable}`,
      `Sem sala: ${slotsByStatus.no_room}`,
      `Com várias salas: ${slotsByStatus.multiple_rooms}`,
    ]),
    ...section(
      "Sobreposições na mesma sala",
      overlaps.certain + overlaps.possible === 0
        ? ["Nenhuma"]
        : [
            `Certas: ${overlaps.certain}`,
            `Possíveis: ${overlaps.possible}`,
            ...(preview.overlapsTruncated
              ? [
                  `Mostrando ${preview.overlapsDetail.length} de ${overlaps.certain + overlaps.possible} no detalhe (--json --full)`,
                ]
              : []),
          ],
    ),
    ...section(
      "Durações usadas",
      preview.termsUsed.length === 0
        ? ["Nenhuma"]
        : preview.termsUsed.map((term) => `${term.label}: ${term.slots}`),
    ),
    ...section("Avisos", warningLines(preview)),
    ...section(
      "Salas (nº de horários)",
      preview.classrooms.length === 0
        ? ["Nenhuma"]
        : preview.classrooms.map((room) => `${room.short || room.id}: ${room.slots}`),
    ),
  );

  return `${lines.join("\n")}\n`;
}

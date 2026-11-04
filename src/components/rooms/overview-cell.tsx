import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { weekdayOf } from "#/domain/calendar";
import {
  type Cell,
  RESERVA_TONE,
  SUBJECT_PALETTE,
  subjectOf,
  subjectTone,
} from "#/domain/overview";

type Block = RoomsWeek["days"][number]["blocks"][number];

export type OverviewCellData = Cell<AgendaItem, Block>;

const WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** "sexta 13/11". */
export function dayLabel(date: string): string {
  return `${WEEKDAYS[weekdayOf(date)] ?? ""} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Reserva avulsa tem a cor neutra; aula importada, a cor da matéria. */
function toneOf(item: Pick<AgendaItem, "source" | "title">) {
  return item.source === "manual"
    ? RESERVA_TONE
    : (SUBJECT_PALETTE[subjectTone(subjectOf(item.title))] ?? RESERVA_TONE);
}

/** Cores claro/escuro em variáveis CSS, lidas por `bg-[var(--tone-light)]`/`dark:bg-[var(--tone-dark)]`. */
function toneStyle(tone: { light: string; dark: string }): CSSProperties {
  return { "--tone-light": tone.light, "--tone-dark": tone.dark } as CSSProperties;
}

type Props = {
  cell: OverviewCellData;
  room: { id: string; name: string };
  date: string;
};

const SQUARE = "relative size-4 shrink-0 rounded-[3px]";

/**
 * Um bloco de uma sala num dia: vazio com contorno; ocupado com a cor da matéria, uma faixa por
 * ocupação e canto recortado quando alguma não cobre o bloco inteiro.
 */
export function OverviewCell({ cell, room, date }: Props) {
  const where = { "data-room": room.id, "data-date": date, "data-block": cell.block.short };
  if (cell.items.length === 0) {
    return <span {...where} data-cell="livre" className={`${SQUARE} block border border-border`} />;
  }
  const partial = cell.items.some((entry) => entry.partial);
  const titles = cell.items.map((entry) => entry.item.title).join(" e ");
  return (
    <Link
      to="/"
      search={{ espaco: room.id, data: date }}
      {...where}
      data-cell="ocupado"
      data-partial={partial ? "" : undefined}
      aria-label={`${room.name}, ${dayLabel(date)}, ${cell.block.label} ${cell.block.start}–${cell.block.end}: ${titles}`}
      className={`${SQUARE} flex overflow-hidden outline-offset-2`}
    >
      {cell.items.map(({ item }) => (
        <span
          key={item.id}
          data-stripe=""
          style={toneStyle(toneOf(item))}
          className="h-full flex-1 bg-[var(--tone-light)] dark:bg-[var(--tone-dark)]"
        />
      ))}
      {partial && (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 size-1.5 bg-background [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      )}
    </Link>
  );
}

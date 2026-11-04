import { Link } from "@tanstack/react-router";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { AgendaItem, RoomsWeek } from "#/application/bookings";
import { Avatar } from "#/components/avatar";
import { weekdayOf } from "#/domain/calendar";
import {
  type Cell,
  RESERVA_TONE,
  SUBJECT_PALETTE,
  subjectOf,
  subjectTone,
} from "#/domain/overview";
import { cn } from "#/lib/utils";

type Block = RoomsWeek["days"][number]["blocks"][number];

type OverviewCellData = Cell<AgendaItem, Block>;

const WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** "sexta 13/11". */
export function dayLabel(date: string): string {
  return `${WEEKDAYS[weekdayOf(date)] ?? ""} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

type Tone = { light: string; dark: string };

/** Item da legenda: a chave separa "Reserva" de uma matéria com o mesmo nome. */
export type LegendEntry = { key: string; label: string; tone: Tone };

/** Reserva avulsa tem a cor neutra; aula importada, a cor da matéria. */
export function legendEntryOf(item: Pick<AgendaItem, "source" | "title">): LegendEntry {
  if (item.source === "manual") return { key: "reserva", label: "Reserva", tone: RESERVA_TONE };
  const subject = subjectOf(item.title);
  return {
    key: `materia:${subject}`,
    label: subject,
    tone: SUBJECT_PALETTE[subjectTone(subject)] ?? RESERVA_TONE,
  };
}

/** Cores claro/escuro em variáveis CSS, lidas por `bg-[var(--tone-light)]`/`dark:bg-[var(--tone-dark)]`. */
export function toneStyle(tone: Tone): CSSProperties {
  return { "--tone-light": tone.light, "--tone-dark": tone.dark } as CSSProperties;
}

type Props = {
  cell: OverviewCellData;
  room: { id: string; name: string };
  date: string;
  /** Chave da matéria destacada na legenda; as faixas de outras matérias ficam esmaecidas. */
  highlight: string | null;
  /** Visitante nunca vê pessoas no cartão. */
  isVisitor: boolean;
  /** Celular: quadradinho de 32 px, e o toque abre o cartão em vez de navegar. */
  compact: boolean;
  /** Dentro do trecho selecionado (ou sendo arrastado). */
  selected: boolean;
  /** Seleciona só este bloco: clique no livre, Enter/Espaço no livre, Espaço no ocupado, toque. */
  onSelect: () => void;
  /** Começo e passagem do arrasto com o mouse. */
  onPointerDown: (event: PointerEvent) => void;
  onPointerEnter: () => void;
};

const SQUARE = "relative shrink-0 rounded-[3px]";
const CARD_GAP = 8;
/** Abaixo disso o cartão abre embaixo do quadradinho, para não sair da tela. */
const CARD_ROOM = 160;
/** Metade da largura do cartão (`w-64`) mais a margem até a borda da tela. */
const CARD_HALF = 136;

/** Turma do título importado (`MATÉRIA — TURMA`); `null` sem separador. */
function classOf(title: string): string | null {
  const cut = title.indexOf(" — ");
  const rest = cut === -1 ? "" : title.slice(cut + 3).trim();
  return rest === "" ? null : rest;
}

type CardProps = {
  id: string;
  anchor: DOMRect;
  items: OverviewCellData["items"];
  roomName: string;
  date: string;
  isVisitor: boolean;
};

/** Detalhes das ocupações do bloco; pessoa (avatar e nome) só para quem está logado. */
function OverviewCard({ id, anchor, items, roomName, date, isVisitor }: CardProps) {
  const below = anchor.top < CARD_ROOM;
  const center = anchor.left + anchor.width / 2;
  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={{
        left: Math.min(Math.max(center, CARD_HALF), window.innerWidth - CARD_HALF),
        top: below ? anchor.bottom + CARD_GAP : anchor.top - CARD_GAP,
      }}
      className={cn(
        "pointer-events-none fixed z-50 grid w-64 -translate-x-1/2 gap-2 rounded-lg border border-border bg-popover p-3 text-[13px] text-popover-foreground shadow-md",
        !below && "-translate-y-full",
      )}
    >
      {items.map(({ item }) => {
        const entry = legendEntryOf(item);
        const turma = item.source === "manual" ? null : classOf(item.title);
        return (
          <div key={item.id} className="grid gap-0.5">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <span
                aria-hidden="true"
                style={toneStyle(entry.tone)}
                className="size-2.5 shrink-0 rounded-[2px] bg-[var(--tone-light)] dark:bg-[var(--tone-dark)]"
              />
              {item.source === "manual" ? item.title : entry.label}
            </p>
            {item.source === "manual" ? (
              <p className="text-muted-foreground">Reserva</p>
            ) : (
              turma !== null && <p className="text-muted-foreground">{`Turma ${turma}`}</p>
            )}
            <p className="text-muted-foreground tabular-nums">
              {`${roomName} · ${dayLabel(date)} · ${item.start}–${item.end}`}
            </p>
            {!isVisitor && item.person !== null && (
              <p className="flex items-center gap-1.5">
                <Avatar name={item.person.name} size="sm" />
                {item.person.name}
              </p>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

/**
 * Um bloco de uma sala num dia: vazio com contorno; ocupado com a cor da matéria, uma faixa por
 * ocupação e canto recortado quando alguma não cobre o bloco inteiro. Mouse ou foco num ocupado
 * aumenta o quadradinho e abre o cartão de detalhes; o livre seleciona o bloco.
 */
export function OverviewCell({
  cell,
  room,
  date,
  highlight,
  isVisitor,
  compact,
  selected,
  onSelect,
  onPointerDown,
  onPointerEnter,
}: Props) {
  const cardId = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const size = compact ? "size-8" : "size-4";
  const where = {
    "data-room": room.id,
    "data-date": date,
    "data-block": cell.block.short,
    "data-selected": selected ? "" : undefined,
    onPointerDown,
    onPointerEnter,
  };
  if (cell.items.length === 0) {
    return (
      <button
        type="button"
        {...where}
        data-cell="livre"
        aria-label={`Selecionar ${room.name}, ${dayLabel(date)}, ${cell.block.label} ${cell.block.start}–${cell.block.end}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          SQUARE,
          size,
          "block border border-border outline-offset-2 hover:border-primary hover:bg-primary/15",
          selected && "border-primary bg-primary/30 hover:bg-primary/30",
        )}
      />
    );
  }
  const show = (event: { currentTarget: Element }) =>
    setAnchor(event.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  const partial = cell.items.some((entry) => entry.partial);
  const titles = cell.items.map((entry) => entry.item.title).join(" e ");
  const common = {
    ...where,
    "data-cell": "ocupado",
    "data-partial": partial ? "" : undefined,
    "aria-label": `${room.name}, ${dayLabel(date)}, ${cell.block.label} ${cell.block.start}–${cell.block.end}: ${titles}`,
    "aria-describedby": anchor === null ? undefined : cardId,
    onBlur: hide,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
      if (event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    },
    className: cn(
      SQUARE,
      size,
      "flex overflow-hidden outline-offset-2 transition-transform duration-120 motion-reduce:transition-none",
      anchor !== null && "z-10 scale-160 motion-reduce:scale-100",
      selected && "ring-2 ring-primary",
    ),
  };
  const content = (
    <>
      {cell.items.map(({ item }) => {
        const entry = legendEntryOf(item);
        const dimmed = highlight !== null && entry.key !== highlight;
        return (
          <span
            key={item.id}
            data-stripe=""
            data-dimmed={dimmed ? "" : undefined}
            style={toneStyle(entry.tone)}
            className={cn(
              "h-full flex-1 bg-[var(--tone-light)] transition-opacity dark:bg-[var(--tone-dark)]",
              dimmed && "opacity-20",
            )}
          />
        );
      })}
      {partial && (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 size-1.5 bg-background [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        />
      )}
      {anchor !== null && (
        <OverviewCard
          id={cardId}
          anchor={anchor}
          items={cell.items}
          roomName={room.name}
          date={date}
          isVisitor={isVisitor}
        />
      )}
    </>
  );
  if (compact) {
    return (
      <button
        type="button"
        {...common}
        onClick={(event) => {
          if (anchor === null) show(event);
          else hide();
          onSelect();
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <Link
      to="/"
      search={{ espaco: room.id, data: date }}
      draggable={false}
      {...common}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
    >
      {content}
    </Link>
  );
}

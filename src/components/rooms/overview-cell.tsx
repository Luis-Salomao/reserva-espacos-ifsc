import { Link } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { AgendaItem, RoomsRange } from "#/application/bookings";
import { Avatar } from "#/components/avatar";
import { Tag } from "#/components/ds";
import { EquipmentMarks } from "#/components/equipment-marks";
import { freeIntervals, type TimeRange } from "#/domain/availability";
import { isMaintenanceTitle, MAINTENANCE_PREFIX } from "#/domain/booking-kind";
import { weekdayOf } from "#/domain/calendar";
import type { SpaceEquipment } from "#/domain/equipment";
import { legendEntryOf } from "#/domain/occupation-tone";
import type { Cell } from "#/domain/overview";
import { patternStyle, TONE, toneStyle } from "#/lib/tone-style";
import { cn } from "#/lib/utils";

type Block = RoomsRange["days"][number]["blocks"][number];

type OverviewCellData = Cell<AgendaItem, Block>;

const WEEKDAYS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/** "sexta 13/11". */
export function dayLabel(date: string): string {
  return `${WEEKDAYS[weekdayOf(date)] ?? ""} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

type Props = {
  cell: OverviewCellData;
  room: { id: string; name: string; equipment?: SpaceEquipment };
  date: string;
  /** Chave da matéria destacada na legenda; as faixas de outras matérias ficam esmaecidas. */
  highlight: string | null;
  /** Visitante nunca vê pessoas no cartão. */
  isVisitor: boolean;
  /** Celular: quadradinho de 32 px, e o toque abre o cartão em vez de navegar. */
  compact: boolean;
  periodBreak?: boolean;
  /** O bloco já terminou: o livre vira um quadradinho estático e o ocupado não inicia seleção. */
  past?: boolean;
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
  free: TimeRange[];
  equipment?: SpaceEquipment | undefined;
};

/** Detalhes das ocupações do bloco; pessoa (avatar e nome) só para quem está logado. */
function OverviewCard({
  id,
  anchor,
  items,
  roomName,
  date,
  isVisitor,
  free,
  equipment,
}: CardProps) {
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
      {items.length > 1 && (
        <p className="border-b pb-2 text-xs font-medium text-muted-foreground">
          {items.length} ocupações neste bloco
        </p>
      )}
      {items.map(({ item }) => {
        const entry = legendEntryOf(item);
        const turma = item.source === "manual" ? null : classOf(item.title);
        const isMaintenance = item.source === "manual" && isMaintenanceTitle(item.title);
        const title = isMaintenance ? item.title.slice(MAINTENANCE_PREFIX.length) : item.title;
        return (
          <div key={item.id} className="grid gap-0.5">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <span
                aria-hidden="true"
                style={toneStyle(entry.tone)}
                className={cn("size-2.5 shrink-0 rounded-[2px]", TONE.solid)}
              />
              {isMaintenance && <Wrench aria-hidden="true" className="size-3 shrink-0" />}
              {item.source === "manual" ? title : entry.label}
            </p>
            {isMaintenance ? (
              <Tag tone="neutral" className="w-fit bg-warn text-warn-text">
                <Wrench aria-hidden="true" className="size-3" />
                Manutenção
              </Tag>
            ) : item.source === "manual" ? (
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
      {free.length > 0 && (
        <p className="border-t pt-2 text-muted-foreground tabular-nums">
          {`Livre: ${free.map((range) => `${range.start}–${range.end}`).join("; ")}`}
        </p>
      )}
      <EquipmentMarks equipment={equipment} showNotes={!isVisitor} />
    </div>,
    document.body,
  );
}

/**
 * Um bloco de uma sala num dia: vazio com contorno; ocupado com a cor da matéria, uma faixa por
 * ocupação posicionada do início (topo) ao fim (base) do bloco. Mouse ou foco num ocupado
 * aumenta o quadradinho e abre o cartão de detalhes; o livre seleciona o bloco.
 */
export function OverviewCell({
  cell,
  room,
  date,
  highlight,
  isVisitor,
  compact,
  periodBreak = false,
  past = false,
  selected,
  onSelect,
  onPointerDown,
  onPointerEnter,
}: Props) {
  const cardId = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const size = cn(compact ? "size-8" : "size-7", periodBreak && "ml-2");
  const where = {
    "data-room": room.id,
    "data-date": date,
    "data-block": cell.block.short,
    "data-selected": selected ? "" : undefined,
    "data-past": past ? "" : undefined,
    // Passado não se reserva: sem começo nem passagem de arrasto.
    ...(past ? {} : { onPointerDown, onPointerEnter }),
  };
  if (cell.items.length === 0 && past) {
    return (
      <span
        role="img"
        {...where}
        data-cell="livre"
        title={`Livre · ${cell.block.start}–${cell.block.end} (já passou)`}
        aria-label={`${room.name}, ${dayLabel(date)}, ${cell.block.label} ${cell.block.start}–${cell.block.end} (já passou)`}
        className={cn(SQUARE, size, "block border border-divider")}
      />
    );
  }
  if (cell.items.length === 0) {
    return (
      <button
        type="button"
        {...where}
        data-cell="livre"
        title={`Livre · ${cell.block.start}–${cell.block.end}`}
        aria-label={`Selecionar ${room.name}, ${dayLabel(date)}, ${cell.block.label} ${cell.block.start}–${cell.block.end}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          SQUARE,
          size,
          "block border border-divider outline-offset-2 hover:border-primary hover:bg-primary/15",
          selected && "border-primary bg-primary/30 hover:bg-primary/30",
        )}
      />
    );
  }
  const show = (event: { currentTarget: Element }) =>
    setAnchor(event.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  const partial = cell.items.some((entry) => entry.partial);
  const free = freeIntervals(
    { opens: cell.block.start, closes: cell.block.end },
    cell.items.map(({ item }) => item),
  );
  const titles = cell.items.map(({ item }) => `${item.title} ${item.start}–${item.end}`).join("; ");
  const freeText =
    free.length === 0
      ? ""
      : `; Livre: ${free.map((range) => `${range.start}–${range.end}`).join("; ")}`;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const blockStart = minutes(cell.block.start);
  const duration = minutes(cell.block.end) - blockStart;
  const common = {
    ...where,
    "data-cell": "ocupado",
    "data-partial": partial ? "" : undefined,
    "aria-label": `${room.name}, ${dayLabel(date)}, ${cell.block.label} ${cell.block.start}–${cell.block.end}: ${titles}${freeText}${past ? " (já passou)" : ""}`,
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
      "flex gap-px overflow-hidden border border-divider bg-background outline-offset-2 transition-transform duration-120 motion-reduce:transition-none",
      anchor !== null && "z-10 scale-160 motion-reduce:scale-100",
      selected && "ring-2 ring-primary",
    ),
  };
  const content = (
    <>
      {cell.items.length > 1 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 z-10 grid size-3.5 place-items-center rounded-bl bg-background/90 text-[9px] font-bold text-foreground"
        >
          {cell.items.length}
        </span>
      )}
      {cell.items.map(({ item }) => {
        const entry = legendEntryOf(item);
        const dimmed = highlight !== null && entry.key !== highlight;
        const start = Math.max(blockStart, minutes(item.start));
        const end = Math.min(minutes(cell.block.end), minutes(item.end));
        return (
          <span key={item.id} aria-hidden="true" className="relative h-full flex-1">
            <span
              data-stripe=""
              data-dimmed={dimmed ? "" : undefined}
              style={{
                ...toneStyle(entry.tone),
                ...patternStyle(entry.pattern),
                top: `${((start - blockStart) / duration) * 100}%`,
                height: `${((end - start) / duration) * 100}%`,
              }}
              className={cn(
                "absolute inset-x-0 transition-opacity",
                TONE.solid,
                dimmed && "opacity-20",
              )}
            />
          </span>
        );
      })}
      {anchor !== null && (
        <OverviewCard
          id={cardId}
          anchor={anchor}
          items={cell.items}
          roomName={room.name}
          date={date}
          isVisitor={isVisitor}
          free={free}
          equipment={room.equipment}
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

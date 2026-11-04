import { Plus } from "lucide-react";
import type { AgendaPerson } from "#/application/bookings";
import { Avatar } from "#/components/avatar";
import { cn } from "#/lib/utils";
import { formatHourAxis, type PositionedEvent, timeToMinutes } from "./layout-helpers";

/** Folga acima da primeira e abaixo da última hora, para os rótulos do eixo não serem cortados. */
const GRID_PAD = 10;

/** Escala vertical: posição e altura em px a partir de minutos do dia. */
export type Scale = { opens: number; closes: number; pxPerMin: number };

export function makeScale(opens: string, closes: string, pxPerMin: number): Scale {
  return { opens: timeToMinutes(opens), closes: timeToMinutes(closes), pxPerMin };
}

export const yOf = (scale: Scale, minutes: number) =>
  GRID_PAD + (minutes - scale.opens) * scale.pxPerMin;

/** Inverso de `yOf`: minuto do dia na altura `y` (px a partir do topo da coluna). */
export const minutesAt = (scale: Scale, y: number) => scale.opens + (y - GRID_PAD) / scale.pxPerMin;

export const gridHeight = (scale: Scale) =>
  (scale.closes - scale.opens) * scale.pxPerMin + GRID_PAD * 2;

function hourMarks(scale: Scale): number[] {
  const marks: number[] = [];
  for (let m = scale.opens; m <= scale.closes; m += 60) marks.push(m);
  return marks;
}

export function HourAxis({ scale }: { scale: Scale }) {
  return (
    <div className="relative border-r border-border" style={{ height: gridHeight(scale) }}>
      {hourMarks(scale).map((m) => (
        <span
          key={m}
          className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-muted-foreground"
          style={{ top: yOf(scale, m) }}
        >
          {formatHourAxis(m)}
        </span>
      ))}
    </div>
  );
}

export function HourLines({ scale }: { scale: Scale }) {
  return hourMarks(scale).map((m) => (
    <div
      key={`hl-${m}`}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 border-t border-border/70"
      style={{ top: yOf(scale, m) }}
    />
  ));
}

/** Linha do horário atual; só aparece quando "agora" cai dentro do expediente. */
export function NowLine({ scale, now }: { scale: Scale; now: string }) {
  const minutes = timeToMinutes(now);
  if (minutes < scale.opens || minutes > scale.closes) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-primary"
      style={{ top: yOf(scale, minutes) }}
    >
      <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-primary" />
    </div>
  );
}

function gapLabel(start: string, end: string): string {
  if (start === "12:00" && end === "13:30") return "Almoço";
  return timeToMinutes(end) - timeToMinutes(start) <= 30 ? "Intervalo" : "Livre";
}

type FreeSlotProps = {
  gap: { start: string; end: string };
  scale: Scale;
  onSelect: () => void;
  /** Quem desenha rascunhos com o mouse: o destaque fica só para o foco do teclado. */
  quiet?: boolean | undefined;
};

/**
 * Intervalo livre. Fica invisível até o ponteiro passar ou o teclado focar, para a grade não
 * virar um mar de caixas; em telas de toque (sem hover) aparece só como texto discreto.
 */
export function FreeSlot({ gap, scale, onSelect, quiet = false }: FreeSlotProps) {
  const top = yOf(scale, timeToMinutes(gap.start));
  const height = Math.max(
    16,
    (timeToMinutes(gap.end) - timeToMinutes(gap.start)) * scale.pxPerMin - 2,
  );
  const label = gapLabel(gap.start, gap.end);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Livre, ${label}, ${gap.start}–${gap.end}. Reservar`}
      className={cn(
        "group absolute inset-x-1 my-px flex items-start gap-1 overflow-hidden rounded-md px-2 pt-1 text-left text-[11px] text-foreground transition-opacity",
        "opacity-0 focus-visible:opacity-100",
        quiet ? "cursor-crosshair" : "hover:opacity-100",
        "bg-occ-free/45 ring-1 ring-line-free/30 ring-inset",
        "[@media(hover:none)]:bg-transparent [@media(hover:none)]:text-muted-foreground [@media(hover:none)]:opacity-100 [@media(hover:none)]:ring-0",
      )}
      style={{ top, height }}
    >
      <Plus className="mt-px size-3 shrink-0 text-line-free" aria-hidden="true" />
      <span className="truncate">
        <b className="font-semibold">{label}</b> {gap.start}–{gap.end}
      </span>
    </button>
  );
}

const TONES = {
  conflict:
    "bg-occ-conflict bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(196_43_39/0.10)_6px_12px)]",
  import: "bg-occ-imported",
  manual: "bg-occ-booked",
} as const;

const BARS = {
  conflict: "bg-line-conflict",
  import: "bg-line-imported",
  manual: "bg-line-booked",
} as const;

function stateOf(ev: PositionedEvent): keyof typeof TONES {
  if (ev.isConflict) return "conflict";
  return ev.source === "import" ? "import" : "manual";
}

const TAGS = { conflict: "Conflito", import: "Aula importada", manual: "Reserva" } as const;

function PersonLine({ person }: { person: AgendaPerson }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={person.name} size="xs" />
      <span className="truncate text-[11px] text-foreground/85">{person.name}</span>
    </span>
  );
}

type OccupationCardProps = {
  ev: PositionedEvent;
  scale: Scale;
  onOpen?: (() => void) | undefined;
};

/** Ocupação na grade: barra de estado à esquerda, título, horário, responsável e etiqueta. */
export function OccupationCard({ ev, scale, onOpen }: OccupationCardProps) {
  const top = yOf(scale, ev.startMinutes);
  const height = Math.max(18, (ev.endMinutes - ev.startMinutes) * scale.pxPerMin - 2);
  const width = 100 / ev.lanes;
  const state = stateOf(ev);
  const tag = `${TAGS[state]}${ev.mine ? " · sua" : ""}`;
  const showPerson = ev.person !== null && height >= 54;
  const showTag = height >= (showPerson ? 76 : 50);
  return (
    <button
      type="button"
      data-occupation
      onClick={onOpen}
      title={[ev.title, `${ev.start}–${ev.end}`, ev.person?.name, tag].filter(Boolean).join(" · ")}
      className={cn(
        "absolute flex flex-col gap-0.5 overflow-hidden rounded-md py-1 pr-1.5 pl-2.5 text-left leading-tight",
        "ring-1 ring-border/80 ring-inset transition-shadow hover:z-10 hover:shadow-md hover:ring-border",
        TONES[state],
      )}
      style={{
        top,
        height,
        left: `calc(${ev.lane * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-1 left-1 w-[3px] rounded-full", BARS[state])}
      />
      <b className="block truncate text-[12px] font-semibold text-foreground">{ev.title}</b>
      <span className="block text-[11px] tabular-nums text-muted-foreground">
        {ev.start}–{ev.end}
      </span>
      {showPerson && ev.person !== null && <PersonLine person={ev.person} />}
      {!showPerson && ev.person !== null && <span className="sr-only">{ev.person.name}</span>}
      <span
        className={cn(
          "mt-auto text-[10.5px] font-medium text-muted-foreground",
          !showTag && "sr-only",
        )}
      >
        {tag}
      </span>
    </button>
  );
}

import { X } from "lucide-react";
import { type MouseEvent, type PointerEvent, useRef } from "react";
import type { DayAgenda } from "#/application/bookings";
import { minutesAt, type Scale, yOf } from "./agenda-blocks";
import { timeToMinutes } from "./layout-helpers";

/** Rascunho de reserva desenhado na grade; só vira reserva ao abrir o formulário e confirmar. */
export type Draft = { date: string; start: string; end: string };

const STEP = 15;
const DRAG_THRESHOLD = 4;

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function gapAt(day: DayAgenda, minute: number): { start: number; end: number } | null {
  const gap = day.free.find(
    (g) => timeToMinutes(g.start) <= minute && minute < timeToMinutes(g.end),
  );
  return gap === undefined
    ? null
    : { start: timeToMinutes(gap.start), end: timeToMinutes(gap.end) };
}

type Gesture = {
  mode: "create" | "move" | "resize";
  pointerId: number;
  originY: number;
  anchor: number;
  start: number;
  end: number;
  gap: { start: number; end: number };
  moved: boolean;
};

type Options = {
  day: DayAgenda;
  scale: Scale;
  draft: Draft | null;
  enabled: boolean;
  onDraftChange: (draft: Draft | null) => void;
  onOpenDraft: (draft: Draft) => void;
};

/**
 * Arrastar com o mouse numa coluna de dia: em área livre desenha um rascunho (presa ao intervalo
 * livre onde começou); no rascunho, arrasta para mover ou pela borda de baixo para redimensionar.
 * Clique sem arrastar no rascunho abre o formulário. Toque fica com o comportamento de antes.
 */
export function useDraftGesture({
  day,
  scale,
  draft,
  enabled,
  onDraftChange,
  onOpenDraft,
}: Options) {
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);

  const minuteOf = (event: PointerEvent<HTMLElement>) =>
    minutesAt(scale, event.clientY - event.currentTarget.getBoundingClientRect().top);

  const emit = (start: number, end: number) =>
    onDraftChange({ date: day.date, start: hhmm(start), end: hhmm(end) });

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!enabled || event.button !== 0 || event.pointerType === "touch") return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-occupation]") !== null) return;
    const minute = minuteOf(event);
    const handle = target.closest<HTMLElement>("[data-draft]")?.dataset.draft;
    const own = draft !== null && draft.date === day.date && handle !== undefined;
    const start = own ? timeToMinutes(draft.start) : snap(minute);
    const gap = gapAt(day, own ? start : minute);
    if (gap === null) return;
    gesture.current = {
      mode: own ? (handle === "resize" ? "resize" : "move") : "create",
      pointerId: event.pointerId,
      originY: event.clientY,
      anchor: own ? minute - start : clamp(snap(minute), gap.start, gap.end - STEP),
      start,
      end: own ? timeToMinutes(draft.end) : start,
      gap,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (g === null || g.pointerId !== event.pointerId) return;
    if (!g.moved && Math.abs(event.clientY - g.originY) < DRAG_THRESHOLD) return;
    g.moved = true;
    const minute = minuteOf(event);
    if (g.mode === "create") {
      const at = clamp(snap(minute), g.gap.start, g.gap.end);
      const start = Math.min(g.anchor, at);
      const end = Math.max(g.anchor, at);
      emit(start, Math.max(end, Math.min(start + STEP, g.gap.end)));
    } else if (g.mode === "move") {
      const length = g.end - g.start;
      const start = clamp(snap(minute - g.anchor), g.gap.start, g.gap.end - length);
      emit(start, start + length);
    } else {
      emit(g.start, clamp(snap(minute), g.start + STEP, g.gap.end));
    }
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (g === null || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    swallowClick.current = true;
    setTimeout(() => {
      swallowClick.current = false;
    }, 0);
    if (g.moved) return;
    if (g.mode === "create") {
      onOpenDraft({
        date: day.date,
        start: hhmm(g.gap.start),
        end: hhmm(g.gap.end),
      });
    } else if (draft !== null) {
      onOpenDraft(draft);
    }
  }

  /** O clique nativo que segue o arrasto não deve acionar o botão de horário livre embaixo. */
  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClickCapture,
  };
}

type DraftBlockProps = {
  draft: Draft;
  scale: Scale;
  onDiscard: () => void;
  onOpen: () => void;
};

export function DraftBlock({ draft, scale, onDiscard, onOpen }: DraftBlockProps) {
  const top = yOf(scale, timeToMinutes(draft.start));
  const height = Math.max(
    18,
    (timeToMinutes(draft.end) - timeToMinutes(draft.start)) * scale.pxPerMin - 2,
  );
  return (
    <div
      data-draft="move"
      className="group absolute inset-x-1 z-30 flex cursor-grab flex-col overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/12 px-2 py-1 text-left leading-tight shadow-sm active:cursor-grabbing"
      style={{ top, height }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 text-left outline-none"
        aria-label={`Rascunho ${draft.start}–${draft.end}. Abrir para reservar`}
      >
        <b className="block truncate text-[12px] font-semibold">Nova reserva</b>
        <span className="block text-[11px] tabular-nums text-muted-foreground">
          {draft.start}–{draft.end}
        </span>
      </button>
      {height >= 56 && (
        <span className="mt-auto text-[10.5px] text-muted-foreground">
          Arraste para ajustar · clique para detalhar
        </span>
      )}
      <button
        type="button"
        aria-label="Descartar rascunho"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onDiscard();
        }}
        className="absolute top-1 right-1 grid size-5 place-items-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/60 hover:text-foreground focus-visible:opacity-100"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
      <span
        data-draft="resize"
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
      />
    </div>
  );
}

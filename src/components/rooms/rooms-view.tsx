import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, DoorOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RoomsDay } from "#/application/bookings";
import {
  BookingSheet,
  type BookingSheetProps,
  type BookingSlotInit,
} from "#/components/agenda/booking-sheet";
import { GateDialog } from "#/components/agenda/gate-dialog";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { DatePicker } from "#/components/ui/date-picker";
import { localNow, type TimeRange } from "#/domain/availability";
import { addDays } from "#/domain/calendar";
import {
  blocksOf,
  defaultWindow,
  filterRooms,
  isFreeIn,
  type RoomFilter,
  windowIssue,
} from "#/domain/room-filter";
import { cn } from "#/lib/utils";
import { type RoomDraft, RoomsColumns } from "./rooms-columns";
import { RoomsFilters } from "./rooms-filters";
import { RoomsFreeList } from "./rooms-free-list";

type SalasView = "colunas" | "livres";

/** Estado de `/salas` na URL: dia, visão, filtros e janela de horário. */
export type SalasSearch = {
  data?: string;
  visao?: SalasView;
  bloco?: string[];
  cap?: number;
  q?: string;
  ini?: string;
  fim?: string;
  livres?: true;
};

type Props = {
  roomsDay: RoomsDay | null;
  error: string | null;
  selectedDate: string;
  search: SalasSearch;
  canBook: boolean;
  isVisitor: boolean;
  isAdmin: boolean;
  timeZone: string;
  /** `replace` para filtros e visão; trocar o dia entra no histórico. */
  onSearchChange: (update: (prev: SalasSearch) => SalasSearch, replace: boolean) => void;
  onRetry: () => void;
  createFn?: BookingSheetProps["createFn"] | undefined;
};

const COMPACT_QUERY = "(max-width: 767px)";

function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Abaixo de 768 px; no servidor vale a tela larga. */
function useCompact(): boolean {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

const sameWindow = (a: TimeRange, b: TimeRange) => a.start === b.start && a.end === b.end;

/** Filtros e janela na URL; vazios saem dela, e a janela só entra quando o usuário a muda. */
function withFilter(prev: SalasSearch, next: RoomFilter, shown: TimeRange): SalasSearch {
  const { bloco: _bloco, cap: _cap, q: _q, livres: _livres, ini, fim, ...rest } = prev;
  const query = next.query.trim();
  const times = sameWindow(next.window, shown)
    ? { ...(ini !== undefined ? { ini } : {}), ...(fim !== undefined ? { fim } : {}) }
    : { ini: next.window.start, fim: next.window.end };
  return {
    ...rest,
    ...(next.blocks.length > 0 ? { bloco: [...next.blocks] } : {}),
    ...(next.minCapacity !== null ? { cap: next.minCapacity } : {}),
    ...(query !== "" ? { q: query } : {}),
    ...times,
    ...(next.onlyFree ? { livres: true as const } : {}),
  };
}

function withoutFilters(prev: SalasSearch): SalasSearch {
  const { bloco: _bloco, cap: _cap, q: _q, livres: _livres, ...rest } = prev;
  return rest;
}

const dayTitle = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * Todas as salas num dia: filtros, visão "Colunas" (uma por sala, com rascunho único) ou
 * "Livres" (salas inteiramente livres na janela), e a reserva a partir de qualquer uma delas.
 */
export function RoomsView({
  roomsDay,
  error,
  selectedDate,
  search,
  canBook,
  isVisitor,
  isAdmin,
  timeZone,
  onSearchChange,
  onRetry,
  createFn,
}: Props) {
  const compact = useCompact();
  const view: SalasView = search.visao ?? (compact ? "livres" : "colunas");
  const now = roomsDay?.now ?? localNow(new Date(), timeZone);
  const today = now.slice(0, 10);
  const rooms = roomsDay?.rooms ?? [];

  const fallback = defaultWindow(now);
  const requested = { start: search.ini ?? fallback.start, end: search.fim ?? fallback.end };
  const requestedValid = windowIssue(requested) === null;
  const [lastValid, setLastValid] = useState(requestedValid ? requested : fallback);
  if (requestedValid && !sameWindow(requested, lastValid)) setLastValid(requested);
  const range = requestedValid ? requested : lastValid;

  const filter: RoomFilter = {
    blocks: search.bloco ?? [],
    minCapacity: search.cap ?? null,
    query: search.q ?? "",
    onlyFree: search.livres === true,
    window: requested,
  };
  const result = filterRooms(rooms, { ...filter, window: range }, now);
  const shown =
    view === "livres"
      ? result.rooms.filter((room) => isFreeIn(room, range, now)).length
      : result.rooms.length;

  const [draft, setDraft] = useState<RoomDraft | null>(null);
  const [slot, setSlot] = useState<BookingSlotInit | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dados novos descartam o rascunho
  useEffect(() => {
    setDraft(null);
  }, [roomsDay]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDraft(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function book(next: BookingSlotInit) {
    if (isVisitor) setGateOpen(true);
    else if (canBook) setSlot(next);
  }

  const goTo = (data: string) => onSearchChange((prev) => ({ ...prev, data }), false);
  const clearFilters = () => onSearchChange(withoutFilters, true);

  return (
    <div className="grid w-full max-w-full min-w-0 gap-4" data-testid="rooms-view">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold tracking-tight text-foreground first-letter:uppercase">
          {dayTitle.format(new Date(`${selectedDate}T12:00:00Z`))}
        </h1>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => goTo(today)}>
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Dia anterior"
            onClick={() => goTo(addDays(selectedDate, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Próximo dia"
            onClick={() => goTo(addDays(selectedDate, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <DatePicker
            id="salas-data"
            value={selectedDate}
            onChange={(value) => value !== "" && goTo(value)}
            className="w-36"
          />
          <div className="ml-1 flex rounded-md border bg-surface p-0.5">
            {(["colunas", "livres"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => onSearchChange((prev) => ({ ...prev, visao: value }), true)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                  view === value && "bg-background text-foreground shadow-xs",
                )}
              >
                {value === "colunas" ? "Colunas" : "Livres"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error !== null || roomsDay === null ? (
        <div role="alert" className="grid justify-items-start gap-3">
          <Notice tone="error">{error ?? "Não foi possível carregar as salas"}</Notice>
          <Button type="button" variant="outline" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      ) : rooms.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <DoorOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
          <p className="font-semibold text-foreground">Nenhuma sala cadastrada</p>
          {isAdmin && (
            <Button asChild variant="outline">
              <Link to="/admin/espacos">Cadastrar espaços</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <RoomsFilters
            blocks={blocksOf(rooms)}
            filter={filter}
            total={rooms.length}
            shown={shown}
            hiddenNoCapacity={result.hiddenNoCapacity}
            compact={compact}
            onChange={(next) => onSearchChange((prev) => withFilter(prev, next, requested), true)}
          />
          {view === "livres" ? (
            <RoomsFreeList
              rooms={result.rooms}
              window={range}
              now={now}
              canBook={canBook}
              onBook={book}
              onClearFilters={clearFilters}
            />
          ) : result.rooms.length === 0 ? (
            <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
              <DoorOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
              <p className="font-semibold text-foreground">Nenhuma sala com esses filtros</p>
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            <RoomsColumns
              rooms={result.rooms}
              date={roomsDay.date}
              now={now}
              draft={draft}
              canDraft={canBook}
              onDraftChange={setDraft}
              onSelectSlot={book}
            />
          )}
        </>
      )}

      <BookingSheet
        open={slot !== null}
        onOpenChange={(open) => !open && setSlot(null)}
        spaces={rooms.map((room) => room.space)}
        initialSlot={slot}
        timeZone={timeZone}
        onSuccess={() => setDraft(null)}
        {...(createFn !== undefined ? { createFn } : {})}
      />
      <GateDialog open={gateOpen} onOpenChange={setGateOpen} />
    </div>
  );
}

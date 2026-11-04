import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, DoorOpen } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RoomsDay, RoomsWeek } from "#/application/bookings";
import {
  BookingSheet,
  type BookingSheetProps,
  type BookingSlotInit,
} from "#/components/agenda/booking-sheet";
import { GateDialog } from "#/components/agenda/gate-dialog";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { DatePicker } from "#/components/ui/date-picker";
import { type PageView, ViewSwitcher } from "#/components/view-switcher";
import { localNow, type TimeRange } from "#/domain/availability";
import { addDays } from "#/domain/calendar";
import { weekOf } from "#/domain/overview";
import {
  blocksOf,
  defaultWindow,
  filterRooms,
  floorsOf,
  isFreeIn,
  type RoomFilter,
  windowIssue,
} from "#/domain/room-filter";
import { getRoomsDayFn } from "#/server/booking-fns";
import { type RoomDraft, RoomsColumns } from "./rooms-columns";
import { RoomsFilters } from "./rooms-filters";
import { RoomsFreeList } from "./rooms-free-list";
import { RoomsOverview } from "./rooms-overview";

type SalasView = Exclude<PageView, "sala">;

/** Estado das visualizações de salas na URL: dia, visualização, filtros e janela de horário. */
export type SalasSearch = {
  data?: string;
  visao?: PageView;
  bloco?: string[];
  andar?: number[];
  cap?: number;
  q?: string;
  ini?: string;
  fim?: string;
  livres?: true;
};

type Props = {
  roomsDay: RoomsDay | null;
  /** Semana de todas as salas; só vem na visão geral. */
  roomsWeek: RoomsWeek | null;
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
  /** Disponibilidade do dia usada na escolha de sala da reserva; padrão `getRoomsDayFn`. */
  dayFn?: BookingSheetProps["availability"];
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
  const {
    bloco: _bloco,
    andar: _andar,
    cap: _cap,
    q: _q,
    livres: _livres,
    ini,
    fim,
    ...rest
  } = prev;
  const query = next.query.trim();
  const times = sameWindow(next.window, shown)
    ? { ...(ini !== undefined ? { ini } : {}), ...(fim !== undefined ? { fim } : {}) }
    : { ini: next.window.start, fim: next.window.end };
  return {
    ...rest,
    ...(next.blocks.length > 0 ? { bloco: [...next.blocks] } : {}),
    ...(next.floors.length > 0 ? { andar: [...next.floors] } : {}),
    ...(next.minCapacity !== null ? { cap: next.minCapacity } : {}),
    ...(query !== "" ? { q: query } : {}),
    ...times,
    ...(next.onlyFree ? { livres: true as const } : {}),
  };
}

function withoutFilters(prev: SalasSearch): SalasSearch {
  const { bloco: _bloco, andar: _andar, cap: _cap, q: _q, livres: _livres, ...rest } = prev;
  return rest;
}

const dayTitle = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

/** "Semana de 11 a 15 de novembro"; entre meses, "Semana de 30 de setembro a 4 de outubro". */
function weekTitle(date: string): string {
  const days = weekOf(date);
  const first = days[0] ?? date;
  const last = days[4] ?? date;
  const day = (value: string) => Number(value.slice(8, 10));
  const month = (value: string) => monthName.format(new Date(`${value}T12:00:00Z`));
  return month(first) === month(last)
    ? `Semana de ${day(first)} a ${day(last)} de ${month(last)}`
    : `Semana de ${day(first)} de ${month(first)} a ${day(last)} de ${month(last)}`;
}

/** O que a visão geral filtra: só bloco, capacidade e busca (sem janela nem "Só livres"). */
function asFilterable(week: RoomsWeek | null, date: string) {
  return (week?.rooms ?? []).map((room) => ({ ...room, date, free: [] }));
}

/**
 * Todas as salas: filtros, visão "Colunas" (uma por sala num dia, com rascunho único), "Livres"
 * (salas inteiramente livres na janela) ou "Visão geral" (a semana, bloco a bloco), e a reserva.
 */
export function RoomsView({
  roomsDay,
  roomsWeek,
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
  dayFn,
}: Props) {
  const compact = useCompact();
  const view: SalasView =
    search.visao === undefined || search.visao === "sala"
      ? compact
        ? "livres"
        : "colunas"
      : search.visao;
  const geral = view === "geral";
  const now = (geral ? roomsWeek?.now : roomsDay?.now) ?? localNow(new Date(), timeZone);
  const today = now.slice(0, 10);
  const rooms = roomsDay?.rooms ?? [];
  const weekRooms = asFilterable(roomsWeek, selectedDate);
  const loaded = geral ? roomsWeek !== null : roomsDay !== null;
  const total = geral ? weekRooms.length : rooms.length;
  const noBlocks = roomsWeek?.days.every((day) => day.blocks.length === 0) ?? false;

  const fallback = defaultWindow(now);
  const requested = { start: search.ini ?? fallback.start, end: search.fim ?? fallback.end };
  const requestedValid = windowIssue(requested) === null;
  const [lastValid, setLastValid] = useState(requestedValid ? requested : fallback);
  if (requestedValid && !sameWindow(requested, lastValid)) setLastValid(requested);
  const range = requestedValid ? requested : lastValid;

  const filter: RoomFilter = {
    blocks: search.bloco ?? [],
    floors: search.andar ?? [],
    minCapacity: search.cap ?? null,
    query: search.q ?? "",
    onlyFree: search.livres === true,
    window: requested,
  };
  const result = filterRooms(rooms, { ...filter, window: range }, now);
  const weekResult = filterRooms(weekRooms, { ...filter, onlyFree: false, window: range }, now);
  const shown =
    view === "livres"
      ? result.rooms.filter((room) => isFreeIn(room, range, now)).length
      : geral
        ? weekResult.rooms.length
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
  const setView = (visao: PageView) => onSearchChange((prev) => ({ ...prev, visao }), true);
  const clearFilters = () => onSearchChange(withoutFilters, true);
  const step = geral ? 7 : 1;
  const noRooms = (
    <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
      <DoorOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
      <p className="font-semibold text-foreground">Nenhuma sala com esses filtros</p>
      <Button type="button" variant="outline" onClick={clearFilters}>
        Limpar filtros
      </Button>
    </div>
  );

  return (
    <div className="grid w-full max-w-full min-w-0 gap-4" data-testid="rooms-view">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold tracking-tight text-foreground first-letter:uppercase">
          {geral ? weekTitle(selectedDate) : dayTitle.format(new Date(`${selectedDate}T12:00:00Z`))}
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
            aria-label={geral ? "Semana anterior" : "Dia anterior"}
            onClick={() => goTo(addDays(selectedDate, -step))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={geral ? "Próxima semana" : "Próximo dia"}
            onClick={() => goTo(addDays(selectedDate, step))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <DatePicker
            id="salas-data"
            value={selectedDate}
            onChange={(value) => value !== "" && goTo(value)}
            className="w-36"
          />
          <ViewSwitcher value={view} onChange={setView} className="ml-1" />
        </div>
      </div>

      {error !== null || !loaded ? (
        <div role="alert" className="grid justify-items-start gap-3">
          <Notice tone="error">{error ?? "Não foi possível carregar as salas"}</Notice>
          <Button type="button" variant="outline" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      ) : total === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <DoorOpen className="size-10 text-muted-foreground/60" aria-hidden="true" />
          <p className="font-semibold text-foreground">Nenhuma sala cadastrada</p>
          {isAdmin && (
            <Button asChild variant="outline">
              <Link to="/admin/espacos">Cadastrar espaços</Link>
            </Button>
          )}
        </div>
      ) : geral && noBlocks ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-semibold text-foreground">Esta semana não tem blocos de horário</p>
          <Button type="button" variant="outline" onClick={() => setView("colunas")}>
            Ver em Colunas
          </Button>
        </div>
      ) : (
        <>
          <RoomsFilters
            blocks={blocksOf(geral ? weekRooms : rooms)}
            floors={floorsOf(geral ? weekRooms : rooms)}
            filter={filter}
            total={total}
            shown={shown}
            hiddenNoCapacity={(geral ? weekResult : result).hiddenNoCapacity}
            view={view}
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
          ) : geral ? (
            weekResult.rooms.length === 0 || roomsWeek === null ? (
              noRooms
            ) : (
              <RoomsOverview
                week={roomsWeek}
                rooms={weekResult.rooms}
                isVisitor={isVisitor}
                compact={compact}
                selectedDate={selectedDate}
                canReserve={canBook || isVisitor}
                onBook={book}
              />
            )
          ) : result.rooms.length === 0 ? (
            noRooms
          ) : (
            <RoomsColumns
              rooms={result.rooms}
              date={roomsDay?.date ?? selectedDate}
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
        spaces={(geral ? weekRooms : rooms).map((room) => room.space)}
        initialSlot={slot}
        timeZone={timeZone}
        onSuccess={() => setDraft(null)}
        {...(createFn !== undefined ? { createFn } : {})}
        availability={dayFn ?? getRoomsDayFn}
      />
      <GateDialog open={gateOpen} onOpenChange={setGateOpen} />
    </div>
  );
}

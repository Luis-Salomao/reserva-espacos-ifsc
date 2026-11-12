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
import { SpaceDetailsLegend } from "#/components/spaces/space-details";
import { Button } from "#/components/ui/button";
import { DatePicker } from "#/components/ui/date-picker";
import { type PageView, ViewTabsBar } from "#/components/view-switcher";
import { localNow, type TimeRange } from "#/domain/availability";
import { addDays } from "#/domain/calendar";
import {
  blocksOf,
  defaultWindow,
  filterRooms,
  floorsOf,
  isFreeIn,
  type RoomFilter,
  windowIssue,
} from "#/domain/room-filter";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import { getRoomsDayFn } from "#/server/booking-fns";
import { type OverviewPeriod, OverviewPeriods } from "./overview-periods";
import { type RoomDraft, RoomsColumns } from "./rooms-columns";
import { RoomsFilters } from "./rooms-filters";
import { RoomsFreeList } from "./rooms-free-list";
import { RoomsOverview } from "./rooms-overview";

type SalasView = Exclude<PageView, "sala">;

/** Estado das visualizações de salas na URL: dia, visualização, filtros e janela de horário. */
export type SalasSearch = {
  data?: string;
  visao?: PageView;
  /** Só na visão geral: `dia` mostra um dia por vez; ausente é a semana. */
  periodo?: "dia";
  bloco?: string[];
  andar?: number[];
  cap?: number;
  projetor?: true;
  pcs?: number;
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
  /** Papel `manutencao`: habilita a escolha de tipo (aula/evento ou manutenção) na reserva. */
  isMaintenance?: boolean;
  /** Espaços com capacidade/equipamentos por id, de uma única chamada a `listSpaces()` no loader. */
  spacesIndex?: Record<string, Space>;
  timeZone: string;
  /** `replace` para filtros e visão; trocar o dia entra no histórico. */
  onSearchChange: (update: (prev: SalasSearch) => SalasSearch, replace: boolean) => void;
  onRetry: () => void;
  createFn?: BookingSheetProps["createFn"] | undefined;
  /** Disponibilidade do dia usada na escolha de sala da reserva; padrão `getRoomsDayFn`. */
  dayFn?: BookingSheetProps["availability"];
};

// Chrome Android em modo "Site para computador" pode expor viewport CSS perto de 980 px.
const COMPACT_QUERY = "(max-width: 1023px)";

function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Abaixo de 1024 px; no servidor vale a tela larga. */
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
    projetor: _projetor,
    pcs: _pcs,
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
    ...(next.withProjector ? { projetor: true as const } : {}),
    ...(next.minComputers !== null ? { pcs: next.minComputers } : {}),
    ...(query !== "" ? { q: query } : {}),
    ...times,
    ...(next.onlyFree ? { livres: true as const } : {}),
  };
}

function withoutFilters(prev: SalasSearch): SalasSearch {
  const {
    bloco: _bloco,
    andar: _andar,
    cap: _cap,
    q: _q,
    livres: _livres,
    projetor: _projetor,
    pcs: _pcs,
    ...rest
  } = prev;
  return rest;
}

const dayTitle = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

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
  isMaintenance = false,
  spacesIndex = {},
  timeZone,
  onSearchChange,
  onRetry,
  createFn,
  dayFn,
}: Props) {
  const compact = useCompact();
  const [period, setPeriod] = useState<OverviewPeriod>("Todos");
  const view: SalasView =
    search.visao === undefined
      ? "geral"
      : search.visao === "sala"
        ? compact
          ? "livres"
          : "colunas"
        : search.visao;
  const geral = view === "geral";
  const dayMode = geral && search.periodo === "dia";
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
    withProjector: search.projetor === true,
    minComputers: search.pcs ?? null,
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

  const goTo = (data: string) => {
    onSearchChange((prev) => ({ ...prev, data }), false);
  };
  const setView = (visao: PageView) => onSearchChange((prev) => ({ ...prev, visao }), true);
  const clearFilters = () => onSearchChange(withoutFilters, true);
  const step = geral && !dayMode ? 7 : 1;
  const setPeriodo = (dia: boolean) =>
    onSearchChange((prev) => {
      const { periodo: _periodo, ...rest } = prev;
      return dia ? { ...rest, periodo: "dia" } : rest;
    }, true);
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
    <div className="grid w-full max-w-full min-w-0 gap-3" data-testid="rooms-view">
      <ViewTabsBar value={view} onChange={setView} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-lg font-semibold tracking-tight text-foreground first-letter:uppercase">
          {geral && !dayMode
            ? "Agenda de salas"
            : dayTitle.format(new Date(`${selectedDate}T12:00:00Z`))}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => goTo(today)}>
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={geral && !dayMode ? "Semana anterior" : "Dia anterior"}
            onClick={() => goTo(addDays(selectedDate, -step))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={geral && !dayMode ? "Próxima semana" : "Próximo dia"}
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
          {geral && (
            <fieldset
              aria-label="Dia ou semana"
              className="ml-1 flex rounded-md border bg-surface p-0.5"
            >
              {(["dia", "semana"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={(value === "dia") === dayMode}
                  onClick={() => setPeriodo(value === "dia")}
                  className={cn(
                    "rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                    (value === "dia") === dayMode && "bg-background text-foreground shadow-xs",
                  )}
                >
                  {value === "dia" ? "Dia" : "Semana"}
                </button>
              ))}
            </fieldset>
          )}
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
            extra={geral ? <OverviewPeriods value={period} onChange={setPeriod} /> : undefined}
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
              showNotes={!isVisitor}
            />
          ) : geral ? (
            weekResult.rooms.length === 0 || roomsWeek === null ? (
              noRooms
            ) : (
              <RoomsOverview
                week={roomsWeek}
                selectedPeriod={period}
                rooms={weekResult.rooms}
                isVisitor={isVisitor}
                compact={compact}
                dayMode={dayMode}
                selectedDate={selectedDate}
                canReserve={canBook || isVisitor}
                onBook={book}
                onNewBooking={() => book({ date: selectedDate })}
                spacesIndex={spacesIndex}
              />
            )
          ) : result.rooms.length === 0 ? (
            noRooms
          ) : (
            <>
              <SpaceDetailsLegend />
              <RoomsColumns
                rooms={result.rooms}
                date={roomsDay?.date ?? selectedDate}
                now={now}
                draft={draft}
                canDraft={canBook}
                onDraftChange={setDraft}
                onSelectSlot={book}
                spacesIndex={spacesIndex}
                showNotes={!isVisitor}
              />
            </>
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
        onSeriesSuccess={() => setDraft(null)}
        {...(createFn !== undefined ? { createFn } : {})}
        availability={dayFn ?? getRoomsDayFn}
        canMaintenance={isMaintenance}
      />
      <GateDialog open={gateOpen} onOpenChange={setGateOpen} />
    </div>
  );
}

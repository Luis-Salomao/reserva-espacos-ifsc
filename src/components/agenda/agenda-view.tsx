import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgendaItem, DayAgenda, WeekAgenda } from "#/application/bookings";
import { SpaceDetails } from "#/components/spaces/space-details";
import { Button } from "#/components/ui/button";
import { type PageView, ViewSwitcher } from "#/components/view-switcher";
import { addDays } from "#/domain/calendar";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import { BOOKING_ROLES, type SessionInfo } from "#/server/session";
import { AgendaLegend } from "./agenda-legend";
import type { Draft } from "./draft-booking";
import { GateDialog } from "./gate-dialog";
import { MiniCalendar } from "./mini-calendar";
import { PublicBanner } from "./public-banner";
import { RoomSelector } from "./room-selector";
import { TimelineDay, TimelineDayStrip } from "./timeline-day";
import { WeekGrid } from "./week-grid";

export type SlotSelection = {
  spaceId: string;
  date: string;
  start: string;
  end: string;
};

export type AgendaViewProps = {
  spaces: Space[];
  selectedSpaceId: string;
  selectedDate: string; // "YYYY-MM-DD"
  weekAgenda: WeekAgenda;
  user?: SessionInfo["user"] | null | undefined;
  publicRead?: boolean | undefined;
  session?: SessionInfo | undefined;
  onSelectSpace: (spaceId: string) => void;
  onSelectDate: (date: string) => void;
  onSelectSlot?: ((slot: SlotSelection) => void) | undefined;
  onNewBooking?: (() => void) | undefined;
  onOpenOccupation?: ((occupation: AgendaItem) => void) | undefined;
};

export function AgendaView({
  spaces,
  selectedSpaceId,
  selectedDate,
  weekAgenda,
  user: directUser,
  publicRead: directPublicRead,
  session,
  onSelectSpace,
  onSelectDate,
  onSelectSlot,
  onNewBooking,
  onOpenOccupation,
}: AgendaViewProps) {
  const navigate = useNavigate();
  // Outra visualização na mesma página, com o dia e a sala desta.
  const selectView = (visao: PageView) =>
    void navigate({
      to: "/",
      search: (prev) => ({ ...prev, data: selectedDate, espaco: selectedSpaceId, visao }),
    });
  const seeAllRooms = () => selectView("colunas");
  const [mode, setMode] = useState<"week" | "day">("week");
  const [gateOpen, setGateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const user = session ? session.user : (directUser ?? null);
  const publicRead = session ? session.publicRead : (directPublicRead ?? true);

  const isVisitor = user === null;
  const canBook =
    !isVisitor &&
    user.roles.some((r) => BOOKING_ROLES.includes(r as (typeof BOOKING_ROLES)[number]));
  const currentSpace = spaces.find((s) => s.id === selectedSpaceId) ?? spaces[0];

  const selectedDayAgenda: DayAgenda = weekAgenda.days.find((d) => d.date === selectedDate) ??
    weekAgenda.days[0] ?? {
      spaceId: selectedSpaceId,
      date: selectedDate,
      now: weekAgenda.now,
      hours: { opens: "06:00", closes: "23:00" },
      occupations: [],
      free: [],
      blocks: [],
    };

  // Agenda nova (outra semana, outra sala ou recarga após reservar): o rascunho perde o sentido.
  useEffect(() => {
    void weekAgenda;
    setDraft(null);
  }, [weekAgenda]);

  useEffect(() => {
    if (draft === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDraft(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [draft]);

  const draftProps = { draft, canDraft: canBook, onDraftChange: setDraft };

  function handleSlotClick(slot: SlotSelection) {
    if (isVisitor) {
      setGateOpen(true);
      return;
    }
    if (canBook) {
      onSelectSlot?.(slot);
    }
  }

  function handleNewBookingClick() {
    if (isVisitor) {
      setGateOpen(true);
      return;
    }
    if (onNewBooking) {
      onNewBooking();
      return;
    }
    handleSlotClick({
      spaceId: selectedSpaceId,
      date: selectedDate,
      start: "08:00",
      end: "10:00",
    });
  }

  function handleStep(days: number) {
    onSelectDate(addDays(selectedDate, days));
  }

  const todayIso = weekAgenda.now.slice(0, 10);

  return (
    <div className="w-full max-w-full" data-testid="agenda-view-root">
      {/* 1. Banner para visitante em leitura pública */}
      {isVisitor && publicRead && <PublicBanner />}

      <div className="layout grid gap-0 pb-24 lg:pb-6 xl:grid-cols-[248px_1fr] xl:gap-8">
        {/* Lateral em telas largas; abaixo disso, seletor de sala acima da grade. */}
        <aside
          aria-label="Filtros da agenda"
          className="side hidden xl:sticky xl:top-8 xl:flex xl:max-h-[calc(100vh-4rem)] xl:flex-col xl:gap-6 xl:overflow-y-auto"
        >
          {canBook && (
            <Button className="w-full" onClick={handleNewBookingClick}>
              <Plus className="size-4" /> Nova reserva
            </Button>
          )}

          <MiniCalendar
            selectedDate={selectedDate}
            todayDate={todayIso}
            onSelectDate={onSelectDate}
          />

          <div>
            <h2 className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground">Salas</h2>
            <RoomSelector
              spaces={spaces}
              selectedSpaceId={selectedSpaceId}
              onSelectSpace={onSelectSpace}
              variant="vertical"
              onSeeAllRooms={seeAllRooms}
            />
          </div>

          {currentSpace ? (
            <SpaceDetails space={currentSpace} />
          ) : (
            <p className="text-sm text-muted-foreground">Detalhes indisponíveis</p>
          )}
        </aside>

        <div id="agenda-main" className="main min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {/* Abaixo de lg só existe a linha do tempo de um dia. */}
              <span className="block first-letter:uppercase lg:hidden">
                {formatDayHeader(selectedDate)}
              </span>
              <span className="hidden first-letter:uppercase lg:block">
                {mode === "week"
                  ? formatWeekHeader(weekAgenda.weekStart)
                  : formatDayHeader(selectedDate)}
              </span>
            </h1>
            <span className="hidden rounded-md border px-2 py-0.5 text-[12px] font-medium text-muted-foreground xl:inline">
              {currentSpace?.name ?? ""}
            </span>
            <div className="min-w-0 max-w-56 xl:hidden">
              <RoomSelector
                spaces={spaces}
                selectedSpaceId={selectedSpaceId}
                onSelectSpace={onSelectSpace}
                variant="chips"
                onSeeAllRooms={seeAllRooms}
              />
            </div>
            <div className="flex-1" />
            <div className="toolbar hidden items-center gap-1 lg:flex">
              <Button variant="outline" size="sm" onClick={() => onSelectDate(todayIso)}>
                Hoje
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Anterior"
                onClick={() => handleStep(mode === "week" ? -7 : -1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Próximo"
                onClick={() => handleStep(mode === "week" ? 7 : 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <div className="seg ml-1 flex rounded-md border bg-surface p-0.5">
                {(["day", "week"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                      mode === value && "bg-background text-foreground shadow-xs",
                    )}
                  >
                    {value === "day" ? "Dia" : "Semana"}
                  </button>
                ))}
              </div>
            </div>
            <ViewSwitcher value="sala" onChange={selectView} />
          </div>

          <details className="mb-3 rounded-md border border-border px-3 py-2 xl:hidden">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Informações da sala
            </summary>
            <div className="mt-2">
              {currentSpace ? (
                <SpaceDetails space={currentSpace} />
              ) : (
                <p className="text-sm text-muted-foreground">Detalhes indisponíveis</p>
              )}
            </div>
          </details>

          <div className="mb-3 grid grid-cols-[minmax(0,1fr)] gap-2 lg:hidden">
            <div className="wk lg:hidden">
              <TimelineDayStrip
                weekStart={weekAgenda.weekStart}
                selectedDate={selectedDate}
                todayDate={todayIso}
                onSelectDate={onSelectDate}
              />
            </div>
          </div>

          {/* Semana (ou dia) a partir de lg; abaixo disso, linha do tempo de um dia. */}
          <div className="hidden lg:block">
            {mode === "week" ? (
              <WeekGrid
                weekAgenda={weekAgenda}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                onSelectSlot={handleSlotClick}
                onOpenOccupation={onOpenOccupation}
                isVisitor={isVisitor}
                {...draftProps}
              />
            ) : (
              <TimelineDay
                dayAgenda={selectedDayAgenda}
                onSelectSlot={handleSlotClick}
                onOpenOccupation={onOpenOccupation}
                isVisitor={isVisitor}
                {...draftProps}
              />
            )}
          </div>

          <div className="lg:hidden">
            <TimelineDay
              dayAgenda={selectedDayAgenda}
              onSelectSlot={handleSlotClick}
              onOpenOccupation={onOpenOccupation}
              isVisitor={isVisitor}
              {...draftProps}
            />
          </div>

          <AgendaLegend />
        </div>
      </div>

      {/* Botão flutuante enquanto a lateral (com Nova reserva) está oculta. */}
      {canBook && (
        <Button
          size="lg"
          aria-label="Reservar"
          className="fab fixed right-4 bottom-4 z-20 flex h-11 items-center gap-2 rounded-full px-5 shadow-lg xl:hidden"
          onClick={handleNewBookingClick}
        >
          <Plus className="size-5" /> Reservar
        </Button>
      )}

      {/* Diálogo de Login Gate do Visitante */}
      <GateDialog open={gateOpen} onOpenChange={setGateOpen} />
    </div>
  );
}

function formatDayHeader(dateStr: string): string {
  const [yStr = "2026", mStr = "11", dStr = "3"] = dateStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(y, m - 1, d);
  const weekdays = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${weekdays[dt.getDay()] ?? ""}, ${d} de ${months[m - 1] ?? ""}`;
}

function formatWeekHeader(weekStartStr: string): string {
  const [yStr = "2026", mStr = "11", dStr = "2"] = weekStartStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const startDt = new Date(y, m - 1, d);
  const endDt = new Date(y, m - 1, d + 4);
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${startDt.getDate()}–${endDt.getDate()} de ${months[endDt.getMonth()] ?? ""}`;
}

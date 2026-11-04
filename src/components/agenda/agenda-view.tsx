import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import type { AgendaItem, DayAgenda, WeekAgenda } from "#/application/bookings";
import { Button } from "#/components/ui/button";
import { addDays } from "#/domain/calendar";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import { BOOKING_ROLES, type SessionInfo } from "#/server/session";
import { AgendaLegend } from "./agenda-legend";
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
  const [mode, setMode] = useState<"week" | "day">("week");
  const [gateOpen, setGateOpen] = useState(false);

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

      <div className="layout grid gap-0 pb-24 lg:grid-cols-[288px_1fr] lg:gap-6 lg:pb-10">
        {/* 2. Barra Lateral Desktop */}
        <aside
          aria-label="Filtros da agenda"
          className="side hidden lg:sticky lg:top-[65px] lg:flex lg:h-[calc(100vh-65px)] lg:flex-col lg:gap-6 lg:overflow-y-auto lg:p-4 lg:pl-0"
        >
          {canBook && (
            <Button
              size="lg"
              className="min-h-[46px] w-full font-semibold"
              onClick={handleNewBookingClick}
            >
              <Plus className="mr-2 size-4" /> Nova reserva
            </Button>
          )}

          <MiniCalendar
            selectedDate={selectedDate}
            todayDate={todayIso}
            onSelectDate={onSelectDate}
          />

          <div>
            <h4 className="mb-2 text-[11.5px] font-semibold tracking-wider text-muted-foreground uppercase">
              Salas
            </h4>
            <RoomSelector
              spaces={spaces}
              selectedSpaceId={selectedSpaceId}
              onSelectSpace={onSelectSpace}
              variant="vertical"
            />
          </div>
        </aside>

        {/* 3. Área Principal */}
        <main id="agenda-main" className="main min-w-0 p-0 sm:p-2 lg:p-4 lg:pl-0">
          {/* Controles do Mobile: Faixa semanal + Carrossel de salas */}
          <div className="mnav mctl mb-3 grid gap-3 lg:hidden">
            <div className="wk">
              <TimelineDayStrip
                weekStart={weekAgenda.weekStart}
                selectedDate={selectedDate}
                todayDate={todayIso}
                onSelectDate={onSelectDate}
              />
            </div>
            <div className="rooms-m">
              <RoomSelector
                spaces={spaces}
                selectedSpaceId={selectedSpaceId}
                onSelectSpace={onSelectSpace}
                variant="chips"
              />
            </div>
          </div>

          {/* Barra de Ferramentas Desktop */}
          <div className="toolbar hidden lg:mb-4 lg:flex lg:items-center lg:gap-2">
            <Button variant="outline" size="sm" onClick={() => onSelectDate(todayIso)}>
              Hoje
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Anterior"
              onClick={() => handleStep(mode === "week" ? -7 : -1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo"
              onClick={() => handleStep(mode === "week" ? 7 : 1)}
            >
              <ChevronRight className="size-4" />
            </Button>

            <div className="flex-1" />

            <div className="seg flex rounded-full border bg-surface p-1">
              <button
                type="button"
                aria-pressed={mode === "day"}
                onClick={() => setMode("day")}
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-semibold text-muted-foreground transition-colors",
                  mode === "day" && "bg-background text-foreground shadow-xs",
                )}
              >
                Dia
              </button>
              <button
                type="button"
                aria-pressed={mode === "week"}
                onClick={() => setMode("week")}
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-semibold text-muted-foreground transition-colors",
                  mode === "week" && "bg-background text-foreground shadow-xs",
                )}
              >
                Semana
              </button>
            </div>
          </div>

          {/* Cabeçalho de Título */}
          <div className="my-2 mb-3 flex flex-wrap items-baseline gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {mode === "week"
                ? formatWeekHeader(weekAgenda.weekStart)
                : formatDayHeader(selectedDate)}
            </h1>
            <span className="text-sm font-medium text-muted-foreground">
              {currentSpace?.name ?? ""}
            </span>
          </div>

          {/* Grade Dinâmica: Semanal no Desktop (modo week) ou Timeline no Mobile */}
          <div className="hidden lg:block">
            {mode === "week" ? (
              <WeekGrid
                weekAgenda={weekAgenda}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                onSelectSlot={handleSlotClick}
                onOpenOccupation={onOpenOccupation}
                isVisitor={isVisitor}
              />
            ) : (
              <TimelineDay
                dayAgenda={selectedDayAgenda}
                onSelectSlot={handleSlotClick}
                onOpenOccupation={onOpenOccupation}
                isVisitor={isVisitor}
              />
            )}
          </div>

          <div className="lg:hidden">
            <TimelineDay
              dayAgenda={selectedDayAgenda}
              onSelectSlot={handleSlotClick}
              onOpenOccupation={onOpenOccupation}
              isVisitor={isVisitor}
            />
          </div>

          <AgendaLegend />
        </main>
      </div>

      {/* Botão Flutuante (FAB) do Mobile */}
      {canBook && (
        <Button
          size="lg"
          aria-label="Reservar"
          className="fab fixed right-4 bottom-4 z-20 flex min-h-[52px] items-center gap-2 rounded-full px-5 font-semibold shadow-lg lg:hidden"
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

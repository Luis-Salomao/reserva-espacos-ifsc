import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { AgendaItem, WeekAgenda } from "#/application/bookings";
import { AgendaView, type SlotSelection } from "#/components/agenda/agenda-view";
import { BookingSheet, type BookingSlotInit } from "#/components/agenda/booking-sheet";
import { CancelDialog, type CancelTarget } from "#/components/agenda/cancel-dialog";
import { GateDialog } from "#/components/agenda/gate-dialog";
import { OccupationDetails } from "#/components/agenda/occupation-details";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
import { RoomsView, type SalasSearch } from "#/components/rooms/rooms-view";
import { localNow } from "#/domain/availability";
import { addDays, weekdayOf } from "#/domain/calendar";
import type { Space } from "#/domain/space";
import { loadSalas, type SalasLoaderData, validateSalasSearch } from "#/routes/salas";
import { getRoomsDayFn, getRoomsWeekFn, getWeekAgendaFn } from "#/server/booking-fns";
import { BOOKING_ROLES, canViewHome, type SessionInfo } from "#/server/session";
import { listSpaces } from "#/server/spaces";

type HomeView = "sala" | NonNullable<SalasSearch["visao"]>;

/** Estado de `/` na URL: dia, sala, visualização e os filtros das visualizações de salas. */
export type AgendaSearch = Omit<SalasSearch, "visao"> & {
  espaco?: string;
  visao?: HomeView;
};

/** De onde vêm os dados: semana de uma sala, dia de todas as salas ou semana de todas. */
type Source = "sala" | "dia" | "semana";

function sourceOf(visao: HomeView | undefined): Source {
  if (visao === undefined || visao === "sala") return "sala";
  return visao === "geral" ? "semana" : "dia";
}

/**
 * Validador puro dos parâmetros de `/`: data, sala, visualização (`sala` quando ausente) e os
 * filtros de salas. Descarta valores corrompidos ou inválidos para aplicação segura dos fallbacks.
 */
export function validateAgendaSearch(search: Record<string, unknown>): AgendaSearch {
  const { visao: roomsView, ...filters } = validateSalasSearch(search);
  const visao = search.visao === "sala" ? "sala" : roomsView;
  const espaco =
    typeof search.espaco === "string" && search.espaco.trim().length > 0
      ? search.espaco.trim()
      : undefined;
  return {
    ...filters,
    ...(espaco !== undefined ? { espaco } : {}),
    ...(visao !== undefined ? { visao } : {}),
  };
}

/** Obtém a data de hoje ("YYYY-MM-DD") no fuso horário configurado do sistema. */
export function getTodayDate(timeZone: string, now: Date = new Date()): string {
  return localNow(now, timeZone).slice(0, 10);
}

/** Normaliza qualquer data para a segunda-feira correspondente da semana (weekdayOf === 0). */
export function getWeekStart(date: string): string {
  const weekday = weekdayOf(date);
  return addDays(date, -weekday);
}

export type AgendaLoaderData = {
  spaces: Space[];
  selectedDate: string;
  selectedSpaceId: string | null;
  weekStart: string | null;
  weekAgenda: WeekAgenda | null;
  isVisitor: boolean;
  canBook: boolean;
  timeZone: string;
  session: SessionInfo;
};

type HomeLoaderData =
  | ({ fonte: "sala" } & AgendaLoaderData)
  | ({ fonte: "dia" | "semana" } & SalasLoaderData);

async function loadAgenda(
  deps: { data?: string | undefined; espaco?: string | undefined },
  session: SessionInfo,
): Promise<AgendaLoaderData> {
  const { user, timeZone } = session;
  const isVisitor = user === null;
  const canBook = Boolean(
    user?.roles.some((r) => BOOKING_ROLES.includes(r as (typeof BOOKING_ROLES)[number])),
  );

  // 1. Carrega a lista de espaços
  const spaces = await listSpaces();

  if (spaces.length === 0) {
    const today = getTodayDate(timeZone);
    const selectedDate = deps.data ?? today;
    return {
      spaces: [],
      selectedDate,
      selectedSpaceId: null,
      weekStart: null,
      weekAgenda: null,
      isVisitor,
      canBook,
      timeZone,
      session,
    };
  }

  // 2. Safe defaults para data e espaço
  const today = getTodayDate(timeZone);
  const selectedDate = deps.data ?? today;

  const matchingSpace = deps.espaco ? spaces.find((s) => s.id === deps.espaco) : undefined;
  const firstSpace = spaces[0];
  const selectedSpaceId = matchingSpace ? matchingSpace.id : (firstSpace?.id ?? "");

  // 3. Normalização para segunda-feira da semana
  const weekStart = getWeekStart(selectedDate);

  // 4. Carrega a agenda semanal
  const agendaRes = await getWeekAgendaFn({
    data: { spaceId: selectedSpaceId, weekStart },
  });

  const weekAgenda = agendaRes.ok ? agendaRes.data : null;

  return {
    spaces,
    selectedDate,
    selectedSpaceId,
    weekStart,
    weekAgenda,
    isVisitor,
    canBook,
    timeZone,
    session,
  };
}

export const Route = createFileRoute("/")({
  validateSearch: validateAgendaSearch,
  // Com PUBLIC_READ=false a página inicial exige login.
  beforeLoad: ({ context, location }) => {
    const { user, publicRead } = context.session;
    if (!canViewHome(publicRead, user)) {
      const searchStr = location.searchStr ?? "";
      const path = `${location.pathname}${searchStr}`;
      if (path !== "/") {
        throw redirect({
          to: "/entrar",
          search: { voltar: path },
        });
      }
      throw redirect({
        to: "/entrar",
      });
    }
  },
  // Só a fonte vai ao servidor: trocar "Colunas" e "Livres", filtros e janela ficam no cliente.
  loaderDeps: ({ search: { data, espaco, visao } }) => ({ data, espaco, fonte: sourceOf(visao) }),
  loader: async ({ deps, context }): Promise<HomeLoaderData> => {
    const { session } = context;
    if (deps.fonte === "sala") return { fonte: "sala", ...(await loadAgenda(deps, session)) };
    const salas = await loadSalas(
      deps.data,
      session,
      (date) => getRoomsDayFn({ data: { date } }),
      new Date(),
      {
        geral: deps.fonte === "semana",
        fetchWeek: (weekStart) => getRoomsWeekFn({ data: { weekStart } }),
      },
    );
    return { fonte: deps.fonte, ...salas };
  },
  component: HomePage,
  errorComponent: HomeError,
});

function HomePage() {
  const data = Route.useLoaderData();
  return data.fonte === "sala" ? <AgendaPage data={data} /> : <RoomsPage data={data} />;
}

/** A visualização de salas não conhece `espaco` nem "Sala": a sala escolhida segue na URL. */
function roomsSearchOf({ espaco: _espaco, visao, ...rest }: AgendaSearch): SalasSearch {
  return { ...rest, ...(visao !== undefined && visao !== "sala" ? { visao } : {}) };
}

function RoomsPage({ data }: { data: SalasLoaderData }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  return (
    <AppShell wide>
      <RoomsView
        roomsDay={data.roomsDay}
        roomsWeek={data.roomsWeek}
        error={data.error}
        selectedDate={data.selectedDate}
        search={roomsSearchOf(search)}
        canBook={data.canBook}
        isVisitor={data.isVisitor}
        isAdmin={data.isAdmin}
        timeZone={data.session.timeZone}
        onSearchChange={(update, replace) =>
          void navigate({
            search: (prev) => ({
              ...update(roomsSearchOf(prev)),
              ...(prev.espaco !== undefined ? { espaco: prev.espaco } : {}),
            }),
            replace,
          })
        }
        onRetry={() => void router.invalidate()}
      />
    </AppShell>
  );
}

function AgendaPage({ data }: { data: AgendaLoaderData }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [gateOpen, setGateOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlotInit | null>(null);
  const [details, setDetails] = useState<AgendaItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);

  const { spaces, selectedDate, selectedSpaceId, weekAgenda, isVisitor, session, timeZone } = data;

  // Sincroniza a URL com a data e espaço canônicos caso tenham sido omitidos na navegação inicial
  useEffect(() => {
    if (selectedSpaceId && (search.data !== selectedDate || search.espaco !== selectedSpaceId)) {
      navigate({
        search: (prev) => ({
          ...prev,
          data: selectedDate,
          espaco: selectedSpaceId,
        }),
        replace: true,
      });
    }
  }, [search.data, search.espaco, selectedDate, selectedSpaceId, navigate]);

  // RF-06: Trocar de espaço mantém a data atualmente selecionada intacta
  const handleSelectSpace = (spaceId: string) => {
    navigate({
      search: (prev) => {
        const next: { data?: string; espaco?: string } = {
          ...prev,
          espaco: spaceId,
        };
        const dateVal = prev.data ?? selectedDate;
        if (dateVal) {
          next.data = dateVal;
        }
        return next;
      },
    });
  };

  // Alterar data mantém o espaço atualmente selecionado
  const handleSelectDate = (newDate: string) => {
    navigate({
      search: (prev) => {
        const next: { data?: string; espaco?: string } = {
          ...prev,
          data: newDate,
        };
        const espacoVal = prev.espaco ?? selectedSpaceId;
        if (espacoVal) {
          next.espaco = espacoVal;
        }
        return next;
      },
    });
  };

  const handleSelectSlot = (slot: SlotSelection) => {
    if (isVisitor) {
      setGateOpen(true);
      return;
    }
    setSelectedSlot(slot);
    setBookingOpen(true);
  };

  const firstSpace = spaces[0];
  const activeSpaceId = selectedSpaceId || (firstSpace?.id ?? "");
  const activeSpaceName = spaces.find((space) => space.id === activeSpaceId)?.name ?? "";

  const refresh = async () => {
    try {
      await router.invalidate();
    } catch {
      // Roteador não instanciado em teste
    }
  };

  const handleCancel = (item: AgendaItem) => {
    setDetails(null);
    setCancelTarget({
      id: item.id,
      date: item.date,
      start: item.start,
      end: item.end,
      title: item.title,
      source: item.source,
      spaceName: activeSpaceName,
    });
  };

  const handleNewBooking = () => {
    if (isVisitor) {
      setGateOpen(true);
      return;
    }
    setSelectedSlot({
      spaceId: activeSpaceId,
      date: selectedDate,
      start: "08:00",
      end: "09:50",
    });
    setBookingOpen(true);
  };

  return (
    <AppShell wide>
      {spaces.length === 0 ? (
        <div className="p-6">
          <PageHeader title="Espaços" description="Espaços do campus disponíveis para reserva." />
          <Notice className="mt-4 p-6 text-muted-foreground">Nenhum espaço cadastrado</Notice>
        </div>
      ) : (
        <>
          {weekAgenda !== null ? (
            <AgendaView
              spaces={spaces}
              selectedSpaceId={activeSpaceId}
              selectedDate={selectedDate}
              weekAgenda={weekAgenda}
              session={session}
              onSelectSpace={handleSelectSpace}
              onSelectDate={handleSelectDate}
              onSelectSlot={handleSelectSlot}
              onNewBooking={handleNewBooking}
              onOpenOccupation={setDetails}
            />
          ) : (
            <Notice role="alert" tone="error" className="m-4 p-6">
              Não foi possível carregar a agenda para este espaço.
            </Notice>
          )}
          <GateDialog open={gateOpen} onOpenChange={setGateOpen} />
          <BookingSheet
            open={bookingOpen}
            onOpenChange={setBookingOpen}
            spaces={spaces}
            initialSlot={selectedSlot}
            timeZone={timeZone}
            onSuccess={refresh}
          />
          <OccupationDetails
            occupation={details}
            spaceName={activeSpaceName}
            onOpenChange={(open) => {
              if (!open) setDetails(null);
            }}
            onCancel={handleCancel}
          />
          <CancelDialog
            open={cancelTarget !== null}
            onOpenChange={(open) => {
              if (!open) setCancelTarget(null);
            }}
            target={cancelTarget}
            onSuccess={() => void refresh()}
          />
        </>
      )}
    </AppShell>
  );
}

function HomeError() {
  return (
    <AppShell wide>
      <Notice role="alert" tone="error" className="m-4 p-6">
        Não foi possível carregar os espaços e a agenda. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}

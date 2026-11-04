import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { WeekAgenda } from "#/application/bookings";
import { AgendaView, type SlotSelection } from "#/components/agenda/agenda-view";
import { BookingSheet, type BookingSlotInit } from "#/components/agenda/booking-sheet";
import { GateDialog } from "#/components/agenda/gate-dialog";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
import { localNow } from "#/domain/availability";
import { addDays, weekdayOf } from "#/domain/calendar";
import { isValidDate } from "#/domain/semester";
import type { Space } from "#/domain/space";
import { getWeekAgendaFn } from "#/server/booking-fns";
import { BOOKING_ROLES, canViewHome, type SessionInfo } from "#/server/session";
import { listSpaces } from "#/server/spaces";

export type AgendaSearch = {
  data?: string;
  espaco?: string;
};

/**
 * Validador puro dos parâmetros de busca da agenda (?data=YYYY-MM-DD&espaco=<id>).
 * Descarta valores corrompidos ou inválidos para aplicação segura dos fallbacks.
 */
export function validateAgendaSearch(search: Record<string, unknown>): AgendaSearch {
  const data =
    typeof search.data === "string" && isValidDate(search.data) ? search.data : undefined;
  const espaco =
    typeof search.espaco === "string" && search.espaco.trim().length > 0
      ? search.espaco.trim()
      : undefined;
  return {
    ...(data !== undefined ? { data } : {}),
    ...(espaco !== undefined ? { espaco } : {}),
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
  loaderDeps: ({ search: { data, espaco } }) => ({ data, espaco }),
  loader: async ({ deps, context }): Promise<AgendaLoaderData> => {
    const { session } = context;
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
  },
  component: HomePage,
  errorComponent: HomeError,
});

function HomePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [gateOpen, setGateOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlotInit | null>(null);

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
            onSuccess={async () => {
              try {
                await router.invalidate();
              } catch {
                // Roteador não instanciado em teste
              }
            }}
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

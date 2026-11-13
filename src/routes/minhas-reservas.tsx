import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MyBooking } from "#/application/bookings";
import type { NoticesOverview } from "#/application/notifications";
import { CancelDialog } from "#/components/agenda/cancel-dialog";
import { EditBookingDialog } from "#/components/agenda/edit-booking-dialog";
import { AppShell } from "#/components/app-shell";
import { NoticesSection } from "#/components/notices/notices-section";
import { Notice, PageHeader } from "#/components/page";
import { Button } from "#/components/ui/button";
import { localNow } from "#/domain/availability";
import { weekdayOf } from "#/domain/calendar";
import { cn } from "#/lib/utils";
import { myBookingsFn } from "#/server/booking-fns";
import { markNoticesReadFn, myNoticesFn } from "#/server/notification-fns";
import { listSpaces } from "#/server/spaces";

export type MinhasReservasSearch = {
  newId?: string;
};

export function validateMinhasReservasSearch(
  search: Record<string, unknown>,
): MinhasReservasSearch {
  const newId =
    typeof search.newId === "string" && search.newId.trim().length > 0
      ? search.newId.trim()
      : undefined;
  return {
    ...(newId !== undefined ? { newId } : {}),
  };
}

const WEEKDAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
const MONTH_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export const Route = createFileRoute("/minhas-reservas")({
  validateSearch: validateMinhasReservasSearch,
  beforeLoad: ({ context }) => {
    if (context.session?.user === null) {
      throw redirect({
        to: "/entrar",
        search: { voltar: "/minhas-reservas" },
      });
    }
  },
  loaderDeps: ({ search: { newId } }) => ({ newId }),
  loader: async ({ context }) => {
    const timeZone = context.session?.timeZone ?? "America/Sao_Paulo";
    const today = localNow(new Date(), timeZone).slice(0, 10);
    const [result, notices] = await Promise.all([
      myBookingsFn({ data: { from: today } }),
      myNoticesFn({ data: {} }),
    ]);
    if (!result.ok) {
      throw new Error(result.message);
    }
    // Avisos são um complemento: se falharem, a lista de reservas continua útil.
    const overview: NoticesOverview = notices.ok
      ? notices.data
      : { notices: [], incoming: [], outgoing: [] };
    return {
      overview,
      items: result.data.items,
      hasMore: result.data.hasMore,
      today,
      timeZone,
      spaces: await listSpaces(),
    };
  },
  component: MinhasReservasPage,
  errorComponent: MinhasReservasError,
});

export type MinhasReservasListProps = {
  items: MyBooking[];
  newId?: string | undefined;
  onSelectCancel?: (item: MyBooking) => void;
  onSelectEdit?: (item: MyBooking) => void;
};

type BookingGroup = { key: string; seriesId: string | null; items: MyBooking[] };

function groupMonthBookings(items: MyBooking[]): BookingGroup[] {
  const groups = new Map<string, BookingGroup>();
  for (const item of items) {
    const seriesId = item.inSeries ? (item.seriesId ?? null) : null;
    const key = seriesId === null ? `booking:${item.id}` : `series:${seriesId}`;
    const group = groups.get(key) ?? { key, seriesId, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) =>
        `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`),
      ),
    }))
    .sort((a, b) => {
      const firstA = a.items[0];
      const firstB = b.items[0];
      if (firstA === undefined || firstB === undefined) return 0;
      return `${firstA.date}T${firstA.start}`.localeCompare(`${firstB.date}T${firstB.start}`);
    });
}

function BookingOccurrence({
  item,
  isNew,
  onSelectCancel,
  onSelectEdit,
}: {
  item: MyBooking;
  isNew: boolean;
  onSelectCancel?: ((item: MyBooking) => void) | undefined;
  onSelectEdit?: ((item: MyBooking) => void) | undefined;
}) {
  const [, monthStr = "01", dayStr = "01"] = item.date.split("-");
  const dayNumber = Number(dayStr);
  const monthIdx = Number(monthStr) - 1;
  const weekdayName = WEEKDAY_SHORT[weekdayOf(item.date)] ?? "";
  const monthName = MONTH_SHORT[monthIdx] ?? "";
  const isImported = item.source === "import";

  return (
    <article
      id={`booking-${item.id}`}
      data-testid={`booking-card-${item.id}`}
      className={cn(
        "grid min-w-0 grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)_auto] gap-3 sm:gap-4 p-3 sm:p-4 border rounded-2xl bg-surface items-start sm:items-center transition-all",
        isNew
          ? "border-primary ring-3 ring-primary/25 shadow-sm item-new"
          : "border-border hover:border-border/80 hover:shadow-xs",
      )}
    >
      <div
        aria-hidden="true"
        className="grid w-12 sm:w-16 shrink-0 justify-items-center rounded-xl bg-surface-2 py-2 leading-none select-none"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {monthName}
        </span>
        <span className="my-0.5 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {dayNumber}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {weekdayName}
        </span>
      </div>

      <div className="min-w-0 flex-1 grid gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 text-base font-semibold tracking-tight text-foreground truncate">
            {item.title}
          </h3>
          {isNew && (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Nova
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {item.spaceName} · {item.start}–{item.end}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {isImported ? (
            <span className="inline-flex items-center rounded-md border border-line-imported bg-occ-imported px-2 py-0.5 text-xs font-medium text-foreground">
              {item.responsible ? "Aula importada · você é responsável" : "Aula importada"}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md border border-line-booked bg-occ-booked px-2 py-0.5 text-xs font-medium text-foreground">
              Reserva manual
            </span>
          )}
          {item.inSeries && (
            <span
              data-testid="series-badge"
              className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground"
            >
              Série
            </span>
          )}
        </div>
      </div>

      <div className="col-span-full sm:col-span-1 flex flex-wrap justify-end gap-2 sm:self-center">
        {item.canEdit && item.source === "manual" && (
          <Button type="button" variant="outline" size="sm" onClick={() => onSelectEdit?.(item)}>
            Editar
          </Button>
        )}
        {item.canCancel && (
          <Button type="button" variant="outline" size="sm" onClick={() => onSelectCancel?.(item)}>
            Cancelar…
          </Button>
        )}
      </div>
    </article>
  );
}

export function MinhasReservasList({
  items,
  newId,
  onSelectCancel,
  onSelectEdit,
}: MinhasReservasListProps) {
  if (items.length === 0) {
    return (
      <div
        data-slot="empty-state"
        className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center"
      >
        <CalendarDays className="size-10 text-muted-foreground/60" aria-hidden="true" />
        <div className="grid gap-1">
          <p className="font-semibold text-foreground">Nenhuma reserva futura.</p>
          <p className="text-sm text-muted-foreground">
            Você não possui reservas ou aulas agendadas para os próximos dias.
          </p>
        </div>
        <Button asChild variant="outline" className="mt-2">
          <Link to="/">Ver agenda</Link>
        </Button>
      </div>
    );
  }

  const groups = new Map<string, MyBooking[]>();
  for (const item of items) {
    const key = item.date.slice(0, 7);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return (
    <div className="grid min-w-0 max-w-[760px] gap-3">
      {[...groups].map(([monthKey, monthItems], groupIndex) => {
        const [year = "", month = "01"] = monthKey.split("-");
        const monthTitle = `${MONTH_SHORT[Number(month) - 1] ?? month} ${year}`;
        const containsNew = monthItems.some((item) => item.id === newId);
        const bookingGroups = groupMonthBookings(monthItems);
        return (
          <details
            key={monthKey}
            open={groupIndex === 0 || containsNew}
            className="group rounded-xl border border-border bg-surface"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-foreground marker:hidden hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span>{monthTitle}</span>
              <span className="text-xs font-medium text-muted-foreground">
                {monthItems.length} {monthItems.length === 1 ? "ocorrência" : "ocorrências"}
              </span>
            </summary>
            <div className="grid gap-2 border-t border-border p-1.5 sm:p-2">
              {bookingGroups.map((bookingGroup) => {
                if (bookingGroup.seriesId === null) {
                  const item = bookingGroup.items[0];
                  return item ? (
                    <BookingOccurrence
                      key={bookingGroup.key}
                      item={item}
                      isNew={newId === item.id}
                      onSelectCancel={onSelectCancel}
                      onSelectEdit={onSelectEdit}
                    />
                  ) : null;
                }

                const first = bookingGroup.items[0];
                if (first === undefined) return null;
                const [, monthStr = "01", dayStr = "01"] = first.date.split("-");
                const monthName = MONTH_SHORT[Number(monthStr) - 1] ?? monthStr;
                const weekdayName = WEEKDAY_SHORT[weekdayOf(first.date)] ?? "";
                const count = bookingGroup.items.length;
                const editable = bookingGroup.items.find(
                  (item) => item.canEdit && item.source === "manual",
                );
                const cancellable = bookingGroup.items.find((item) => item.canCancel);

                return (
                  <div
                    key={bookingGroup.key}
                    data-testid={`booking-series-${bookingGroup.seriesId}`}
                    className="rounded-xl border border-border bg-surface-2"
                  >
                    <div className="flex flex-col gap-2 p-1.5 sm:flex-row sm:items-start sm:p-2">
                      <details
                        open={bookingGroup.items.some((item) => item.id === newId)}
                        className="min-w-0 sm:flex-1"
                      >
                        <summary
                          data-testid={`booking-series-summary-${bookingGroup.seriesId}`}
                          className="flex cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-2 py-1 text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0 flex-1 font-semibold text-foreground">
                            {first.title}
                            <span className="ml-2 text-xs font-medium text-muted-foreground">
                              Série
                            </span>
                          </span>
                          <span
                            data-testid={`booking-series-count-${bookingGroup.seriesId}`}
                            className="shrink-0 text-xs font-medium text-muted-foreground"
                          >
                            {count} {count === 1 ? "ocorrência" : "ocorrências"}
                          </span>
                          <span className="w-full text-xs text-muted-foreground sm:w-auto">
                            Próxima: {weekdayName} {Number(dayStr)} {monthName} · {first.start}–
                            {first.end} · {first.spaceName}
                          </span>
                        </summary>
                        <div className="grid gap-2 border-t border-border p-1 pt-2 sm:p-2">
                          {bookingGroup.items.map((item) => (
                            <BookingOccurrence
                              key={item.id}
                              item={item}
                              isNew={newId === item.id}
                              onSelectCancel={onSelectCancel}
                              onSelectEdit={onSelectEdit}
                            />
                          ))}
                        </div>
                      </details>
                      <div className="flex flex-wrap gap-2 px-1 sm:shrink-0 sm:px-0">
                        {editable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`booking-series-edit-${bookingGroup.seriesId}`}
                            onClick={() => onSelectEdit?.(editable)}
                          >
                            Editar próxima
                          </Button>
                        )}
                        {cancellable && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`booking-series-cancel-${bookingGroup.seriesId}`}
                            aria-label="Opções de cancelamento da série"
                            title="Escolher se cancela uma data ou esta e as próximas"
                            onClick={() => onSelectCancel?.(cancellable)}
                          >
                            Cancelar…
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function MinhasReservasPage() {
  const { items, spaces, overview } = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);
  const [editTarget, setEditTarget] = useState<MyBooking | null>(null);

  useEffect(() => {
    if (search.newId) {
      const el = document.getElementById(`booking-${search.newId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [search.newId]);

  // Avisos não lidos ficam destacados só nesta visita: guarda os ids vistos como novos, porque
  // marcar como lido e recarregar devolveria todos já lidos.
  const freshIds = useRef(new Set<string>());
  for (const notice of overview.notices) if (notice.unread) freshIds.current.add(notice.id);
  const shown: NoticesOverview = {
    ...overview,
    notices: overview.notices.map((notice) => ({
      ...notice,
      unread: notice.unread || freshIds.current.has(notice.id),
    })),
  };
  const hasUnread = overview.notices.some((notice) => notice.unread);
  useEffect(() => {
    if (!hasUnread) return;
    void (async () => {
      try {
        await markNoticesReadFn({ data: {} });
        await router.invalidate();
      } catch {
        // Sem rede ou sem roteador: o selo se atualiza na próxima visita.
      }
    })();
  }, [hasUnread, router]);

  const count = items.length;
  const countLabel = count === 1 ? "1 próxima reserva" : `${count} próximas reservas`;

  return (
    <AppShell>
      <PageHeader title="Minhas reservas" description={count > 0 ? countLabel : undefined} />

      <NoticesSection overview={shown} onChanged={() => void router.invalidate()} />

      <MinhasReservasList
        items={items}
        newId={search.newId}
        onSelectCancel={(item) => setCancelTarget(item)}
        onSelectEdit={(item) => setEditTarget(item)}
      />
      {editTarget && (
        <EditBookingDialog
          key={editTarget.id}
          open
          target={editTarget}
          spaces={spaces}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          onSaved={() => {
            setEditTarget(null);
            void router.invalidate();
          }}
        />
      )}

      {/* Diálogo de Cancelamento */}
      <CancelDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        target={cancelTarget}
        onCancelled={async () => {
          setCancelTarget(null);
          try {
            await router.invalidate();
          } catch {
            // Ignora se o roteador não estiver presente
          }
        }}
      />
    </AppShell>
  );
}

function MinhasReservasError() {
  return (
    <AppShell>
      <Notice tone="error" role="alert">
        Não foi possível carregar suas reservas. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}

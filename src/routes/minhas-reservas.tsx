import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import type { MyBooking } from "#/application/bookings";
import { CancelDialog } from "#/components/agenda/cancel-dialog";
import { EditBookingDialog } from "#/components/agenda/edit-booking-dialog";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
import { Button } from "#/components/ui/button";
import { localNow } from "#/domain/availability";
import { weekdayOf } from "#/domain/calendar";
import { cn } from "#/lib/utils";
import { myBookingsFn } from "#/server/booking-fns";
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
    const result = await myBookingsFn({ data: { from: today } });
    if (!result.ok) {
      throw new Error(result.message);
    }
    return {
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
    <div className="grid max-w-[760px] gap-3">
      {[...groups].map(([monthKey, monthItems], groupIndex) => {
        const [year = "", month = "01"] = monthKey.split("-");
        const monthTitle = `${MONTH_SHORT[Number(month) - 1] ?? month} ${year}`;
        const containsNew = monthItems.some((item) => item.id === newId);
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
            <div className="grid gap-2 border-t border-border p-2">
              {monthItems.map((item) => {
                const isNew = newId === item.id;
                const [, monthStr = "01", dayStr = "01"] = item.date.split("-");
                const dayNumber = Number(dayStr);
                const monthIdx = Number(monthStr) - 1;
                const weekdayName = WEEKDAY_SHORT[weekdayOf(item.date)] ?? "";
                const monthName = MONTH_SHORT[monthIdx] ?? "";
                const isImported = item.source === "import";

                return (
                  <article
                    key={item.id}
                    id={`booking-${item.id}`}
                    data-testid={`booking-card-${item.id}`}
                    className={cn(
                      "grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr_auto] gap-3.5 sm:gap-4 p-4 border rounded-2xl bg-surface items-start sm:items-center transition-all",
                      isNew
                        ? "border-primary ring-3 ring-primary/25 shadow-sm item-new"
                        : "border-border hover:border-border/80 hover:shadow-xs",
                    )}
                  >
                    {/* Badge de Data */}
                    <div
                      aria-hidden="true"
                      className="grid w-14 sm:w-16 shrink-0 justify-items-center rounded-xl bg-surface-2 py-2 leading-none select-none"
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

                    {/* Detalhes da Ocupação */}
                    <div className="min-w-0 flex-1 grid gap-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold tracking-tight text-foreground truncate">
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
                            Aula importada · você é responsável
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

                    {/* Ações */}
                    <div className="col-span-full sm:col-span-1 flex justify-end gap-2 sm:self-center">
                      {item.canEdit && item.source === "manual" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSelectEdit?.(item)}
                        >
                          Editar
                        </Button>
                      )}
                      {item.canCancel && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSelectCancel?.(item)}
                        >
                          Cancelar…
                        </Button>
                      )}
                    </div>
                  </article>
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
  const { items, spaces } = Route.useLoaderData();
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

  const count = items.length;
  const countLabel = count === 1 ? "1 próxima reserva" : `${count} próximas reservas`;

  return (
    <AppShell>
      <PageHeader title="Minhas reservas" description={count > 0 ? countLabel : undefined} />

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

import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import type { AgendaItem, MyBooking, MyDates, MySubject, MyWeek } from "#/application/bookings";
import { CancelDialog } from "#/components/agenda/cancel-dialog";
import { EditBookingDialog } from "#/components/agenda/edit-booking-dialog";
import { MyAgendaView } from "#/components/agenda/my-agenda-view";
import { OccupationDetails } from "#/components/agenda/occupation-details";
import { AppShell } from "#/components/app-shell";
import { Notice, PageHeader } from "#/components/page";
import { localNow } from "#/domain/availability";
import { isValidDate } from "#/domain/semester";
import type { Space } from "#/domain/space";
import { getWeekStart } from "#/routes/index";
import { myDatesFn, mySubjectsFn, myWeekFn } from "#/server/booking-fns";
import { listSpaces } from "#/server/spaces";

export type MinhaAgendaSearch = {
  semana?: string;
  disciplina?: string;
  modo?: "semana" | "todas";
};

export function validateMinhaAgendaSearch(search: Record<string, unknown>): MinhaAgendaSearch {
  const semana =
    typeof search.semana === "string" && isValidDate(search.semana)
      ? getWeekStart(search.semana)
      : undefined;
  const disciplina =
    typeof search.disciplina === "string" && search.disciplina.trim().length > 0
      ? search.disciplina.trim()
      : undefined;
  const modo = search.modo === "todas" && disciplina !== undefined ? "todas" : undefined;
  return {
    ...(semana !== undefined ? { semana } : {}),
    ...(disciplina !== undefined ? { disciplina } : {}),
    ...(modo !== undefined ? { modo } : {}),
  };
}

/** Remove chaves `undefined` para a URL ficar limpa (e respeitar `exactOptionalPropertyTypes`). */
function withSearch(search: { [K in keyof MinhaAgendaSearch]: MinhaAgendaSearch[K] | undefined }) {
  return validateMinhaAgendaSearch(search);
}

export const Route = createFileRoute("/minha-agenda")({
  validateSearch: validateMinhaAgendaSearch,
  beforeLoad: ({ context }) => {
    if (context.session?.user === null) {
      throw redirect({ to: "/entrar", search: { voltar: "/minha-agenda" } });
    }
  },
  loaderDeps: ({ search: { semana, disciplina, modo } }) => ({ semana, disciplina, modo }),
  loader: async ({ context, deps }) => {
    const timeZone = context.session?.timeZone ?? "America/Sao_Paulo";
    const today = localNow(new Date(), timeZone).slice(0, 10);
    const weekStart = deps.semana ?? getWeekStart(today);
    const subjectKey = deps.disciplina;
    const [subjects, week, dates, spaces] = await Promise.all([
      mySubjectsFn({ data: {} }),
      myWeekFn({
        data: { weekStart, ...(subjectKey !== undefined ? { subject: subjectKey } : {}) },
      }),
      deps.modo === "todas" && subjectKey !== undefined
        ? myDatesFn({ data: { subject: subjectKey } })
        : Promise.resolve(null),
      listSpaces(),
    ]);
    if (!subjects.ok) throw new Error(subjects.message);
    if (!week.ok) throw new Error(week.message);
    if (dates !== null && !dates.ok) throw new Error(dates.message);
    return {
      subjects: subjects.data.subjects,
      week: week.data,
      dates: dates === null ? null : dates.data,
      spaces,
    };
  },
  component: MinhaAgendaPage,
  errorComponent: MinhaAgendaError,
});

export type MinhaAgendaScreenProps = {
  subjects: MySubject[];
  subject: string | undefined;
  mode: "semana" | "todas";
  week: MyWeek;
  dates: MyDates | null;
  spaces: Space[];
  onSubjectChange: (key: string | undefined) => void;
  onModeChange: (mode: "semana" | "todas") => void;
  onWeekChange: (weekStart: string) => void;
  onChanged: () => void;
};

function isPast(item: { date: string; end: string }, now: string): boolean {
  return `${item.date}T${item.end}` < now.slice(0, 16);
}

/** Tela com a grade/lista e os diálogos; navegação e recarga ficam com a rota. */
export function MinhaAgendaScreen({ spaces, onChanged, ...view }: MinhaAgendaScreenProps) {
  const [details, setDetails] = useState<MyBooking | null>(null);
  const [editTarget, setEditTarget] = useState<MyBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);
  const past = details !== null && isPast(details, view.week.now);
  // Ocorrência passada não oferece ações: os detalhes abrem como somente leitura.
  const shown: AgendaItem | null =
    details === null ? null : { ...details, canCancel: !past && details.canCancel };

  return (
    <>
      <MyAgendaView {...view} onOpen={setDetails} onDisable={setCancelTarget} />
      <OccupationDetails
        occupation={shown}
        spaceName={details?.spaceName ?? ""}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
        onCancel={() => {
          setCancelTarget(details);
          setDetails(null);
        }}
        {...(details?.canEdit === true && !past
          ? {
              onEdit: () => {
                setEditTarget(details);
                setDetails(null);
              },
            }
          : {})}
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
            onChanged();
          }}
        />
      )}
      <CancelDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        target={cancelTarget}
        dateOnly={cancelTarget?.source === "import"}
        onCancelled={() => {
          setCancelTarget(null);
          onChanged();
        }}
      />
    </>
  );
}

function MinhaAgendaPage() {
  const { subjects, week, dates, spaces } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  return (
    <AppShell>
      <PageHeader title="Minha agenda" />
      <MinhaAgendaScreen
        subjects={subjects}
        subject={search.disciplina}
        mode={search.modo ?? "semana"}
        week={week}
        dates={dates}
        spaces={spaces}
        onSubjectChange={(key) =>
          void navigate({
            search: (prev) =>
              withSearch({
                ...prev,
                disciplina: key,
                modo: key === undefined ? undefined : prev.modo,
              }),
          })
        }
        onModeChange={(next) =>
          void navigate({
            search: (prev) => withSearch({ ...prev, modo: next === "todas" ? "todas" : undefined }),
          })
        }
        onWeekChange={(weekStart) =>
          void navigate({ search: (prev) => withSearch({ ...prev, semana: weekStart }) })
        }
        onChanged={() => void router.invalidate()}
      />
    </AppShell>
  );
}

function MinhaAgendaError() {
  return (
    <AppShell>
      <Notice tone="error" role="alert">
        Não foi possível carregar sua agenda. Tente novamente em instantes.
      </Notice>
    </AppShell>
  );
}

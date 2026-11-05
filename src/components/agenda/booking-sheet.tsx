import { Link, useRouter } from "@tanstack/react-router";
import { AlertCircle, Calendar, Check, Clock, DoorClosed, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type FormEvent, useEffect, useId, useState } from "react";
import type {
  BookingView,
  RecurringOutcome,
  RecurringPreview,
  RoomDay,
  RoomsDay,
} from "#/application/bookings";
import { runAdminAction } from "#/components/admin/use-admin-action";
import {
  NO_REPEAT,
  RepeatSection,
  type RepeatState,
  repeatSummary,
  ruleOf,
} from "#/components/agenda/repeat-section";
import { SeriesPreview } from "#/components/agenda/series-preview";
import { SubjectCombobox, type SubjectsLoad } from "#/components/agenda/subject-combobox";
import { Field } from "#/components/ds";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { DEFAULT_HOURS, localNow, validateBookingWhen } from "#/domain/availability";
import type { Recurrence } from "#/domain/recurrence";
import { availabilityIn, busyReasonText } from "#/domain/room-filter";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import type { AdminResponse } from "#/server/admin-actions";
import { createBookingFn, createRecurringFn, previewRecurringFn } from "#/server/booking-fns";

type RecurringData = {
  spaceId: string;
  date: string;
  start: string;
  end: string;
  purpose: string;
  rule: Recurrence;
};

export type BookingSlotInit = {
  spaceId?: string;
  date?: string;
  start?: string;
  end?: string;
};

export type BookingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: Space[];
  initialSlot?: BookingSlotInit | null;
  timeZone?: string;
  onSuccess?: (booking: BookingView) => void;
  createFn?: (input: {
    data: {
      spaceId: string;
      date: string;
      start: string;
      end: string;
      purpose: string;
    };
  }) => Promise<AdminResponse<BookingView>>;
  /** Disponibilidade do dia de todas as salas; sem ela, ou se falhar, a lista de salas é simples. */
  availability?:
    | ((input: { data: { date: string } }) => Promise<AdminResponse<RoomsDay>>)
    | undefined;
  previewRecurring?: (input: { data: RecurringData }) => Promise<AdminResponse<RecurringPreview>>;
  createRecurring?: (input: {
    data: RecurringData & { confirmed: string[] };
  }) => Promise<AdminResponse<RecurringOutcome>>;
  /** Série gravada (ao menos uma data). */
  onSeriesSuccess?: () => void;
  /** Carga das matérias do dia; sem ela, o campo busca no servidor. */
  subjectsFn?: SubjectsLoad;
};

type SeriesDone = { created: number; skipped: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BUSY_ROOM = "Essa sala está ocupada nesse horário.";

type RoomChoices = {
  free: Space[];
  busy: Array<{ space: Space; label: string }>;
};

/** Salas do formulário em livres e ocupadas na janela; `null` sem dados completos do dia. */
function roomChoices(
  spaces: readonly Space[],
  day: RoomsDay | null,
  when: { date: string; start: string; end: string },
  now: string,
): RoomChoices | null {
  if (day === null || day.date !== when.date || when.end <= when.start) return null;
  const byId = new Map(day.rooms.map((room) => [room.space.id, room]));
  const rooms: Array<Omit<RoomDay, "space"> & { space: Space }> = [];
  for (const space of spaces) {
    const room = byId.get(space.id);
    if (room === undefined) return null;
    rooms.push({ ...room, space });
  }
  const { free, busy } = availabilityIn(rooms, when, now);
  return {
    free: free.map((room) => room.space),
    busy: busy.map(({ room, reasons }) => ({
      space: room.space,
      label: `${room.space.name} — ${reasons.map(busyReasonText).join("; ")}`,
    })),
  };
}

export type TimetableShortcut = {
  key: string;
  name: string;
  start: string;
  end: string;
};

export const TIMETABLE_SHORTCUTS: TimetableShortcut[] = [
  { key: "M12", name: "Manhã 1-2", start: "08:00", end: "09:50" },
  { key: "M34", name: "Manhã 3-4", start: "10:10", end: "12:00" },
  { key: "T12", name: "Tarde 1-2", start: "13:30", end: "15:20" },
  { key: "T34", name: "Tarde 3-4", start: "15:40", end: "17:30" },
  { key: "N12", name: "Noite 1-2", start: "18:00", end: "19:50" },
  { key: "N34", name: "Noite 3-4", start: "20:10", end: "22:00" },
  { key: "N123", name: "Noite 1-3", start: "19:00", end: "22:00" },
];

function formatDayLong(dateStr: string): string {
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

export function BookingSheet({
  open,
  onOpenChange,
  spaces,
  initialSlot,
  timeZone = "America/Sao_Paulo",
  onSuccess,
  createFn,
  availability,
  previewRecurring,
  createRecurring,
  onSeriesSuccess,
  subjectsFn,
}: BookingSheetProps) {
  const uid = useId();
  const router = useRouter();

  const [spaceId, setSpaceId] = useState(initialSlot?.spaceId ?? spaces[0]?.id ?? "");
  const [date, setDate] = useState(
    initialSlot?.date ?? localNow(new Date(), timeZone).slice(0, 10),
  );
  const [start, setStart] = useState(initialSlot?.start ?? "08:00");
  const [end, setEnd] = useState(initialSlot?.end ?? "09:50");
  const [purpose, setPurpose] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [submittedBooking, setSubmittedBooking] = useState<BookingView | null>(null);
  const [repeat, setRepeat] = useState<RepeatState>(NO_REPEAT);
  const [preview, setPreview] = useState<RecurringPreview | null>(null);
  const [seriesDone, setSeriesDone] = useState<SeriesDone | null>(null);
  // A busca do dia espera o formulário receber a data do slot, para não pedir o dia errado.
  const [synced, setSynced] = useState(false);
  const [day, setDay] = useState<RoomsDay | null>(null);

  // Sincroniza formulário na abertura ou mudança do slot inicial
  useEffect(() => {
    if (open) {
      setSpaceId(initialSlot?.spaceId ?? spaces[0]?.id ?? "");
      setDate(initialSlot?.date ?? localNow(new Date(), timeZone).slice(0, 10));
      setStart(initialSlot?.start ?? "08:00");
      setEnd(initialSlot?.end ?? "09:50");
      setPurpose("");
      setIsSubmitting(false);
      setErrorMessage(null);
      setFieldErrors({});
      setSubmittedBooking(null);
      setRepeat(NO_REPEAT);
      setPreview(null);
      setSeriesDone(null);
    }
    setSynced(open);
  }, [open, initialSlot, spaces, timeZone]);

  useEffect(() => {
    if (!synced || availability === undefined || !ISO_DATE.test(date)) return;
    let current = true;
    void runAdminAction(() => availability({ data: { date } })).then((response) => {
      if (current) setDay(response.ok ? response.data : null);
    });
    return () => {
      current = false;
    };
  }, [synced, availability, date]);

  const rule = ruleOf(repeat);
  // Na série a sala ocupada na data inicial pode estar livre nas outras: a prévia mostra os conflitos.
  const choices =
    rule === null
      ? roomChoices(spaces, day, { date, start, end }, localNow(new Date(), timeZone))
      : null;
  const activeSpace = spaces.find((s) => s.id === spaceId) ?? spaces[0];

  function validateClient(): boolean {
    const errors: Record<string, string> = {};
    const nowLocal = localNow(new Date(), timeZone);

    const timeIssue = validateBookingWhen({ date, start, end }, DEFAULT_HOURS, nowLocal);
    if (timeIssue !== null) {
      errors[timeIssue.field] = timeIssue.message;
    }
    if (choices?.busy.some((item) => item.space.id === spaceId)) {
      errors.spaceId = BUSY_ROOM;
    }
    const summary = repeatSummary(date, repeat);
    if (summary !== null && !summary.ok) {
      errors.repeat = summary.text;
    }

    const trimmedPurpose = purpose.trim();
    if (trimmedPurpose.length === 0) {
      errors.purpose = "Informe a matéria ou o título";
    } else if (trimmedPurpose.length > 120) {
      errors.purpose = "A finalidade deve ter no máximo 120 caracteres.";
    }

    setFieldErrors(errors);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      setErrorMessage(firstError);
      return false;
    }
    setErrorMessage(null);
    return true;
  }

  function showFailure(response: { status: number; message: string; field?: string }) {
    if (response.status !== 409 && response.field) {
      setFieldErrors({ [response.field]: response.message });
      setErrorMessage(response.message);
      document.getElementById(`${uid}-${response.field}`)?.focus();
    } else {
      setErrorMessage(response.message);
    }
  }

  function recurringData(recurrence: Recurrence): RecurringData {
    return { spaceId, date, start, end, purpose: purpose.trim(), rule: recurrence };
  }

  async function requestPreview(recurrence: Recurrence) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const caller = previewRecurring ?? previewRecurringFn;
    const response = await runAdminAction(() => caller({ data: recurringData(recurrence) }));
    setIsSubmitting(false);
    if (response.ok) setPreview(response.data);
    else showFailure(response);
  }

  async function confirmSeries() {
    if (rule === null || preview === null) return;
    const confirmed = preview.dates.filter((item) => item.free).map((item) => item.date);
    setIsSubmitting(true);
    setErrorMessage(null);
    const caller = createRecurring ?? createRecurringFn;
    const response = await runAdminAction(() =>
      caller({ data: { ...recurringData(rule), confirmed } }),
    );
    setIsSubmitting(false);
    if (!response.ok) {
      if (response.field) setPreview(null);
      showFailure(response);
      return;
    }
    const outcome = response.data;
    if (!outcome.created) {
      setPreview(outcome.preview);
      setErrorMessage(outcome.message);
      return;
    }
    setSeriesDone({ created: outcome.dates.length, skipped: outcome.skipped.length });
    onSeriesSuccess?.();
    try {
      await router.invalidate();
    } catch {
      // Ignora se o roteador não estiver presente ou configurado em ambiente de teste
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validateClient()) return;
    if (rule !== null) {
      await requestPreview(rule);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const caller = createFn ?? createBookingFn;
    const response = await runAdminAction(() =>
      caller({
        data: {
          spaceId,
          date,
          start,
          end,
          purpose: purpose.trim(),
        },
      }),
    );

    setIsSubmitting(false);

    if (response.ok) {
      setSubmittedBooking(response.data);
      onSuccess?.(response.data);
      try {
        await router.invalidate();
      } catch {
        // Ignora se o roteador não estiver presente ou configurado em ambiente de teste
      }
    } else {
      showFailure(response);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            const field = document.getElementById(`${uid}-purpose`);
            if (field?.getAttribute("aria-expanded") === "true") event.preventDefault();
          }}
          className={cn(
            "fixed z-50 grid w-full gap-4 border bg-background shadow-lg duration-200 outline-none",
            // Mobile: Bottom sheet
            "inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl border-b-0 p-6",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-4",
            // Desktop: Centered modal
            "sm:inset-x-auto sm:bottom-auto sm:top-[50%] sm:left-[50%] sm:max-h-[85vh] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border-b sm:p-6",
            "sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:zoom-out-95",
          )}
        >
          {/* Handle visual exclusivo para mobile */}
          <div
            className="mx-auto -mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/20 sm:hidden"
            aria-hidden="true"
          />

          {/* Cabeçalho */}
          <div className="flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-bold tracking-tight text-foreground">
              {seriesDone !== null
                ? "Série reservada"
                : preview !== null
                  ? "Confirmar série"
                  : submittedBooking !== null
                    ? "Reserva confirmada"
                    : "Nova reserva"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {submittedBooking !== null ? (
            /* Estado de Sucesso */
            <div
              className="grid justify-items-center text-center gap-2 py-4"
              data-testid="booking-success-view"
            >
              <div className="flex size-14 items-center justify-center rounded-full border-2 border-line-free bg-occ-free text-line-free">
                <Check className="size-7" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                Reserva confirmada
              </h3>
              <p className="text-sm text-muted-foreground">Seu horário está garantido.</p>

              <div className="mt-3 grid w-full gap-2 rounded-xl border border-border bg-surface p-4 text-left text-sm">
                <b className="font-semibold text-foreground text-base">{submittedBooking.title}</b>
                <span className="text-muted-foreground flex items-center gap-2">
                  <DoorClosed className="size-4 text-muted-foreground/80" />
                  {activeSpace?.name ?? "Espaço"}
                </span>
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="size-4 text-muted-foreground/80" />
                  {formatDayLong(submittedBooking.date)}
                </span>
                <span className="text-muted-foreground flex items-center gap-2 tabular-nums">
                  <Clock className="size-4 text-muted-foreground/80" />
                  {submittedBooking.start}–{submittedBooking.end}
                </span>
              </div>

              <div className="mt-4 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button asChild>
                  <Link to="/minhas-reservas" search={{ newId: submittedBooking.id }}>
                    Ver reserva
                  </Link>
                </Button>
              </div>
            </div>
          ) : seriesDone !== null ? (
            <div
              className="grid justify-items-center gap-2 py-4 text-center"
              data-testid="series-success-view"
            >
              <div className="flex size-14 items-center justify-center rounded-full border-2 border-line-free bg-occ-free text-line-free">
                <Check className="size-7" />
              </div>
              <p className="text-base font-semibold text-foreground">
                {seriesDone.created === 1
                  ? "1 data reservada"
                  : `${seriesDone.created} datas reservadas`}
              </p>
              {seriesDone.skipped > 0 && (
                <p className="text-sm text-muted-foreground">
                  {seriesDone.skipped === 1
                    ? "1 data ficou de fora por conflito."
                    : `${seriesDone.skipped} datas ficaram de fora por conflito.`}
                </p>
              )}
              <div className="mt-4 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button asChild>
                  <Link to="/minhas-reservas">Ver reservas</Link>
                </Button>
              </div>
            </div>
          ) : preview !== null ? (
            <SeriesPreview
              preview={preview}
              where={`${activeSpace?.name ?? "Espaço"} · ${start}–${end} · ${purpose.trim()}`}
              errorMessage={errorMessage}
              isSubmitting={isSubmitting}
              onBack={() => {
                setPreview(null);
                setErrorMessage(null);
              }}
              onConfirm={() => void confirmSeries()}
            />
          ) : (
            /* Formulário de Criação */
            <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
              {errorMessage && (
                <Notice tone="error" role="alert" className="flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                  <span>{errorMessage}</span>
                </Notice>
              )}

              {/* Seletor de Sala */}
              <Field id={`${uid}-room`} label="Sala" error={fieldErrors.spaceId}>
                <select
                  id={`${uid}-room`}
                  value={spaceId}
                  onChange={(e) => {
                    setSpaceId(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, spaceId: undefined }));
                    setErrorMessage(null);
                  }}
                  aria-invalid={Boolean(fieldErrors.spaceId)}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring dark:bg-input/30"
                >
                  {choices === null ? (
                    spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  ) : (
                    <>
                      {choices.free.length > 0 && (
                        <optgroup label="Livres">
                          {choices.free.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {choices.busy.length > 0 && (
                        <optgroup label="Ocupadas">
                          {choices.busy.map(({ space, label }) => (
                            <option key={space.id} value={space.id} disabled>
                              {label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  )}
                </select>
              </Field>

              {/* Data */}
              <Field id={`${uid}-date`} label="Data" error={fieldErrors.date}>
                <Input
                  id={`${uid}-date`}
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, date: undefined }));
                    setErrorMessage(null);
                  }}
                  aria-invalid={Boolean(fieldErrors.date)}
                />
              </Field>

              {/* Horários: Início e Fim */}
              <div className="grid grid-cols-2 gap-3">
                <Field id={`${uid}-start`} label="Início" error={fieldErrors.start}>
                  <Input
                    id={`${uid}-start`}
                    type="time"
                    step={600}
                    value={start}
                    onChange={(e) => {
                      setStart(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, start: undefined }));
                      setErrorMessage(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.start)}
                  />
                </Field>
                <Field id={`${uid}-end`} label="Fim" error={fieldErrors.end}>
                  <Input
                    id={`${uid}-end`}
                    type="time"
                    step={600}
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, end: undefined }));
                      setErrorMessage(null);
                    }}
                    aria-invalid={Boolean(fieldErrors.end)}
                  />
                </Field>
              </div>

              {/* Chips de Atalhos de Bloco */}
              <fieldset className="grid gap-1.5 border-0 p-0 m-0 min-w-0">
                <legend className="text-[13px] font-semibold text-muted-foreground mb-0.5">
                  Horários rápidos
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {TIMETABLE_SHORTCUTS.map((chip) => {
                    const isSelected = start === chip.start && end === chip.end;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setStart(chip.start);
                          setEnd(chip.end);
                          setFieldErrors((prev) => ({ ...prev, start: undefined, end: undefined }));
                          setErrorMessage(null);
                        }}
                        className={cn(
                          "rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                          isSelected &&
                            "border-primary bg-primary/10 text-primary font-semibold shadow-xs",
                        )}
                      >
                        {chip.name.split(" ")[0]} · {chip.start}–{chip.end}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <RepeatSection
                id={`${uid}-repeat`}
                date={date}
                value={repeat}
                onChange={(next) => {
                  setRepeat(next);
                  setFieldErrors((prev) => ({ ...prev, repeat: undefined, spaceId: undefined }));
                  setErrorMessage(null);
                }}
                error={fieldErrors.repeat}
              />

              <Field
                id={`${uid}-purpose`}
                label="Matéria ou título"
                hint={`${purpose.length}/120`}
                error={fieldErrors.purpose}
              >
                <SubjectCombobox
                  id={`${uid}-purpose`}
                  value={purpose}
                  date={date}
                  invalid={Boolean(fieldErrors.purpose)}
                  onChange={(next) => {
                    setPurpose(next);
                    setFieldErrors((prev) => ({ ...prev, purpose: undefined }));
                    setErrorMessage(null);
                  }}
                  {...(subjectsFn !== undefined ? { loadFn: subjectsFn } : {})}
                />
              </Field>

              {/* Rodapé / Ações */}
              <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {rule !== null
                    ? isSubmitting
                      ? "Buscando datas..."
                      : "Ver datas"
                    : isSubmitting
                      ? "Reservando..."
                      : "Reservar"}
                </Button>
              </div>
            </form>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

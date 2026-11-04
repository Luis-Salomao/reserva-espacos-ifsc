import { Link, useRouter } from "@tanstack/react-router";
import { AlertCircle, Calendar, Check, Clock, DoorClosed, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type FormEvent, useEffect, useId, useState } from "react";
import type { BookingView } from "#/application/bookings";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Field } from "#/components/ds";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { DEFAULT_HOURS, localNow, validateBookingWhen } from "#/domain/availability";
import type { Space } from "#/domain/space";
import { cn } from "#/lib/utils";
import type { AdminResponse } from "#/server/admin-actions";
import { createBookingFn } from "#/server/booking-fns";

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
};

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
    }
  }, [open, initialSlot, spaces, timeZone]);

  const activeSpace = spaces.find((s) => s.id === spaceId) ?? spaces[0];

  function validateClient(): boolean {
    const errors: Record<string, string> = {};
    const nowLocal = localNow(new Date(), timeZone);

    const timeIssue = validateBookingWhen({ date, start, end }, DEFAULT_HOURS, nowLocal);
    if (timeIssue !== null) {
      errors[timeIssue.field] = timeIssue.message;
    }

    const trimmedPurpose = purpose.trim();
    if (trimmedPurpose.length === 0) {
      errors.purpose = "Informe a finalidade da reserva.";
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validateClient()) return;

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
      if (response.status === 409) {
        setErrorMessage(response.message);
      } else if (response.field) {
        setFieldErrors({ [response.field]: response.message });
        setErrorMessage(response.message);
        document.getElementById(`${uid}-${response.field}`)?.focus();
      } else {
        setErrorMessage(response.message);
      }
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
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
              {submittedBooking !== null ? "Reserva confirmada" : "Nova reserva"}
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
                    setErrorMessage(null);
                  }}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring dark:bg-input/30"
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
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

              {/* Finalidade */}
              <Field
                id={`${uid}-purpose`}
                label="Finalidade"
                hint={`${purpose.length}/120`}
                error={fieldErrors.purpose}
              >
                <Input
                  id={`${uid}-purpose`}
                  type="text"
                  maxLength={120}
                  placeholder="Ex.: Reunião pedagógica"
                  value={purpose}
                  onChange={(e) => {
                    setPurpose(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, purpose: undefined }));
                    setErrorMessage(null);
                  }}
                  aria-invalid={Boolean(fieldErrors.purpose)}
                />
              </Field>

              {/* Rodapé / Ações */}
              <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Reservando..." : "Reservar"}
                </Button>
              </div>
            </form>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

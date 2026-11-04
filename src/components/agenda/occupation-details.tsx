import { Calendar, Clock, DoorClosed, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { AgendaItem } from "#/application/bookings";
import { Avatar } from "#/components/avatar";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

const LONG_DATE = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export type OccupationDetailsProps = {
  occupation: AgendaItem | null;
  spaceName: string;
  onOpenChange: (open: boolean) => void;
  onCancel: (occupation: AgendaItem) => void;
};

/** Detalhes de uma ocupação da agenda; o nome da pessoa só chega aqui para quem está logado. */
export function OccupationDetails({
  occupation,
  spaceName,
  onOpenChange,
  onCancel,
}: OccupationDetailsProps) {
  const item = occupation;
  const isImport = item?.source === "import";
  return (
    <Dialog.Root open={item !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-5 shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {item !== null && (
            <>
              <div className="grid gap-2 pr-8">
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                    isImport ? "bg-occ-imported" : "bg-occ-booked",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      isImport ? "bg-line-imported" : "bg-line-booked",
                    )}
                  />
                  {isImport ? "Aula importada" : "Reserva"}
                  {item.mine && " · sua"}
                </span>
                <Dialog.Title className="text-base leading-snug font-semibold">
                  {item.title}
                </Dialog.Title>
              </div>

              <dl className="grid gap-2 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <dt className="sr-only">Data</dt>
                  <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
                  <dd className="first-letter:uppercase">
                    {LONG_DATE.format(new Date(`${item.date}T12:00:00Z`))}
                  </dd>
                </div>
                <div className="flex items-center gap-2.5">
                  <dt className="sr-only">Horário</dt>
                  <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
                  <dd className="tabular-nums">
                    {item.start}–{item.end}
                  </dd>
                </div>
                <div className="flex items-center gap-2.5">
                  <dt className="sr-only">Sala</dt>
                  <DoorClosed className="size-4 text-muted-foreground" aria-hidden="true" />
                  <dd>{spaceName}</dd>
                </div>
              </dl>

              {item.person !== null && (
                <div className="flex items-center gap-3 rounded-md border bg-surface p-3">
                  <Avatar name={item.person.name} />
                  <div className="min-w-0 leading-tight">
                    <p className="text-[11px] text-muted-foreground">
                      {isImport ? "Responsável" : "Reservado por"}
                    </p>
                    <p className="truncate text-[13px] font-medium">
                      {item.person.name}
                      {item.person.code !== null && (
                        <span className="ml-1.5 text-muted-foreground">{item.person.code}</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="outline" size="sm">
                    Fechar
                  </Button>
                </Dialog.Close>
                {item.canCancel && (
                  <Button variant="destructive" size="sm" onClick={() => onCancel(item)}>
                    Cancelar…
                  </Button>
                )}
              </div>

              <Dialog.Close
                aria-label="Fechar detalhes"
                className="absolute top-3 right-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

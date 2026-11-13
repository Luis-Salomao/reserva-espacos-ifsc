import { CalendarIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale/pt-BR";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import { formatIsoDate, parseIsoDate } from "#/components/ui/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { MAX_RANGE_DAYS } from "#/domain/overview";
import { cn } from "#/lib/utils";

/** Duas colunas de meses a partir de 768 px (`md`); abaixo disso, um mês. */
const WIDE_QUERY = "(min-width: 768px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

/** "12/11 – 18/11/2026"; em anos diferentes, os dois anos; um dia só, "12/11/2026". */
export function formatRangeLabel(from: string, to: string): string {
  const [fromYear = "", fromMonth = "", fromDay = ""] = from.split("-");
  const [toYear = "", toMonth = "", toDay = ""] = to.split("-");
  const end = `${toDay}/${toMonth}/${toYear}`;
  if (from === to) return end;
  const start =
    fromYear === toYear ? `${fromDay}/${fromMonth}` : `${fromDay}/${fromMonth}/${fromYear}`;
  return `${start} – ${end}`;
}

type Props = {
  id: string;
  /** "AAAA-MM-DD". */
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Hoje ("AAAA-MM-DD", no fuso do sistema): dias anteriores ficam apagados, mas escolhíveis. */
  today?: string;
  /** Rótulo acessível do botão. */
  label?: string;
  className?: string;
};

/**
 * Seletor de intervalo (Popover + Calendar `mode="range"`): dois meses lado a lado no computador e
 * um no celular, semana iniciando na segunda. O primeiro clique escolhe o início; o segundo, o fim
 * (em qualquer ordem, no máximo `MAX_RANGE_DAYS` dias), e então fecha e chama `onChange`.
 */
export function DateRangePicker({
  id,
  from,
  to,
  onChange,
  today,
  label = "Intervalo de datas",
  className,
}: Props) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  const todayDate = today === undefined ? undefined : parseIsoDate(today);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const shown = draft ?? { from: fromDate, to: toDate };
  const waiting = draft?.from !== undefined && draft.to === undefined;
  const text = fromDate && toDate ? formatRangeLabel(from, to) : "Selecionar intervalo";

  const pick = (day: Date) => {
    if (draft?.from === undefined || draft.to !== undefined) {
      setDraft({ from: day, to: undefined });
      return;
    }
    const [first, last] = day < draft.from ? [day, draft.from] : [draft.from, day];
    setDraft(undefined);
    setOpen(false);
    onChange({ from: formatIsoDate(first), to: formatIsoDate(last) });
  };

  // Escolhido o início, só se pode terminar em até `MAX_RANGE_DAYS` dias, antes ou depois.
  const reach = MAX_RANGE_DAYS - 1;
  const limit =
    waiting && draft?.from !== undefined
      ? [
          {
            before: new Date(
              draft.from.getFullYear(),
              draft.from.getMonth(),
              draft.from.getDate() - reach,
            ),
          },
          {
            after: new Date(
              draft.from.getFullYear(),
              draft.from.getMonth(),
              draft.from.getDate() + reach,
            ),
          },
        ]
      : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setDraft(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={`${label}: ${text}`}
          data-empty={fromDate === undefined || toDate === undefined}
          className={cn(
            "w-full justify-start px-3 text-left font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon aria-hidden="true" />
          {text}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={ptBR}
          weekStartsOn={1}
          numberOfMonths={wide ? 2 : 1}
          // Sem dias de outros meses: com dois meses lado a lado, o mesmo dia apareceria marcado duas vezes.
          showOutsideDays={false}
          {...(todayDate === undefined ? {} : { today: todayDate })}
          {...(shown.from === undefined ? {} : { defaultMonth: shown.from })}
          selected={shown}
          {...(limit === undefined ? {} : { disabled: limit })}
          onSelect={(_range, day) => pick(day)}
        />
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {waiting
            ? "Escolha o último dia."
            : `Escolha o primeiro e o último dia (até ${MAX_RANGE_DAYS} dias).`}
        </p>
      </PopoverContent>
    </Popover>
  );
}

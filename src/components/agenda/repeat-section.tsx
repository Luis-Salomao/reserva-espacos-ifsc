import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Field } from "#/components/ds";
import { Input } from "#/components/ui/input";
import { addDays, weekdayOf } from "#/domain/calendar";
import {
  expandRecurrence,
  MAX_INTERVAL,
  MAX_OCCURRENCES,
  type Recurrence,
  type RecurrenceFreq,
  recurrenceLabel,
  recurrenceSummary,
} from "#/domain/recurrence";
import { isValidDate } from "#/domain/semester";
import { cn } from "#/lib/utils";

export type RepeatState = {
  freq: "none" | RecurrenceFreq;
  weekdays: number[];
  interval: number;
  endKind: "until" | "count";
  until: string;
  count: number;
};

export const NO_REPEAT: RepeatState = {
  freq: "none",
  weekdays: [],
  interval: 1,
  endKind: "count",
  until: "",
  count: 10,
};

/** Semanas padrão até a data final quando a pessoa troca para "Até a data". */
const DEFAULT_UNTIL_DAYS = 84;

const WEEKDAYS = [
  { short: "S", name: "Segunda" },
  { short: "T", name: "Terça" },
  { short: "Q", name: "Quarta" },
  { short: "Q", name: "Quinta" },
  { short: "S", name: "Sexta" },
  { short: "S", name: "Sábado" },
  { short: "D", name: "Domingo" },
];

/** Regra para o servidor; `null` quando não repete. */
export function ruleOf(state: RepeatState): Recurrence | null {
  if (state.freq === "none") return null;
  const weekly = state.freq === "weekly";
  return {
    freq: state.freq,
    interval: weekly ? state.interval : 1,
    weekdays: weekly ? state.weekdays : [],
    end:
      state.endKind === "until"
        ? { kind: "until", date: state.until }
        : { kind: "count", count: state.count },
  };
}

/** Resumo ("Toda terça, até 01/12, 4 datas") ou o problema da regra; `null` quando não repete. */
export function repeatSummary(
  date: string,
  state: RepeatState,
): { ok: boolean; text: string } | null {
  const rule = ruleOf(state);
  if (rule === null) return null;
  if (!isValidDate(date)) return { ok: false, text: "Informe a data inicial." };
  const expansion = expandRecurrence(date, rule);
  return expansion.ok
    ? { ok: true, text: recurrenceSummary(date, rule, expansion.dates) }
    : { ok: false, text: expansion.message };
}

function freqOptions(date: string): Array<{ value: RepeatState["freq"]; label: string }> {
  const base: Omit<Recurrence, "freq"> = {
    interval: 1,
    weekdays: [],
    end: { kind: "count", count: 1 },
  };
  const valid = isValidDate(date);
  return [
    { value: "none", label: "Não repete" },
    { value: "workdays", label: "Todo dia útil (seg. a sex.)" },
    { value: "weekly", label: "Semanal" },
    {
      value: "monthly-day",
      label: valid
        ? recurrenceLabel(date, { ...base, freq: "monthly-day" })
        : "Todo mês no mesmo dia",
    },
    {
      value: "monthly-weekday",
      label: valid
        ? recurrenceLabel(date, { ...base, freq: "monthly-weekday" })
        : "Todo mês na mesma semana",
    },
  ];
}

type RepeatSectionProps = {
  /** Prefixo dos ids; o botão de abrir usa o próprio `id` (foco do erro do campo `repeat`). */
  id: string;
  /** Data inicial ("YYYY-MM-DD"). */
  date: string;
  value: RepeatState;
  onChange: (next: RepeatState) => void;
  error?: string | undefined;
};

/** Seção recolhida "Repetir" do formulário de reserva (padrão: não repete). */
export function RepeatSection({ id, date, value, onChange, error }: RepeatSectionProps) {
  const [open, setOpen] = useState(false);
  const rule = ruleOf(value);
  const summary = repeatSummary(date, value);
  const current =
    rule === null ? "Não repete" : isValidDate(date) ? recurrenceLabel(date, rule) : "Repete";

  function chooseFreq(freq: RepeatState["freq"]) {
    const weekdays =
      freq === "weekly" && value.weekdays.length === 0 && isValidDate(date)
        ? [weekdayOf(date)]
        : value.weekdays;
    onChange({ ...value, freq, weekdays });
  }

  function toggleDay(day: number) {
    const weekdays = value.weekdays.includes(day)
      ? value.weekdays.filter((item) => item !== day)
      : [...value.weekdays, day].sort((a, b) => a - b);
    onChange({ ...value, weekdays });
  }

  function chooseEnd(endKind: RepeatState["endKind"]) {
    const until =
      endKind === "until" && value.until === "" && isValidDate(date)
        ? addDays(date, DEFAULT_UNTIL_DAYS)
        : value.until;
    onChange({ ...value, endKind, until });
  }

  return (
    <div className="grid gap-2 rounded-xl border border-border p-3" data-testid="repeat-section">
      <button
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-[13px] font-semibold">Repetir</span>
        <span className="min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">
          {current}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div id={`${id}-panel`} className="grid gap-3 pt-1">
          <Field id={`${id}-freq`} label="Repetição">
            <select
              id={`${id}-freq`}
              value={value.freq}
              onChange={(event) => chooseFreq(event.target.value as RepeatState["freq"])}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring dark:bg-input/30"
            >
              {freqOptions(date).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          {value.freq === "weekly" && (
            <>
              <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
                <legend className="mb-0.5 text-[13px] font-semibold">Dias da semana</legend>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day, index) => {
                    const pressed = value.weekdays.includes(index);
                    return (
                      <button
                        key={day.name}
                        type="button"
                        aria-label={day.name}
                        aria-pressed={pressed}
                        onClick={() => toggleDay(index)}
                        className={cn(
                          "size-8 cursor-pointer rounded-full border border-border bg-surface text-xs font-semibold transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          pressed && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <Field id={`${id}-interval`} label="A cada quantas semanas">
                <Input
                  id={`${id}-interval`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_INTERVAL}
                  value={value.interval}
                  onChange={(event) => onChange({ ...value, interval: Number(event.target.value) })}
                />
              </Field>
            </>
          )}

          {rule !== null && (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="mb-0.5 text-[13px] font-semibold">Término</legend>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${id}-end`}
                    checked={value.endKind === "until"}
                    onChange={() => chooseEnd("until")}
                    className="size-4 accent-primary"
                  />
                  Até a data
                </label>
                <Input
                  type="date"
                  aria-label="Data final"
                  className="w-auto"
                  value={value.until}
                  disabled={value.endKind !== "until"}
                  onChange={(event) => onChange({ ...value, until: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${id}-end`}
                    checked={value.endKind === "count"}
                    onChange={() => chooseEnd("count")}
                    className="size-4 accent-primary"
                  />
                  Depois de
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label="Número de ocorrências"
                  className="w-20"
                  min={1}
                  max={MAX_OCCURRENCES}
                  value={value.count}
                  disabled={value.endKind !== "count"}
                  onChange={(event) => onChange({ ...value, count: Number(event.target.value) })}
                />
                <span>ocorrências</span>
              </div>
            </fieldset>
          )}
        </div>
      )}

      {summary !== null && (
        <p
          data-testid="repeat-summary"
          aria-live="polite"
          className={cn(
            "text-sm",
            summary.ok ? "text-foreground" : "font-semibold text-destructive",
          )}
        >
          {summary.text}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

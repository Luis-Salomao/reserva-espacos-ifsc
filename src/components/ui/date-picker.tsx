import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { ptBR } from "react-day-picker/locale/pt-BR";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { cn } from "#/lib/utils";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "AAAA-MM-DD" para uma data local; `undefined` se vazio, malformado ou inexistente. */
export function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE.exec(value);
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Partes locais: `new Date("AAAA-MM-DD")` seria UTC e poderia mudar o dia.
  const date = new Date(year, month - 1, day);
  const same =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return same ? date : undefined;
}

/** Data local para "AAAA-MM-DD". */
export function formatIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplay(date: Date): string {
  return formatIsoDate(date).split("-").reverse().join("/");
}

type Props = {
  id: string;
  /** "AAAA-MM-DD" ou "" quando vazio. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-invalid"?: true | undefined;
  "aria-describedby"?: string | undefined;
};

/** Seletor de data (Popover + Calendar): botão rotulado, valor em "AAAA-MM-DD", semana iniciando na segunda. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Selecionar data",
  disabled,
  required,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={required}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          data-empty={selected === undefined}
          className={cn(
            "w-full justify-start px-3 text-left font-normal data-[empty=true]:text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon aria-hidden="true" />
          {selected === undefined ? placeholder : formatDisplay(selected)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          weekStartsOn={1}
          {...(selected === undefined ? {} : { defaultMonth: selected, selected })}
          onSelect={(date) => {
            if (date === undefined) return;
            onChange(formatIsoDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

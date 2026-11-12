import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Input } from "#/components/ui/input";
import { matchSubjects, type SubjectGroups } from "#/domain/text-match";
import { cn } from "#/lib/utils";
import type { AdminResponse } from "#/server/admin-actions";
import { getSubjectsFn } from "#/server/booking-fns";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY: SubjectGroups = { mine: [], all: [] };

export type SubjectsLoad = (input: {
  data: { date: string };
}) => Promise<AdminResponse<SubjectGroups>>;

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  date: string;
  invalid?: boolean;
  maxLength?: number;
  loadFn?: SubjectsLoad;
};

type Row = { key: string; label: string; value: string };

function rowsOf(groups: SubjectGroups, value: string, failed: boolean): Row[] {
  if (failed) return [];
  const matched = matchSubjects(groups, value);
  const trimmed = value.trim();
  const mine = matched.mine.map((title) => ({ key: `mine:${title}`, label: title, value: title }));
  const all = matched.all.map((title) => ({ key: `all:${title}`, label: title, value: title }));
  const free =
    trimmed !== "" && !matched.exact
      ? [{ key: "free", label: `Usar “${trimmed}” como título`, value: trimmed }]
      : [];
  return [...mine, ...all, ...free];
}

/**
 * Matéria ou título: busca nos dois grupos e, quando o texto não coincide com nenhum item,
 * oferece usar o texto aparado. Se a carga falha, o campo segue como título livre, sem lista.
 */
export function SubjectCombobox({
  id,
  value,
  onChange,
  date,
  invalid = false,
  maxLength = 120,
  loadFn,
}: Props) {
  const listId = useId();
  const load = loadFn ?? getSubjectsFn;
  const [groups, setGroups] = useState<SubjectGroups>(EMPTY);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rows = rowsOf(groups, value, failed);
  const safeActive = rows.length === 0 ? 0 : Math.min(active, rows.length - 1);
  const expanded = open && !failed;

  useEffect(() => {
    if (!ISO_DATE.test(date)) return;
    let current = true;
    void runAdminAction(() => load({ data: { date } })).then((response) => {
      if (!current) return;
      if (response.ok) {
        setGroups(response.data);
        setFailed(false);
      } else {
        setGroups(EMPTY);
        setFailed(true);
        setOpen(false);
      }
    });
    return () => {
      current = false;
    };
  }, [date, load]);

  function choose(row: Row) {
    onChange(row.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (failed) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (rows.length === 0) return;
      const last = rows.length - 1;
      setActive((current) => {
        if (!open) return event.key === "ArrowDown" ? 0 : last;
        const step = event.key === "ArrowDown" ? 1 : -1;
        return (Math.min(current, last) + step + rows.length) % rows.length;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      const row = rows[safeActive];
      if (row !== undefined) {
        event.preventDefault();
        choose(row);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  const mine = rows.filter((row) => row.key.startsWith("mine:"));
  const all = rows.filter((row) => row.key.startsWith("all:"));
  const free = rows.find((row) => row.key === "free");

  function renderRows(items: Row[], offset: number) {
    return items.map((row, index) => {
      const position = offset + index;
      const selected = position === safeActive;
      return (
        <button
          key={row.key}
          id={`${listId}-opt-${position}`}
          type="button"
          role="option"
          aria-selected={selected}
          className={cn(
            "flex min-h-11 w-full items-center px-3 text-left text-sm",
            selected && "bg-surface-2",
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(row)}
        >
          {row.label}
        </button>
      );
    });
  }

  return (
    <div className="grid min-w-0 gap-1">
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && rows.length > 0 ? `${listId}-opt-${safeActive}` : undefined
        }
        aria-invalid={invalid}
        maxLength={maxLength}
        autoComplete="off"
        placeholder="Busque a matéria ou digite um título"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          if (!failed) setOpen(true);
        }}
        onFocus={() => {
          if (!failed) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {failed && (
        <p id={`${id}-subjects-error`} className="text-[13px] font-semibold text-destructive">
          Não foi possível carregar as matérias
        </p>
      )}
      {expanded && rows.length > 0 && (
        <div id={listId} role="listbox" aria-label="Matérias" className="w-full rounded-lg border">
          {mine.length > 0 && (
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="px-3 pt-2 text-[11px] font-semibold text-muted-foreground">
                Minhas matérias
              </legend>
              {renderRows(mine, 0)}
            </fieldset>
          )}
          {all.length > 0 && (
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="px-3 pt-2 text-[11px] font-semibold text-muted-foreground">
                Todas as matérias
              </legend>
              {renderRows(all, mine.length)}
            </fieldset>
          )}
          {free !== undefined && renderRows([free], mine.length + all.length)}
        </div>
      )}
    </div>
  );
}

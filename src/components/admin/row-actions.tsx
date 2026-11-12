import { MoreHorizontal, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Tag } from "#/components/ds";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";

/** Ids dos botões da linha, para devolver o foco a eles quando um diálogo fecha. */
export function rowActionIds(rowId: string): { edit: string; more: string } {
  return { edit: `row-${rowId}-edit`, more: `row-${rowId}-more` };
}

export type RowAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type Props = {
  rowId: string;
  /** Nome do item, usado nos nomes acessíveis ("Editar NOME"). */
  name: string;
  onEdit: () => void;
  /** Demais ações, no menu "Mais ações". Sem ações, o menu não aparece. */
  actions: readonly RowAction[];
};

/** Coluna de ações de uma linha: lápis de edição e menu "Mais ações" (três pontinhos). */
export function RowActions({ rowId, name, onEdit, actions }: Props) {
  const ids = rowActionIds(rowId);
  const size = "size-9 max-md:size-11";
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button
        type="button"
        id={ids.edit}
        variant="ghost"
        size="icon"
        className={size}
        aria-label={`Editar ${name}`}
        title="Editar"
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </Button>
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              id={ids.more}
              variant="ghost"
              size="icon"
              className={size}
              aria-label={`Mais ações de ${name}`}
              title="Mais ações"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.label}
                disabled={action.disabled === true}
                onSelect={action.onSelect}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** Selo discreto de estado: verde suave só para "ativo"; o resto é neutro (tracejado = pendente). */
export function StatusTag({
  tone = "neutral",
  dashed = false,
  children,
}: {
  tone?: "free" | "neutral";
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tag tone={tone} className={cn(dashed && "border-dashed")}>
      {children}
    </Tag>
  );
}

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { Button } from "#/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  description?: string | undefined;
  onClose: () => void;
  /** Id do botão que recebe o foco ao fechar (o lápis ou o menu da linha). */
  returnFocusId?: string | undefined;
  children: ReactNode;
};

/**
 * Diálogo das telas de administração: cabeçalho com título e botão Fechar, corpo rolável. O foco
 * entra no primeiro campo e, ao fechar, volta ao botão que abriu (`returnFocusId`).
 */
export function AdminDialog({ open, title, description, onClose, returnFocusId, children }: Props) {
  const content = useRef<HTMLDivElement>(null);
  // Ao fechar, quem controla o estado já pode ter zerado o id; guarda o último informado.
  const lastReturnId = useRef(returnFocusId);
  if (returnFocusId !== undefined) lastReturnId.current = returnFocusId;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          ref={content}
          {...(description === undefined ? { "aria-describedby": undefined } : {})}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const target =
              lastReturnId.current === undefined
                ? null
                : document.getElementById(lastReturnId.current);
            if (target === null) return;
            event.preventDefault();
            target.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl border bg-surface shadow-xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex items-start gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold tracking-tight wrap-anywhere">
                {title}
              </Dialog.Title>
              {description !== undefined && (
                <Dialog.Description className="text-sm text-muted-foreground wrap-anywhere">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

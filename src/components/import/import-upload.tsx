import type { FormEvent } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

type Props = { pending: boolean; onSubmit: (file: File) => void };

/** Formulário de envio do XML exportado do aSc Horários. */
export function ImportUpload({ pending, onSubmit }: Props) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("file");
    const file = field instanceof HTMLInputElement ? field.files?.[0] : undefined;
    if (file !== undefined) onSubmit(file);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border bg-surface p-4">
      <div className="grid gap-2">
        <Label htmlFor="import-file">Arquivo XML de horários</Label>
        <Input
          id="import-file"
          name="file"
          type="file"
          accept=".xml,text/xml,application/xml"
          required
          disabled={pending}
        />
        <p className="text-sm text-muted-foreground">
          Máximo de 10 MB. O arquivo é lido apenas para a prévia e nada é salvo.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:justify-self-start">
        {pending ? "Processando…" : "Gerar prévia"}
      </Button>
    </form>
  );
}

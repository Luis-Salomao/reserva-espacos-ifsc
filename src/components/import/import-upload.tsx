import type { FormEvent } from "react";
import { Field } from "#/components/ds";
import { Card } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

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
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <Field
          id="import-file"
          label="Arquivo XML de horários"
          hint="Máximo de 10 MB. O arquivo é lido apenas para a prévia e nada é salvo."
        >
          <Input
            id="import-file"
            name="file"
            type="file"
            accept=".xml,text/xml,application/xml"
            required
            disabled={pending}
            aria-describedby="import-file-hint"
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:justify-self-start">
          {pending ? "Processando…" : "Gerar prévia"}
        </Button>
      </form>
    </Card>
  );
}

import { type FormEvent, useState } from "react";
import type { BatchView } from "#/application/import-report";
import { Field } from "#/components/ds";
import { Card, Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { AdminResponse } from "#/server/admin-actions";

type Counts = { changed: number; withoutResponsible: number };

const NETWORK_ERROR = "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";

async function postResponsibles(file: File, semesterId: string): Promise<AdminResponse<Counts>> {
  try {
    const response = await fetch(
      `/api/import-responsibles?semesterId=${encodeURIComponent(semesterId)}`,
      { method: "POST", headers: { "Content-Type": "application/xml" }, body: file },
    );
    return (await response.json()) as AdminResponse<Counts>;
  } catch {
    return { ok: false, status: 400, message: NETWORK_ERROR };
  }
}

/** Frase do resultado: quantas ocupações mudaram de responsável e quantas seguem sem. */
function summaryOf({ changed, withoutResponsible }: Counts): string {
  const moved =
    changed === 1
      ? "1 ocupação mudou de responsável"
      : `${changed} ocupações mudaram de responsável`;
  const left =
    withoutResponsible === 1
      ? "1 continua sem responsável"
      : `${withoutResponsible} continuam sem responsável`;
  return `${moved}; ${left}.`;
}

/**
 * "Atualizar responsáveis" do lote aplicado: reenvia o mesmo XML para reaplicar os vínculos de
 * docentes atuais às aulas já importadas. Só aparece em lote aplicado.
 */
export function RefreshResponsibles({
  batch,
}: {
  batch: Pick<BatchView, "semesterId" | "status">;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (batch.status !== "aplicado") return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("responsibles-file");
    const file = field instanceof HTMLInputElement ? field.files?.[0] : undefined;
    if (file === undefined) return;
    setPending(true);
    setMessage(null);
    const result = await postResponsibles(file, batch.semesterId);
    setPending(false);
    setMessage(
      result.ok
        ? { kind: "ok", text: summaryOf(result.data) }
        : { kind: "error", text: result.message },
    );
  }

  return (
    <Card>
      <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Atualizar responsáveis</h2>
        <Field
          id="responsibles-file"
          label="Arquivo XML desta versão"
          hint="Envie o mesmo arquivo aplicado. Os vínculos de docentes atuais passam a valer para as aulas importadas ativas do semestre; reservas avulsas e aulas canceladas não mudam."
        >
          <Input
            id="responsibles-file"
            name="responsibles-file"
            type="file"
            accept=".xml,text/xml,application/xml"
            required
            disabled={pending}
            aria-describedby="responsibles-file-hint"
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:justify-self-start">
          {pending ? "Atualizando…" : "Atualizar responsáveis"}
        </Button>
        {message !== null && (
          <Notice tone={message.kind} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </Notice>
        )}
      </form>
    </Card>
  );
}

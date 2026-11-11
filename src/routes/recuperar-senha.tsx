import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Field } from "#/components/ds";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  getRecoveryAvailabilityFn,
  requestPasswordRecoveryFn,
} from "#/server/password-recovery-fns";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  loader: () => getRecoveryAvailabilityFn(),
  component: RecoveryPage,
});

function RecoveryPage() {
  const { enabled } = Route.useLoaderData();
  return <RecoveryForm enabled={enabled} />;
}

export function RecoveryForm({
  enabled,
  requestFn = requestPasswordRecoveryFn,
}: {
  enabled: boolean;
  requestFn?: typeof requestPasswordRecoveryFn;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-5 px-6 py-10">
      <h1 className="text-2xl font-semibold">Recuperar senha</h1>
      {!enabled ? (
        <Notice>
          O envio de e-mail está desabilitado nesta instalação. Entre em contato com o administrador
          para recuperar seu acesso.
        </Notice>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Informe o e-mail da sua conta para receber um link válido por 20 minutos.
          </p>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              const result = await runAdminAction(() => requestFn({ data: { email } }));
              setBusy(false);
              setMessage(result.ok ? result.data.message : result.message);
            }}
          >
            <Field id="recovery-email" label="E-mail">
              <Input
                id="recovery-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                disabled={busy}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Enviar instruções"}
            </Button>
          </form>
          {message && <Notice role="status">{message}</Notice>}
        </>
      )}
      <Link to="/entrar" className="text-sm underline">
        Voltar para entrar
      </Link>
    </main>
  );
}

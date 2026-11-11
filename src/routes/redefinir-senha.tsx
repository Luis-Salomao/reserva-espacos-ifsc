import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { runAdminAction } from "#/components/admin/use-admin-action";
import { Field } from "#/components/ds";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { AdminResponse } from "#/server/admin-actions";
import { getRecoveryAvailabilityFn, resetPasswordFn } from "#/server/password-recovery-fns";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  loader: () => getRecoveryAvailabilityFn(),
  component: ResetPage,
});

function ResetPage() {
  const { enabled } = Route.useLoaderData();
  return <ResetPasswordForm enabled={enabled} />;
}

export function ResetPasswordForm({
  enabled,
  resetFn = resetPasswordFn,
}: {
  enabled: boolean;
  resetFn?: (input: {
    data: { token: string; password: string };
  }) => Promise<AdminResponse<{ message: string }>>;
}) {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-md content-center gap-5 px-6 py-10">
      <h1 className="text-2xl font-semibold">Redefinir senha</h1>
      {!enabled ? (
        <Notice>
          O envio de e-mail está desabilitado nesta instalação. Entre em contato com o administrador
          para recuperar seu acesso.
        </Notice>
      ) : done ? (
        <Notice role="status">Senha redefinida. Entre com sua nova senha.</Notice>
      ) : !token ? (
        <Notice>Link inválido ou ausente. Solicite uma nova recuperação de senha.</Notice>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            if (password !== confirmation) {
              setMessage("As senhas devem ser iguais.");
              return;
            }
            setBusy(true);
            setMessage(null);
            const result = await runAdminAction(() => resetFn({ data: { token, password } }));
            setBusy(false);
            if (result.ok) {
              setDone(true);
              setPassword("");
              setConfirmation("");
              setToken("");
            } else setMessage(result.message);
          }}
        >
          <Field id="reset-password" label="Nova senha">
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={1024}
              required
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field id="reset-confirm" label="Confirmar nova senha">
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={1024}
              required
              disabled={busy}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Redefinir senha"}
          </Button>
        </form>
      )}
      {message && (
        <Notice tone="error" role="alert">
          {message}
        </Notice>
      )}
      <Link to="/recuperar-senha" className="text-sm underline">
        Solicitar novo link
      </Link>
      <Link to="/entrar" className="text-sm underline">
        Voltar para entrar
      </Link>
    </main>
  );
}

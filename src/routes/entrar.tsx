import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "#/components/app-shell";
import { Card, Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  LOGIN_ERROR_MESSAGES,
  type LoginErrorCode,
  loginErrorFromSearch,
} from "#/server/auth-handlers";
import { safeRedirectTarget } from "#/server/session";

type LoginSearch = { erro?: LoginErrorCode; voltar?: string };

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const erro = loginErrorFromSearch(search.erro);
    const voltar = typeof search.voltar === "string" ? safeRedirectTarget(search.voltar) : "/";
    return {
      ...(erro === undefined ? {} : { erro }),
      ...(voltar === "/" ? {} : { voltar }),
    };
  },
  // Quem já está logado vai direto ao destino.
  beforeLoad: ({ context, search }) => {
    if (context.session.user !== null) throw redirect({ href: search.voltar ?? "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const { erro, voltar } = Route.useSearch();
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-sm pt-4 sm:pt-10">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
          <p className="mt-1 text-pretty text-muted-foreground">
            Use sua conta para importar a grade e gerenciar reservas.
          </p>
        </div>
        {erro !== undefined && (
          <Notice id="login-error" tone="error" role="alert" className="mb-4">
            {LOGIN_ERROR_MESSAGES[erro]}
          </Notice>
        )}
        {/* Formulário HTML comum: funciona sem JavaScript e fica dentro da CSP (form-action 'self'). */}
        <Card className="p-5 sm:p-6">
          <form method="post" action="/api/entrar" className="grid gap-4">
            <input type="hidden" name="voltar" value={voltar ?? "/"} />
            <div className="grid gap-2">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                aria-invalid={erro === undefined ? undefined : true}
                aria-describedby={erro === undefined ? undefined : "login-error"}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                aria-invalid={erro === undefined ? undefined : true}
                aria-describedby={erro === undefined ? undefined : "login-error"}
              />
            </div>
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

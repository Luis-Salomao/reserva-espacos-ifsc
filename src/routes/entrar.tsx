import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, LoaderCircle } from "lucide-react";
import { useState } from "react";
import campusImage from "#/assets/campus-garopaba-login.webp";
import { Field } from "#/components/ds";
import { Notice } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
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
  const { session } = Route.useRouteContext();
  const [submitting, setSubmitting] = useState(false);
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="grid min-h-svh w-full bg-surface lg:grid-cols-2">
        <div className="relative isolate hidden overflow-hidden bg-zinc-900 lg:block">
          <img
            src={campusImage}
            alt="Ilustração gerada por IA a partir da fachada do IFSC Câmpus Garopaba"
            width={1024}
            height={1536}
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/10 to-black/20" />
          <div className="relative flex h-full flex-col justify-between p-9 text-white xl:p-14">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="size-5" aria-hidden="true" /> Reserva de Espaços
            </p>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-xl flex-col px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
          <div className="my-auto w-full">
            <div className="mb-8">
              <p className="mb-2 text-xs font-medium text-muted-foreground">IFSC Câmpus Garopaba</p>
              <h1 className="text-3xl font-semibold tracking-tight">Entrar</h1>
            </div>
            {erro !== undefined && (
              <Notice id="login-error" tone="error" role="alert" className="mb-4">
                {LOGIN_ERROR_MESSAGES[erro]}
              </Notice>
            )}
            {/* Formulário HTML comum: funciona sem JavaScript e fica dentro da CSP (form-action 'self'). */}

            <form
              method="post"
              action="/api/entrar"
              className="grid gap-5"
              onSubmit={() => setSubmitting(true)}
            >
              <input type="hidden" name="voltar" value={voltar ?? "/"} />
              <Field id="login-email" label="E-mail">
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="seu.email@ifsc.edu.br"
                  className="h-11"
                  required
                  maxLength={254}
                  aria-invalid={erro === undefined ? undefined : true}
                  aria-describedby={erro === undefined ? undefined : "login-error"}
                />
              </Field>
              <Field id="login-password" label="Senha">
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className="h-11"
                  required
                  maxLength={1024}
                  aria-invalid={erro === undefined ? undefined : true}
                  aria-describedby={erro === undefined ? undefined : "login-error"}
                />
              </Field>
              <Button type="submit" className="mt-1 h-11 w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    Entrando…
                  </>
                ) : (
                  <>
                    Entrar <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
              <p className="sr-only" aria-live="polite" role="status">
                {submitting ? "Verificando seu acesso." : ""}
              </p>
            </form>
            <Link to="/recuperar-senha" className="mt-4 inline-block text-sm underline">
              Esqueci minha senha
            </Link>
            {session.publicRead && (
              <div className="mt-6 border-t pt-6">
                <Button asChild variant="outline" className="h-11 w-full">
                  <Link to="/">Entrar como visitante</Link>
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Consulte a agenda e a disponibilidade dos espaços. Para reservar, entre com sua
                  conta.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

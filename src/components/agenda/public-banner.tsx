import { Link } from "@tanstack/react-router";
import { Eye, LogIn } from "lucide-react";
import { Button } from "#/components/ui/button";

export function PublicBanner() {
  return (
    <div
      role="status"
      aria-label="Aviso de visitante"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 p-3 text-sm text-foreground sm:px-4"
    >
      <Eye className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        Você está vendo como <strong className="font-semibold">visitante</strong>. Qualquer pessoa
        pode consultar; para reservar, entre.
      </span>
      <Button asChild size="sm" className="ml-auto font-semibold">
        <Link to="/entrar">
          <LogIn className="mr-1.5 size-4" /> Entrar
        </Link>
      </Button>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";

/** Apresentação curta para quem abre o sistema sem entrar (visitante). */
export function SystemIntro() {
  return (
    <section
      aria-label="Sobre o sistema"
      className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-l-4 border-l-brand-red bg-surface-2 px-4 py-3"
    >
      <div className="grid max-w-prose gap-1 text-sm">
        <p className="font-semibold">Sistema de Reserva de Espaços do IFSC Câmpus Garopaba</p>
        <p className="text-muted-foreground">
          Qualquer pessoa pode consultar a ocupação das salas e laboratórios. Para reservar um
          espaço, é preciso entrar com a sua conta.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/entrar">Entrar</Link>
      </Button>
    </section>
  );
}

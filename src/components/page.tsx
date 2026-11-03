import type { ComponentProps, ReactNode } from "react";
import { cn } from "#/lib/utils";

type HeaderProps = {
  title: string;
  description?: ReactNode;
  /** Ações alinhadas à direita do título (botões, links). */
  actions?: ReactNode;
  /** Link ou texto de apoio acima do título (ex.: "Voltar"). */
  back?: ReactNode;
};

/** Cabeçalho de página: título, descrição curta e ações, com o mesmo espaçamento em todas as telas. */
export function PageHeader({ title, description, actions, back }: HeaderProps) {
  return (
    <div className="mb-6 grid gap-2">
      {back !== undefined && <div className="text-sm">{back}</div>}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description !== undefined && (
            <p className="max-w-prose text-muted-foreground">{description}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

type SectionProps = {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Seção de página com título opcional e respiro vertical consistente. */
export function PageSection({ title, description, children, className }: SectionProps) {
  return (
    <section className={cn("mt-8 grid gap-3 first:mt-0", className)}>
      {title !== undefined && (
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description !== undefined && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Cartão padrão: superfície suave, borda fina e cantos arredondados. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-xl border bg-surface p-4 shadow-xs sm:p-5", className)}
      {...props}
    />
  );
}

type NoticeProps = ComponentProps<"p"> & { tone?: "error" | "neutral" };

/** Aviso em bloco (erro de carregamento, estado vazio). Sempre com texto, nunca só cor. */
export function Notice({ tone = "neutral", className, ...props }: NoticeProps) {
  return (
    <p
      className={cn(
        "rounded-xl border p-4 text-sm",
        tone === "error" ? "border-destructive/40 bg-occ-conflict" : "bg-surface text-center",
        className,
      )}
      {...props}
    />
  );
}

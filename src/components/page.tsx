import type { ComponentProps, ReactNode } from "react";
import { type TagTone, TONE_SURFACE } from "#/components/ds";
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
          <h1 className="text-xl leading-tight font-semibold tracking-[-0.015em]">{title}</h1>
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
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
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
export function Card({
  className,
  tone,
  compact = false,
  ...props
}: ComponentProps<"div"> & { tone?: TagTone; compact?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-lg border bg-surface",
        compact ? "p-3" : "p-4",
        tone !== undefined && TONE_SURFACE[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Mensagem em bloco com conteúdo composto (div): mesmo visual de `Notice`. */
export function Callout({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: "error" | "ok" | "info" | "neutral" }) {
  return (
    <div
      className={cn("rounded-lg border p-3 text-[13px]", NOTICE_TONE[tone], className)}
      {...props}
    />
  );
}

type NoticeProps = ComponentProps<"p"> & { tone?: "error" | "ok" | "info" | "neutral" };

const NOTICE_TONE = {
  error: "border-line-conflict bg-occ-conflict font-medium",
  ok: "border-line-free bg-occ-free",
  info: "border-line-imported bg-occ-imported",
  neutral: "bg-surface text-center",
} as const;

/** Mensagem em bloco (erro, sucesso, estado vazio), como .err/.okmsg do protótipo. Sempre com texto. */
export function Notice({ tone = "neutral", className, ...props }: NoticeProps) {
  return (
    <p
      className={cn("rounded-lg border p-3 text-[13px]", NOTICE_TONE[tone], className)}
      {...props}
    />
  );
}

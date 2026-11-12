import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/admin/contas", label: "Contas" },
  { to: "/admin/espacos", label: "Espaços" },
] as const;

/** Navegação interna da administração. */
export function AdminNav() {
  return (
    <nav aria-label="Administração" className="mb-3 flex flex-wrap gap-2 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="rounded-full border px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          activeProps={{
            className:
              "rounded-full border border-transparent bg-surface-2 px-3 py-2 font-semibold text-foreground shadow-[inset_0_-2px_0_var(--accent)]",
            "aria-current": "page",
          }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

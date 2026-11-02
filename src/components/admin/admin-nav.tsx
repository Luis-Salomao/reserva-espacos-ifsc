import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/admin/contas", label: "Contas" },
  { to: "/admin/espacos", label: "Espaços" },
] as const;

/** Navegação interna da administração. */
export function AdminNav() {
  return (
    <nav aria-label="Administração" className="mb-4 flex flex-wrap gap-2 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="rounded-md border px-3 py-2 hover:bg-surface-2"
          activeProps={{ className: "bg-surface-2 font-semibold", "aria-current": "page" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

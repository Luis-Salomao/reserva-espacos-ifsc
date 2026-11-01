import { Moon, Sun } from "lucide-react";
import { Button } from "#/components/ui/button";

const THEME_STORAGE_KEY = "theme";

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Alterna entre tema claro e escuro, gravando a escolha em `data-theme` e `localStorage`. */
export function ThemeToggle() {
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Armazenamento indisponível: o tema vale apenas nesta visita.
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Alternar tema" onClick={toggle}>
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="dark:hidden" aria-hidden="true" />
    </Button>
  );
}

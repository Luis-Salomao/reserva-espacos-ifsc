import { cn } from "#/lib/utils";

const PALETTE = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-100",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/70 dark:text-violet-100",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/70 dark:text-rose-100",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/70 dark:text-teal-100",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-100",
  "bg-lime-100 text-lime-900 dark:bg-lime-900/70 dark:text-lime-100",
] as const;

const SIZES = {
  xs: "size-4 text-[8px]",
  sm: "size-5 text-[9px]",
  md: "size-7 text-[11px]",
} as const;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Mesma pessoa, mesma cor em qualquer tela (hash estável do nome). */
export function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0];
}

type Props = { name: string; size?: keyof typeof SIZES; className?: string };

/** Avatar de iniciais. Decorativo: o nome deve aparecer em texto ao lado ou num rótulo. */
export function Avatar({ name, size = "md", className }: Props) {
  return (
    <span
      aria-hidden="true"
      data-slot="avatar"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight select-none",
        SIZES[size],
        avatarTone(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

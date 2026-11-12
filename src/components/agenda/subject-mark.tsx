/** Sigla legível, independente de turma, data e estado. O título identifica nomes com siglas iguais. */
export function SubjectMark({ title }: { title: string }) {
  const subject = (title.split(" — ")[0] ?? title).trim().replace(/\s+/g, " ").toUpperCase();
  const label =
    subject.length <= 6
      ? subject
      : subject
          .split(" ")
          .map((word) => word[0])
          .join("")
          .slice(0, 4);

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 shrink-0 items-center rounded-[3px] border border-current px-1 text-[9px] font-semibold leading-none text-foreground"
    >
      {label}
    </span>
  );
}

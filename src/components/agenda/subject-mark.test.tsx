import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SubjectMark } from "./subject-mark";

function label(title: string): string | null {
  const { container } = render(<SubjectMark title={title} />);
  return container.textContent;
}

describe("SubjectMark", () => {
  test("mantém a sigla da disciplina entre turmas e variações de caixa/espaço", () => {
    expect(label("ALG — T1A")).toBe("ALG");
    expect(label(" alg  — T2B")).toBe("ALG");
    expect(label("Cálculo I — T1A")).toBe("CI");
    expect(label("CÁLCULO I — T2B")).toBe("CI");
  });

  test("distingue disciplinas pela sigla legível mesmo com a mesma cor", () => {
    const subjects = ["ALG", "MAT", "POR", "FIS", "QUI", "BIO", "HIS", "GEO", "ING", "RED"];
    expect(new Set(subjects.map(label)).size).toBe(subjects.length);
  });

  test("usa o contraste do texto do tema e é redundante para leitores de tela", () => {
    const { container } = render(<SubjectMark title="ALG — T1A" />);
    const mark = container.firstElementChild;
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.className).toContain("text-foreground");
    expect(container.textContent).toBe("ALG");
  });
});

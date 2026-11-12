import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EquipmentMarks } from "./equipment-marks";
import { type PageView, ViewTabsBar } from "./view-switcher";

afterEach(cleanup);

const VIEWS: PageView[] = ["sala", "colunas", "livres", "geral"];

test("a linha de abas tem a mesma estrutura em qualquer visualização ativa", () => {
  const shapes = VIEWS.map((view) => {
    const { container, unmount } = render(<ViewTabsBar value={view} onChange={() => {}} />);
    const bar = container.querySelector("[data-slot='view-tabs']");
    const labels = [...(bar?.querySelectorAll("fieldset button") ?? [])].map((b) => b.textContent);
    const classes = [...(bar?.querySelectorAll("fieldset button") ?? [])].map((b) =>
      b.className
        .split(/\s+/)
        .filter(
          (token) =>
            !/(^|:)(bg-|text-primary|text-muted|text-foreground|font-semibold|font-medium|shadow)/.test(
              token,
            ),
        )
        .join(" "),
    );
    const shape = { barClass: bar?.className, labels, classes };
    expect(bar?.querySelectorAll("[aria-pressed='true']").length).toBe(1);
    unmount();
    return JSON.stringify(shape);
  });
  expect(new Set(shapes).size).toBe(1);
});

test("clicar numa aba chama onChange com a visualização", () => {
  const seen: PageView[] = [];
  render(<ViewTabsBar value="sala" onChange={(view) => seen.push(view)} />);
  fireEvent.click(screen.getByRole("button", { name: "Salas livres" }));
  expect(seen).toEqual(["livres"]);
});

test("agenda e salas usam o mesmo componente de abas, uma vez cada, sem ViewSwitcher solto", () => {
  for (const file of ["agenda/agenda-view.tsx", "rooms/rooms-view.tsx"]) {
    const source = readFileSync(join(import.meta.dir, file), "utf8");
    expect(source.match(/<ViewTabsBar/g)?.length).toBe(1);
    expect(source).not.toContain("<ViewSwitcher");
  }
});

test("equipamento: 'sem' tem risco vermelho e 'não informado' risco cinza, ambos decorativos", () => {
  const { container } = render(
    <EquipmentMarks equipment={{ items: { projetor: 0, som: 1 }, notes: null } as never} />,
  );
  const sem = container.querySelector("[data-estado='sem'] [data-corte='sem']");
  const nao = container.querySelector("[data-estado='nao-informado'] [data-corte='nao-informado']");
  expect(sem?.className).toContain("bg-destructive");
  expect(nao?.className).toContain("bg-muted-foreground");
  expect(nao?.className).not.toContain("bg-destructive");
  expect(nao?.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector("[data-estado='tem'] [data-corte]")).toBeNull();
  expect(container.textContent).toContain("não informado");
});

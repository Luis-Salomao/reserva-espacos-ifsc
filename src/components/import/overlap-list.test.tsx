import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OverlapList } from "./overlap-list";

test("explica o que é sobreposição possível e lista os detalhes", () => {
  render(
    <OverlapList
      overlaps={{ certain: 1, possible: 0 }}
      detail={[
        {
          key: "0:R1:0:L1:L2",
          room: "101",
          weekday: 0,
          kind: "certain",
          a: { label: "Mat", classes: "T1, T2", start: "08:00", end: "08:50" },
          b: { label: "Fis", classes: "T3", start: "08:30", end: "09:20" },
        },
      ]}
    />,
  );
  expect(screen.getByText(/"possível" quando uma das aulas tem várias salas/)).toBeTruthy();
  expect(screen.getByText(/Certa · sala 101 · Segunda-feira/)).toBeTruthy();
  expect(screen.getByText(/Mat · T1, T2 \(08:00–08:50\) e Fis · T3 \(08:30–09:20\)/)).toBeTruthy();
  expect(screen.queryByText(/Mostrando/)).toBeNull();
});

test("indica o truncamento do detalhe", () => {
  render(<OverlapList overlaps={{ certain: 1000, possible: 5 }} detail={[]} truncated />);
  expect(screen.getByText("Mostrando 0 de 1005 sobreposições.")).toBeTruthy();
});

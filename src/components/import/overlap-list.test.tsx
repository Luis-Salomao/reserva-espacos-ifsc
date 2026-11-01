import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OverlapList } from "./overlap-list";

test("explica o que é sobreposição possível e lista os detalhes", () => {
  render(
    <OverlapList
      overlaps={{ certain: 1, possible: 0 }}
      detail={[
        {
          room: "101",
          weekday: 0,
          kind: "certain",
          a: { label: "Mat", start: "08:00", end: "08:50" },
          b: { label: "Fis", start: "08:30", end: "09:20" },
        },
      ]}
    />,
  );
  expect(screen.getByText(/"possível" quando uma das aulas tem várias salas/)).toBeTruthy();
  expect(screen.getByText(/Certa · sala 101 · Segunda-feira/)).toBeTruthy();
  expect(screen.getByText(/Mat \(08:00–08:50\) e Fis/)).toBeTruthy();
});

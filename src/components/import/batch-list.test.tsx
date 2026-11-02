import { afterEach, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import type { BatchView } from "#/application/import-report";
import { EMPTY_COUNTS } from "#/domain/import-batch";
import { BatchList } from "./batch-list";

afterEach(cleanup);

const view = (over: Partial<BatchView>): BatchView => ({
  id: "b1",
  semesterId: "s1",
  semesterName: "2026.2",
  status: "aplicado",
  createdAt: "2026-11-03T13:00:00.000Z",
  appliedAt: "2026-11-03T13:05:00.000Z",
  hashPrefix: "abcdef01",
  summary: { rows: 0, notApplicable: {}, counts: { ...EMPTY_COUNTS } },
  supersedesBatchId: null,
  supersedesAppliedAt: null,
  affectedNames: [],
  ...over,
});

async function renderList(batches: BatchView[]) {
  const root = createRootRoute({
    component: () => (
      <BatchList batches={batches} timeZone="America/Sao_Paulo" onChanged={() => {}} />
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("list");
}

describe("BatchList", () => {
  test("mostra de qual versão o lote é a continuação", async () => {
    await renderList([
      view({ id: "b2", supersedesBatchId: "b1", supersedesAppliedAt: "2026-11-02T13:30:00.000Z" }),
      view({ id: "b1" }),
    ]);
    expect(screen.getAllByText("Nova versão de 02/11/2026")).toHaveLength(1);
  });

  test("Descartar aparece só em lotes que ainda não foram aplicados", async () => {
    await renderList([
      view({ id: "b3", status: "rascunho" }),
      view({ id: "b2", status: "aplicado" }),
      view({ id: "b1", status: "aplicando" }),
    ]);
    expect(screen.getAllByRole("button", { name: "Descartar lote" })).toHaveLength(1);
  });
});

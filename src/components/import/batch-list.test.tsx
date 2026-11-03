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
  outdated: false,
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

  test("pendentes inclui cancelar e troca de responsável, não só pendente", async () => {
    await renderList([
      view({
        status: "rascunho",
        summary: {
          rows: 0,
          notApplicable: {},
          counts: { ...EMPTY_COUNTS, pendente: 2, cancelar: 3, responsavel: 4, falha: 1 },
        },
      }),
    ]);
    expect(screen.getByText(/10 pendentes/)).toBeTruthy();
  });

  test("lote de nova versão mostra criadas, canceladas e responsáveis atualizados", async () => {
    await renderList([
      view({
        supersedesBatchId: "b0",
        summary: {
          rows: 0,
          notApplicable: {},
          counts: {
            ...EMPTY_COUNTS,
            aplicada: 4,
            cancelada_versao: 3,
            responsavel_atualizado: 2,
            alteracao_bloqueada: 1,
          },
          version: {
            supersedesBatchId: "b0",
            inclusoes: 0,
            alteracoes: 0,
            bloqueadas: 1,
            remocoes: 0,
            responsaveis: 2,
            inalteradas: 0,
            mantidasCanceladas: 0,
            affectedUserIds: [],
          },
        },
      }),
    ]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("4 aplicadas");
    expect(text).toContain("3 canceladas");
    expect(text).toContain("2 responsáveis atualizados");
    expect(text).toContain("1 bloqueada");
  });

  test("primeira versão não mostra contagens de nova versão", async () => {
    await renderList([view({})]);
    expect(document.body.textContent).not.toContain("canceladas");
  });

  test("rascunho desatualizado mostra o aviso para enviar de novo", async () => {
    await renderList([
      view({ id: "b3", status: "rascunho", outdated: true }),
      view({ id: "b2", status: "rascunho", outdated: false }),
    ]);
    expect(screen.getAllByText(/versão desatualizada — envie novamente/)).toHaveLength(1);
  });

  test("identifica o arquivo pelo prefixo do hash, nunca como Lote", async () => {
    await renderList([view({})]);
    expect(document.body.textContent).toContain("arquivo abcdef01");
    expect(document.body.textContent).not.toMatch(/Lote abcdef01/);
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

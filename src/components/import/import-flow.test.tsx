import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ImportBatch } from "#/domain/import-batch";
import type { PreviewView } from "#/server/import-preview-view";

const semester = {
  id: "s1",
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-12-19",
  terms: [{ position: 1, start: "2026-08-03", end: "2026-09-12" }],
  blocks: [],
};

const counts = {
  pendente: 2,
  aplicada: 0,
  nao_aplicavel: 0,
  conflito: 0,
  conflito_interno: 0,
  falha: 0,
};

const batch = (status: ImportBatch["status"]): ImportBatch => ({
  id: "b1",
  semesterId: "s1",
  fileHash: "abcdef0123456789",
  summary: { rows: 2, notApplicable: {}, counts },
  planHash: null,
  status,
  createdBy: "u",
  createdAt: "2026-11-02T10:00:00.000Z",
  appliedAt: null,
});

const applyCalls: string[] = [];

mock.module("#/server/import-fns", () => ({
  getImportTargetsFn: async () => ({
    ok: true,
    data: { semesters: [semester], spaces: [], accounts: [] },
  }),
  suggestMappingsFn: async () => ({ ok: true, data: { rooms: [], teachers: [] } }),
  saveRoomMappingsFn: async () => ({ ok: true, data: null }),
  saveTeacherMappingsFn: async () => ({ ok: true, data: null }),
  createImportSpaceFn: async () => ({ ok: true, data: { id: "x", name: "x" } }),
  applyImportBatchFn: async () => {
    applyCalls.push("apply");
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { ok: true, data: { batch: { ...batch("aplicado") }, done: true, remaining: 0 } };
  },
  getImportRowsFn: async () => ({ ok: false, status: 404, message: "sem linhas no teste" }),
}));

const { ImportFlow } = await import("./import-flow");

const view = {
  rooms: [],
  teachers: [],
  termsUsed: [],
  partial: false,
} as unknown as PreviewView;

const realFetch = globalThis.fetch;
let prepareCalls = 0;

beforeEach(() => {
  prepareCalls = 0;
  applyCalls.length = 0;
  globalThis.fetch = (async () => {
    prepareCalls++;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    return new Response(
      JSON.stringify({
        ok: true,
        data: { batch: batch("rascunho"), reused: false, done: true, remaining: 0 },
      }),
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

async function renderFlow() {
  const root = createRootRoute({
    component: () => <ImportFlow view={view} file={new File(["<x/>"], "a.xml")} />,
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const utils = render(<RouterProvider router={router} />);
  const button = await screen.findByRole("button", { name: "Conferir importação" });
  return { ...utils, button };
}

describe("ImportFlow: reentrada", () => {
  test("clique duplo em Conferir dispara um único preparo", async () => {
    const { button } = await renderFlow();
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Aplicar importação" });
    expect(prepareCalls).toBe(1);
  });

  test("clique duplo em Aplicar dispara uma única aplicação", async () => {
    const { button } = await renderFlow();
    fireEvent.click(button);
    const apply = await screen.findByRole("button", { name: "Aplicar importação" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await screen.findByText(/Importação concluída/);
    expect(applyCalls).toHaveLength(1);
  });

  test("desmontar durante o preparo aborta o laço (não chama de novo)", async () => {
    globalThis.fetch = (async () => {
      prepareCalls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(
        JSON.stringify({
          ok: true,
          data: { batch: batch("preparando"), reused: false, done: false, remaining: 1 },
        }),
      );
    }) as unknown as typeof fetch;
    const { button, unmount } = await renderFlow();
    fireEvent.click(button);
    await waitFor(() => expect(prepareCalls).toBe(1));
    unmount();
    const seen = prepareCalls;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(prepareCalls).toBe(seen);
  });
});

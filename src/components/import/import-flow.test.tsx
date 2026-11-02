import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_COUNTS, type ImportBatch } from "#/domain/import-batch";
import type { PreviewView } from "#/server/import-preview-view";

const semester = {
  id: "s1",
  name: "2026.2",
  start: "2026-08-03",
  end: "2026-12-19",
  terms: [{ position: 1, start: "2026-08-03", end: "2026-09-12" }],
  blocks: [],
};

const counts = { ...EMPTY_COUNTS, pendente: 2 };

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
  supersedesBatchId: null,
});

const applyCalls: string[] = [];
const discardCalls: string[] = [];
let inProgress: unknown[] = [];
let rowsResponse: unknown = { ok: false, status: 404, message: "sem linhas no teste" };

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
  getImportRowsFn: async () => rowsResponse,
  listImportBatchesFn: async () => ({ ok: true, data: inProgress }),
  discardImportBatchFn: async ({ data }: { data: { batchId: string } }) => {
    discardCalls.push(data.batchId);
    return { ok: true, data: null };
  },
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
  discardCalls.length = 0;
  inProgress = [];
  rowsResponse = { ok: false, status: 404, message: "sem linhas no teste" };
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

const versionBatch = (): ImportBatch => ({
  ...batch("rascunho"),
  supersedesBatchId: "b0",
  summary: {
    rows: 8,
    notApplicable: {},
    counts: { ...EMPTY_COUNTS, cancelar: 3, pendente: 5, inalterada: 40 },
    version: {
      supersedesBatchId: "b0",
      inclusoes: 2,
      alteracoes: 3,
      bloqueadas: 1,
      remocoes: 0,
      responsaveis: 0,
      inalteradas: 40,
      mantidasCanceladas: 4,
      affectedUserIds: ["u1", "u2"],
    },
  },
});

function prepareReturns(body: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("ImportFlow: nova versão da grade", () => {
  test("mostra o resumo por tipo, os responsáveis afetados e confirma com Aplicar mudanças", async () => {
    prepareReturns({
      ok: true,
      data: { batch: versionBatch(), reused: false, done: true, remaining: 0 },
    });
    rowsResponse = {
      ok: true,
      data: {
        batch: { ...versionBatch(), affectedNames: ["Beltrana Teste", "Fulano Teste"] },
        total: 0,
        limit: 1,
        offset: 0,
        rows: [],
        reasons: [],
      },
    };
    const { button } = await renderFlow();
    fireEvent.click(button);
    await screen.findByRole("heading", { name: "Nova versão da grade" });
    for (const label of [
      "Inclusões",
      "Alterações",
      "Bloqueadas",
      "Remoções",
      "Inalteradas",
      "Canceladas mantidas",
      "Troca de responsável",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.getByText("Responsáveis afetados: 2")).toBeTruthy();
    // Os nomes chegam junto do lote, sem esperar a tabela de linhas.
    expect(screen.getByText("Beltrana Teste, Fulano Teste")).toBeTruthy();
    expect(screen.getByText("Serão canceladas 3 ocupações e criadas 5.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar mudanças" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aplicar importação" })).toBeNull();
  });

  test("primeira versão mantém a interface da fase anterior", async () => {
    const { button } = await renderFlow();
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Aplicar importação" });
    expect(screen.queryByRole("heading", { name: "Nova versão da grade" })).toBeNull();
  });

  test("outro lote em andamento: mensagem, link, Retomar e Descartar com confirmação", async () => {
    prepareReturns(
      {
        ok: false,
        message:
          "Há outro lote deste semestre em andamento (aplicando ou interrompido). Conclua-o, ou descarte-o se nada foi aplicado, antes de continuar.",
      },
      409,
    );
    inProgress = [
      {
        id: "busy-1",
        semesterId: "s1",
        semesterName: "2026.2",
        status: "falhou",
        createdAt: "2026-11-02T10:00:00.000Z",
        appliedAt: null,
        hashPrefix: "aaaa0000",
        summary: { rows: 2, notApplicable: {}, counts: { ...EMPTY_COUNTS, falha: 2 } },
        supersedesBatchId: null,
        supersedesAppliedAt: null,
        affectedNames: [],
      },
    ];
    const { button } = await renderFlow();
    fireEvent.click(button);
    await screen.findByText(/Há outro lote deste semestre em andamento/);
    const link = await screen.findByRole("link", { name: "Abrir o lote em andamento" });
    expect(link.getAttribute("href")).toContain("/importar/lotes/busy-1");
    expect(screen.getByRole("button", { name: "Retomar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar lote" }));
    expect(await screen.findByText("Descartar este lote?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(discardCalls).toEqual(["busy-1"]));
    await waitFor(() => expect(screen.queryByText(/Há outro lote deste semestre/)).toBeNull());
  });

  test("versão defasada: pede para enviar o arquivo de novo", async () => {
    prepareReturns(
      {
        ok: false,
        message:
          "Outra versão da grade foi aplicada depois deste preparo. Envie o arquivo de novo para refazer a conferência.",
      },
      409,
    );
    const { button } = await renderFlow();
    fireEvent.click(button);
    expect(
      await screen.findByText("Uma versão mais nova já foi aplicada; envie o arquivo novamente."),
    ).toBeTruthy();
  });

  test("Descartar fica desabilitado, com explicação, quando o lote já aplicou parte", async () => {
    prepareReturns(
      {
        ok: false,
        message:
          "Há outro lote deste semestre em andamento (aplicando ou interrompido). Conclua-o, ou descarte-o se nada foi aplicado, antes de continuar.",
      },
      409,
    );
    inProgress = [
      {
        id: "busy-2",
        semesterId: "s1",
        semesterName: "2026.2",
        status: "falhou",
        createdAt: "2026-11-02T10:00:00.000Z",
        appliedAt: null,
        hashPrefix: "bbbb0000",
        summary: { rows: 2, notApplicable: {}, counts: { ...EMPTY_COUNTS, aplicada: 1, falha: 1 } },
        supersedesBatchId: null,
        supersedesAppliedAt: null,
        affectedNames: [],
      },
    ];
    const { button } = await renderFlow();
    fireEvent.click(button);
    const discard = await screen.findByRole("button", { name: "Descartar lote" });
    expect((discard as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/retome a aplicação/)).toBeTruthy();
  });
});

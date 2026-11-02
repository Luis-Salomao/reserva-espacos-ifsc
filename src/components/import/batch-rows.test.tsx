import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RowsPage, RowView } from "#/application/import-report";
import { EMPTY_COUNTS } from "#/domain/import-batch";
import { BatchRows, type LoadRows, type RowsQuery } from "./batch-rows";

afterEach(cleanup);

const batch: RowsPage["batch"] = {
  id: "b1",
  semesterId: "s1",
  semesterName: "2026.2",
  status: "aplicado",
  createdAt: "2026-11-02T10:00:00.000Z",
  appliedAt: null,
  hashPrefix: "abcdef01",
  summary: {
    rows: 0,
    notApplicable: {},
    counts: { ...EMPTY_COUNTS },
  },
};

const row = (over: Partial<RowView>): RowView => ({
  rowKey: "o:1",
  weekday: 0,
  date: "2026-08-03",
  startTime: "08:00",
  endTime: "09:50",
  spaceName: "Laboratório 7",
  title: "Algoritmos — T1A",
  responsibleName: "Profa. Exemplo",
  status: "aplicada",
  reasonCode: null,
  reasonDetail: null,
  conflictWith: null,
  ...over,
});

const rows: RowView[] = [
  row({}),
  row({
    rowKey: "o:2",
    title: "Cálculo — T2B",
    status: "conflito",
    spaceName: "Sala 12",
    reasonCode: "conflito_existente",
    reasonDetail: "Já existe uma ocupação ativa neste espaço e horário.",
    conflictWith: {
      title: "Reunião do colegiado",
      startsAt: "2026-08-03T08:00",
      endsAt: "2026-08-03T09:00",
      fromEarlierBatch: false,
    },
  }),
  row({
    rowKey: "n:0",
    status: "nao_aplicavel",
    date: null,
    spaceName: null,
    responsibleName: null,
    title: "Física — T3C",
    reasonCode: "room_unmapped",
    reasonDetail: "A sala 202 não foi vinculada a um espaço.",
  }),
  row({
    rowKey: "o:9",
    title: "Química — T4D",
    status: "falha",
    reasonCode: "erro_gravacao",
    reasonDetail: "Não foi possível gravar este grupo de linhas. Aplique o lote novamente.",
  }),
];

const reasons: RowsPage["reasons"] = [
  { status: "aplicada", reasonCode: null, total: 1 },
  { status: "conflito", reasonCode: "conflito_existente", total: 1 },
  { status: "nao_aplicavel", reasonCode: "room_unmapped", total: 1 },
  { status: "falha", reasonCode: "erro_gravacao", total: 1 },
];

function loader(total = rows.length) {
  const queries: RowsQuery[] = [];
  const load: LoadRows = async (query) => {
    queries.push(query);
    const wanted = rows.filter(
      (item) =>
        (query.status === undefined || item.status === query.status) &&
        (query.reasonCode === undefined || item.reasonCode === query.reasonCode),
    );
    return {
      ok: true,
      data: {
        batch,
        total: query.status === undefined && query.reasonCode === undefined ? total : wanted.length,
        limit: query.limit,
        offset: query.offset,
        rows: wanted,
        reasons,
      },
    };
  };
  return { load, queries };
}

describe("BatchRows", () => {
  test("mostra cada estado com rótulo de texto, motivo, conflito e falha", async () => {
    const { load } = loader();
    render(<BatchRows batchId="b1" load={load} />);
    await screen.findByText("Algoritmos — T1A");
    expect(screen.getByText("Mostrando 1–4 de 4.")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Aplicada")).toBeTruthy();
    expect(within(table).getByText("Conflito")).toBeTruthy();
    expect(within(table).getByText("Não aplicável")).toBeTruthy();
    expect(within(table).getByText("Falha ao gravar")).toBeTruthy();
    expect(within(table).getByText("Sala sem vínculo")).toBeTruthy();
    expect(within(table).getByText("A sala 202 não foi vinculada a um espaço.")).toBeTruthy();
    expect(
      within(table).getByText(/Conflita com “Reunião do colegiado” \(03\/08 08:00–09:00\)/),
    ).toBeTruthy();
    expect(within(table).getByText(/Aplique o lote novamente/)).toBeTruthy();
    expect(within(table).getAllByText("Seg 03/08/2026").length).toBeGreaterThan(0);
    expect(within(table).getByText("Segunda-feira")).toBeTruthy();
  });

  test("avisa quando o conflito é com ocupação de um lote anterior do mesmo semestre", async () => {
    const { load } = loader();
    const { rerender } = render(<BatchRows batchId="b1" load={load} />);
    await screen.findByText("Cálculo — T2B");
    expect(screen.queryByText(/versão alterada de um lote já aplicado/)).toBeNull();
    const earlier: LoadRows = async (query) => {
      const result = await load(query);
      if (!result.ok) return result;
      return {
        ...result,
        data: {
          ...result.data,
          rows: result.data.rows.map((item) =>
            item.conflictWith === null
              ? item
              : { ...item, conflictWith: { ...item.conflictWith, fromEarlierBatch: true } },
          ),
        },
      };
    };
    rerender(<BatchRows batchId="b2" load={earlier} />);
    expect(await screen.findByText(/versão alterada de um lote já aplicado/)).toBeTruthy();
    expect(screen.getByText(/comparação de versões ainda não está disponível/)).toBeTruthy();
  });

  test("filtra por estado e por motivo no servidor e volta à primeira página", async () => {
    const { load, queries } = loader();
    render(<BatchRows batchId="b1" load={load} />);
    await screen.findByText("Algoritmos — T1A");
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "conflito" } });
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ status: "conflito", offset: 0 }));
    await screen.findByText("Mostrando 1–1 de 1 (filtrado).");
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "room_unmapped" } });
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ reasonCode: "room_unmapped" }));
    expect(queries.at(-1)?.status).toBeUndefined();
  });

  test("busca por texto depois de uma pausa", async () => {
    const { load, queries } = loader();
    render(<BatchRows batchId="b1" load={load} />);
    await screen.findByText("Algoritmos — T1A");
    fireEvent.change(screen.getByLabelText("Buscar por aula, turma ou sala"), {
      target: { value: "  lab " },
    });
    await waitFor(() => expect(queries.at(-1)?.search).toBe("lab"));
  });

  test("pagina: próxima e anterior pedem outro deslocamento", async () => {
    const { load, queries } = loader(60);
    render(<BatchRows batchId="b1" load={load} />);
    await screen.findByText("Página 1 de 3");
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(queries.at(-1)?.offset).toBe(25));
    await screen.findByText("Página 2 de 3");
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await waitFor(() => expect(queries.at(-1)?.offset).toBe(0));
  });

  test("erro do servidor aparece com ação de tentar de novo", async () => {
    let calls = 0;
    const load: LoadRows = async (query) => {
      calls++;
      if (calls === 1)
        return { ok: false, status: 404, message: "Lote de importação não encontrado." };
      return loader().load(query);
    };
    render(<BatchRows batchId="b1" load={load} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Lote de importação não encontrado.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await screen.findByText("Algoritmos — T1A");
  });

  test("falha de rede também vira mensagem", async () => {
    const load: LoadRows = async () => {
      throw new Error("rede");
    };
    render(<BatchRows batchId="b1" load={load} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Não foi possível carregar");
  });

  test("lote sem linhas e filtro sem resultado têm mensagens próprias", async () => {
    const load: LoadRows = async (query) => ({
      ok: true,
      data: { batch, total: 0, limit: query.limit, offset: 0, rows: [], reasons: [] },
    });
    render(<BatchRows batchId="b1" load={load} />);
    await screen.findByText("Este lote não tem linhas.");
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "falha" } });
    await screen.findByText("Nenhuma linha com esses filtros.");
  });
});

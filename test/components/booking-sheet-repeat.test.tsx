import { describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  AgendaItem,
  BookingView,
  RecurringOutcome,
  RecurringPreview,
  RoomsDay,
} from "#/application/bookings";
import { BookingSheet, type BookingSheetProps } from "#/components/agenda/booking-sheet";
import type { SubjectsLoad } from "#/components/agenda/subject-combobox";
import type { AdminResponse } from "#/server/admin-actions";

const SPACES = [
  { id: "space-adm", name: "ADM 2", capacity: 30 },
  { id: "space-lab", name: "LAB 1", capacity: 20 },
];

/** Terça, 2ª semana do mês. */
const DATE = "2030-12-10";

const PREVIEW: RecurringPreview = {
  summary: "Toda terça, até 31/12, 4 datas",
  dates: [
    { date: "2030-12-10", free: true },
    { date: "2030-12-17", free: false, reason: "MAT1, 10:10–12:00" },
    { date: "2030-12-24", free: true },
    { date: "2030-12-31", free: true },
  ],
};

type PreviewFn = NonNullable<BookingSheetProps["previewRecurring"]>;
type CreateFn = NonNullable<BookingSheetProps["createRecurring"]>;

function previewMock(response: AdminResponse<RecurringPreview> = { ok: true, data: PREVIEW }) {
  return mock<PreviewFn>(async () => response);
}

function createMock(response: AdminResponse<RecurringOutcome>) {
  return mock<CreateFn>(async () => response);
}

const CREATED: AdminResponse<RecurringOutcome> = {
  ok: true,
  data: {
    created: true,
    seriesId: "ser-1",
    dates: ["2030-12-10", "2030-12-24", "2030-12-31"],
    skipped: [{ date: "2030-12-17", free: false, reason: "MAT1, 10:10–12:00" }],
  },
};

const SUBJECTS: SubjectsLoad = async () => ({ ok: true, data: { mine: [], all: [] } });

async function renderSheet(props: Partial<BookingSheetProps> = {}) {
  const root = createRootRoute({
    component: () => (
      <BookingSheet
        open
        onOpenChange={() => {}}
        spaces={SPACES}
        initialSlot={{ spaceId: "space-adm", date: DATE, start: "10:00", end: "11:00" }}
        subjectsFn={SUBJECTS}
        {...props}
      />
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/minhas-reservas",
    component: () => <div>Minhas reservas</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByRole("dialog");
}

const repeatToggle = () => screen.getByRole("button", { name: /^Repetir/ });
const freqSelect = () => screen.getByRole("combobox", { name: "Repetição" }) as HTMLSelectElement;
const summary = () => screen.getByTestId("repeat-summary").textContent;

function openRepeat() {
  fireEvent.click(repeatToggle());
}

function chooseWeekly() {
  openRepeat();
  fireEvent.change(freqSelect(), { target: { value: "weekly" } });
}

function fillPurpose(text = "Monitoria") {
  fireEvent.change(screen.getByLabelText("Matéria ou título"), { target: { value: text } });
}

describe("BookingSheet: seção Repetir", () => {
  test("abre recolhida em 'Não repete', sem as opções de repetição", async () => {
    await renderSheet();
    const toggle = repeatToggle();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Não repete");
    expect(screen.queryByRole("combobox", { name: "Repetição" }) === null).toBe(true);
    expect(screen.queryByTestId("repeat-summary") === null).toBe(true);
    expect(screen.getByRole("button", { name: "Reservar" })).toBeDefined();
  });

  test("ao abrir oferece as regras, com o dia e a semana derivados da data", async () => {
    await renderSheet();
    openRepeat();
    expect(repeatToggle().getAttribute("aria-expanded")).toBe("true");
    expect(Array.from(freqSelect().options).map((option) => option.textContent)).toEqual([
      "Não repete",
      "Todo dia útil (seg. a sex.)",
      "Semanal",
      "Todo mês no dia 10",
      "Todo mês na 2ª terça",
    ]);
    // sem regra ainda não há término nem resumo
    expect(screen.queryByRole("radio", { name: "Até a data" }) === null).toBe(true);
  });

  test("semanal: o dia da data inicial vem marcado; marcar outro dia muda o resumo", async () => {
    await renderSheet();
    chooseWeekly();
    expect(screen.getByRole("button", { name: "Terça" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Quinta" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(summary()).toBe("Toda terça, até 11/02/2031, 10 datas");
    fireEvent.click(screen.getByRole("button", { name: "Quinta" }));
    expect(summary()).toBe("Toda terça e quinta, até 09/01/2031, 10 datas");
    expect(repeatToggle().textContent).toContain("Toda terça e quinta");
    fireEvent.change(screen.getByLabelText("A cada quantas semanas"), { target: { value: "2" } });
    expect(summary()).toContain("A cada 2 semanas: terça e quinta");
  });

  test("término por data final ou por número de ocorrências", async () => {
    await renderSheet();
    chooseWeekly();
    fireEvent.click(screen.getByRole("radio", { name: "Até a data" }));
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2030-12-24" } });
    expect(summary()).toBe("Toda terça, até 24/12, 3 datas");
    fireEvent.click(screen.getByRole("radio", { name: "Depois de" }));
    fireEvent.change(screen.getByLabelText("Número de ocorrências"), { target: { value: "2" } });
    expect(summary()).toBe("Toda terça, até 17/12, 2 datas");
  });

  test("regra inválida: o resumo mostra o problema e 'Ver datas' não chama o servidor", async () => {
    const preview = previewMock();
    await renderSheet({ previewRecurring: preview });
    chooseWeekly();
    fireEvent.change(screen.getByLabelText("Número de ocorrências"), { target: { value: "121" } });
    expect(summary()).toBe("O número de ocorrências deve ser de 1 a 120.");
    fillPurpose();
    fireEvent.click(screen.getByRole("button", { name: "Ver datas" }));
    const section = screen.getByTestId("repeat-section");
    expect(within(section).getByRole("alert").textContent).toBe(
      "O número de ocorrências deve ser de 1 a 120.",
    );
    expect(preview).not.toHaveBeenCalled();
  });

  test("'Não repete' reserva uma data só pelo fluxo simples", async () => {
    const preview = previewMock();
    const createFn = mock(async () => ({
      ok: true as const,
      data: {
        id: "b1",
        spaceId: "space-adm",
        date: DATE,
        start: "10:00",
        end: "11:00",
        title: "Monitoria",
      } satisfies BookingView,
    }));
    await renderSheet({ previewRecurring: preview, createFn });
    chooseWeekly();
    fireEvent.change(freqSelect(), { target: { value: "none" } });
    fillPurpose();
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));
    await screen.findByTestId("booking-success-view");
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(preview).not.toHaveBeenCalled();
  });

  test("com repetição, sala ocupada na data inicial continua selecionável", async () => {
    const day: RoomsDay = {
      date: DATE,
      now: "2030-11-01T08:00",
      rooms: SPACES.map((space) => ({
        spaceId: space.id,
        date: DATE,
        now: "2030-11-01T08:00",
        hours: { opens: "06:00", closes: "23:00" },
        occupations:
          space.id === "space-adm"
            ? [
                {
                  id: "o1",
                  date: DATE,
                  start: "10:00",
                  end: "12:00",
                  title: "Física",
                  source: "import",
                  status: "ativa",
                  canCancel: false,
                  mine: false,
                  person: null,
                } satisfies AgendaItem,
              ]
            : [],
        free: [],
        blocks: [],
        space,
      })),
    };
    await renderSheet({ availability: async () => ({ ok: true, data: day }) });
    const adm = async () =>
      (await screen.findAllByRole("option", { name: /ADM 2/ }))[0] as HTMLOptionElement;
    expect((await adm()).disabled).toBe(true);
    chooseWeekly();
    expect((await adm()).disabled).toBe(false);
  });
});

describe("BookingSheet: prévia e confirmação da série", () => {
  async function toPreview(props: Partial<BookingSheetProps> = {}) {
    const preview = props.previewRecurring ?? previewMock();
    await renderSheet({ ...props, previewRecurring: preview });
    chooseWeekly();
    fillPurpose();
    fireEvent.click(screen.getByRole("button", { name: "Ver datas" }));
    await screen.findByTestId("series-preview");
    return preview;
  }

  test("'Ver datas' envia a regra e mostra livres antes dos conflitos, com o motivo", async () => {
    const preview = await toPreview();
    expect(preview).toHaveBeenCalledWith({
      data: {
        spaceId: "space-adm",
        date: DATE,
        start: "10:00",
        end: "11:00",
        purpose: "Monitoria",
        rule: { freq: "weekly", interval: 1, weekdays: [1], end: { kind: "count", count: 10 } },
      },
    });
    expect(screen.getByRole("heading", { name: "Confirmar série" })).toBeDefined();
    const box = screen.getByTestId("series-preview");
    expect(within(box).getByText("Toda terça, até 31/12, 4 datas")).toBeDefined();
    const free = within(box).getByRole("region", { name: "Livres (3)" });
    const busy = within(box).getByRole("region", {
      name: "Com conflito (1) — não serão reservadas",
    });
    expect(
      within(free)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["ter., 10/12", "ter., 24/12", "ter., 31/12"]);
    expect(within(busy).getByRole("listitem").textContent).toBe("ter., 17/12MAT1, 10:10–12:00");
    expect(free.compareDocumentPosition(busy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reservar 3 datas" })).toBeDefined();
  });

  test("confirmar envia só as livres e mostra quantas entraram e quantas ficaram de fora", async () => {
    const create = createMock(CREATED);
    const onSeriesSuccess = mock(() => {});
    await toPreview({ createRecurring: create, onSeriesSuccess });
    fireEvent.click(screen.getByRole("button", { name: "Reservar 3 datas" }));
    const done = await screen.findByTestId("series-success-view");
    expect(within(done).getByText("3 datas reservadas")).toBeDefined();
    expect(within(done).getByText("1 data ficou de fora por conflito.")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Série reservada" })).toBeDefined();
    expect(create.mock.calls[0]?.[0].data.confirmed).toEqual([
      "2030-12-10",
      "2030-12-24",
      "2030-12-31",
    ]);
    expect(onSeriesSuccess).toHaveBeenCalledTimes(1);
  });

  test("livres mudaram: continua na prévia com o aviso e a prévia atualizada", async () => {
    const updated: RecurringPreview = {
      ...PREVIEW,
      dates: PREVIEW.dates.map((item) =>
        item.date === "2030-12-24"
          ? { date: item.date, free: false, reason: "Feira, 08:00–18:00" }
          : item,
      ),
    };
    const create = createMock({
      ok: true,
      data: {
        created: false,
        message: "As datas livres mudaram desde a prévia.",
        preview: updated,
      },
    });
    const onSeriesSuccess = mock(() => {});
    await toPreview({ createRecurring: create, onSeriesSuccess });
    fireEvent.click(screen.getByRole("button", { name: "Reservar 3 datas" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "As datas livres mudaram desde a prévia.",
    );
    expect(screen.getByRole("region", { name: "Livres (2)" })).toBeDefined();
    expect(screen.getByText("Feira, 08:00–18:00")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reservar 2 datas" })).toBeDefined();
    expect(onSeriesSuccess).not.toHaveBeenCalled();
  });

  test("nenhuma data livre: aviso e confirmação desabilitada", async () => {
    const allBusy: RecurringPreview = {
      summary: "Toda terça, até 17/12, 2 datas",
      dates: [
        { date: "2030-12-10", free: false, reason: "MAT1, 10:10–12:00" },
        { date: "2030-12-17", free: false, reason: "MAT1, 10:10–12:00" },
      ],
    };
    await toPreview({ previewRecurring: previewMock({ ok: true, data: allBusy }) });
    expect(screen.getByText("Nenhuma data livre; nada será reservado.")).toBeDefined();
    const confirm = screen.getByRole("button", { name: "Reservar 0 datas" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  test("'Voltar' retorna ao formulário mantendo a repetição", async () => {
    await toPreview();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.queryByTestId("series-preview") === null).toBe(true);
    expect(summary()).toBe("Toda terça, até 11/02/2031, 10 datas");
  });

  test("erro de campo do servidor volta ao formulário com a mensagem no campo", async () => {
    const preview = previewMock({
      ok: false,
      status: 400,
      message: "A série pode ter no máximo 120 datas.",
      field: "repeat",
    });
    await renderSheet({ previewRecurring: preview });
    chooseWeekly();
    fillPurpose();
    fireEvent.click(screen.getByRole("button", { name: "Ver datas" }));
    const section = screen.getByTestId("repeat-section");
    expect((await within(section).findByRole("alert")).textContent).toBe(
      "A série pode ter no máximo 120 datas.",
    );
    expect(screen.queryByTestId("series-preview") === null).toBe(true);
  });

  test("série sem título não pede a prévia", async () => {
    const preview = previewMock();
    await renderSheet({ previewRecurring: preview });
    chooseWeekly();
    fireEvent.click(screen.getByRole("button", { name: "Ver datas" }));
    expect(screen.getAllByText("Informe a matéria ou o título").length).toBeGreaterThan(0);
    expect(preview).not.toHaveBeenCalled();
  });

  test("a matéria escolhida na lista é o título da série", async () => {
    const subjectsFn = mock<SubjectsLoad>(async () => ({
      ok: true,
      data: { mine: ["Cálculo — 2B"], all: [] },
    }));
    const preview = previewMock();
    await renderSheet({ previewRecurring: preview, subjectsFn });
    chooseWeekly();
    const field = screen.getByLabelText("Matéria ou título");
    fireEvent.focus(field);
    fireEvent.click(await screen.findByRole("option", { name: "Cálculo — 2B" }));
    expect((field as HTMLInputElement).value).toBe("Cálculo — 2B");
    fireEvent.click(screen.getByRole("button", { name: "Ver datas" }));
    await screen.findByTestId("series-preview");
    expect(preview).toHaveBeenCalledWith({
      data: {
        spaceId: "space-adm",
        date: DATE,
        start: "10:00",
        end: "11:00",
        purpose: "Cálculo — 2B",
        rule: { freq: "weekly", interval: 1, weekdays: [1], end: { kind: "count", count: 10 } },
      },
    });
  });

  test("erro de campo na confirmação também volta ao formulário", async () => {
    const create = createMock({
      ok: false,
      status: 400,
      message: "Não é possível reservar no passado.",
      field: "date",
    });
    await toPreview({ createRecurring: create });
    fireEvent.click(screen.getByRole("button", { name: "Reservar 3 datas" }));
    expect(
      (await screen.findAllByText("Não é possível reservar no passado.")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId("series-preview") === null).toBe(true);
  });
});

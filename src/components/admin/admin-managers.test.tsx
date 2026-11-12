import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useLoaderData,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { Semester } from "#/domain/semester";
import type { Space } from "#/domain/space";
import type { User } from "#/domain/user";
import type { AdminResponse } from "#/server/admin-actions";

type Call = { data: Record<string, unknown> };
let createResponse: AdminResponse<User> = { ok: true, data: {} as User };
let activeResponse: AdminResponse<User> = { ok: true, data: {} as User };
let resetResponse: AdminResponse<null> = { ok: true, data: null };
const calls: string[] = [];
let semesterResponse: AdminResponse<unknown> = { ok: true, data: {} };
const semesterCalls: Array<Record<string, unknown>> = [];
let activateResponse: AdminResponse<User> = { ok: true, data: {} as User };
let mergeResponse: AdminResponse<null> = { ok: true, data: null };
const ghostCalls: Array<Record<string, unknown>> = [];
const CAPACITY_ERROR: AdminResponse<unknown> = {
  ok: false,
  status: 400,
  message: "A capacidade deve ser um número inteiro de 1 a 2000.",
  field: "capacity",
};
let createSpaceResponse: AdminResponse<unknown> = CAPACITY_ERROR;
let updateSpaceResponse: AdminResponse<unknown> = { ok: true, data: {} };
let deleteSpaceResponse: AdminResponse<null> = { ok: true, data: null };
let spaceGate: Promise<void> = Promise.resolve();
const spaceCalls: Array<Record<string, unknown>> = [];

mock.module("#/server/admin", () => ({
  createAccountFn: async (_: Call) => createResponse,
  updateAccountFn: async (_: Call) => ({ ok: true, data: {} }),
  setAccountActiveFn: async (arg: Call) => {
    calls.push(`active:${String(arg.data.id)}`);
    return activeResponse;
  },
  resetAccountPasswordFn: async (arg: Call) => {
    calls.push(`reset:${String(arg.data.id)}`);
    return resetResponse;
  },
  activatePlaceholderAccountFn: async (arg: Call) => {
    ghostCalls.push({ action: "activate", ...arg.data });
    return activateResponse;
  },
  mergePlaceholderAccountFn: async (arg: Call) => {
    ghostCalls.push({ action: "merge", ...arg.data });
    return mergeResponse;
  },
  createSpaceFn: async (arg: Call) => {
    spaceCalls.push({ action: "create", ...arg.data });
    await spaceGate;
    return createSpaceResponse;
  },
  updateSpaceFn: async (arg: Call) => {
    spaceCalls.push({ action: "update", ...arg.data });
    await spaceGate;
    return updateSpaceResponse;
  },
  deleteSpaceFn: async (arg: Call) => {
    spaceCalls.push({ action: "delete", ...arg.data });
    await spaceGate;
    return deleteSpaceResponse;
  },
  createSemesterFn: async (arg: Call) => {
    semesterCalls.push(arg.data);
    return semesterResponse;
  },
  updateSemesterFn: async (arg: Call) => {
    semesterCalls.push(arg.data);
    return semesterResponse;
  },
}));

const { AccountsManager } = await import("./accounts-manager");
const { SpacesLoadError, SpacesManager } = await import("./spaces-manager");
const { SpaceDeleteDialog } = await import("./space-delete-dialog");
const { SpaceFormDialog } = await import("./space-form-dialog");
const { SemesterForm } = await import("#/components/semesters/semester-form");

const me: User = {
  id: "me",
  email: "eu@ifsc.edu.br",
  name: "Eu Admin",
  code: null,
  roles: ["admin"],
  active: true,
  placeholder: false,
};
const other: User = {
  id: "outro",
  email: "outro@ifsc.edu.br",
  name: "Outro Docente",
  code: null,
  roles: ["docente"],
  active: true,
  placeholder: false,
};

const ghost: User = {
  id: "g1",
  email: "zeca.quintal@ifsc.edu.br",
  name: "Zeca Quintal",
  code: "ZQ",
  roles: ["docente"],
  active: true,
  placeholder: true,
};

async function renderManager(users: User[] = [me, other]) {
  const root = createRootRoute({
    component: () => <AccountsManager users={users} currentUserId="me" />,
  });
  const login = createRoute({ getParentRoute: () => root, path: "/entrar", component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([login]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Nova conta" });
  return router;
}

beforeEach(() => {
  calls.length = 0;
  createResponse = { ok: true, data: other };
  activeResponse = { ok: true, data: other };
  resetResponse = { ok: true, data: null };
  activateResponse = { ok: true, data: { ...ghost, placeholder: false } };
  mergeResponse = { ok: true, data: null };
  ghostCalls.length = 0;
  createSpaceResponse = CAPACITY_ERROR;
  updateSpaceResponse = { ok: true, data: {} };
  deleteSpaceResponse = { ok: true, data: null };
  spaceGate = Promise.resolve();
  spaceCalls.length = 0;
});

/** Abre o menu "Mais ações" da linha e devolve o menu. */
async function openRowMenu(name: string): Promise<HTMLElement> {
  fireEvent.pointerDown(screen.getByRole("button", { name: `Mais ações de ${name}` }), {
    button: 0,
    ctrlKey: false,
  });
  return screen.findByRole("menu");
}

/** Abre o menu da linha e escolhe a ação. */
async function chooseAction(name: string, action: string) {
  const menu = await openRowMenu(name);
  fireEvent.click(within(menu).getByRole("menuitem", { name: action }));
}

/** Segura as respostas de espaço até `release()`, para ver estados de andamento. */
function holdSpaceResponses() {
  let release = () => {};
  spaceGate = new Promise((resolve) => {
    release = resolve;
  });
  return () => release();
}

describe("erros de campo acessíveis", () => {
  test("erro de campo é anunciado, ligado ao campo, e o foco vai ao primeiro campo inválido", async () => {
    createResponse = {
      ok: false,
      status: 400,
      message: "Informe um e-mail válido.",
      field: "email",
    };
    await renderManager();
    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "x" } });
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Informe um e-mail válido.");
    await waitFor(() => expect(document.activeElement === email).toBe(true));
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe(alert.id);
  });

  test("erro em papéis leva o foco ao primeiro papel", async () => {
    createResponse = {
      ok: false,
      status: 400,
      message: "Selecione ao menos um papel.",
      field: "roles",
    };
    await renderManager();
    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    const first = screen.getAllByLabelText("Administrador")[0] as HTMLInputElement;
    await waitFor(() => expect(document.activeElement === first).toBe(true));
    expect(first.closest("fieldset")?.getAttribute("aria-describedby")).toBe(alert.id);
  });
});

describe("ações sobre a própria conta", () => {
  test("redefinir a própria senha leva ao login", async () => {
    const router = await renderManager();
    await chooseAction("Eu Admin", "Redefinir senha");
    const field = await screen.findByLabelText(/Nova senha/);
    fireEvent.change(field, { target: { value: "senha-falsa-nova-9" } }); // betterleaks:allow
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(calls).toEqual(["reset:me"]);
  });

  test("desativar a própria conta leva ao login", async () => {
    const router = await renderManager();
    await chooseAction("Eu Admin", "Desativar");
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(calls).toEqual(["active:me"]);
  });

  test("desativar outra conta não sai da página", async () => {
    const router = await renderManager();
    await chooseAction("Outro Docente", "Desativar");
    await waitFor(() => expect(calls).toEqual(["active:outro"]));
    expect(router.state.location.pathname).toBe("/");
  });

  test("redefinir a senha de outra conta não sai da página", async () => {
    const router = await renderManager();
    await chooseAction("Outro Docente", "Redefinir senha");
    const field = await screen.findByLabelText(/Nova senha/);
    fireEvent.change(field, { target: { value: "senha-falsa-nova-9" } }); // betterleaks:allow
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    await waitFor(() => expect(calls).toEqual(["reset:outro"]));
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("contas fantasmas", () => {
  const otherGhost: User = { ...ghost, id: "g2", email: "lua.sol@ifsc.edu.br", name: "Lua Sol" };
  const inactive: User = { ...other, id: "off", email: "off@ifsc.edu.br", active: false };

  test("só a fantasma tem o selo 'Não ativada' e as ações Ativar e Fundir no menu", async () => {
    await renderManager([me, other, ghost]);
    expect(screen.getAllByText("Não ativada")).toHaveLength(1);
    const row = screen.getByText("Zeca Quintal").closest("tr") as HTMLElement;
    expect(within(row).getByText("Não ativada")).toBeTruthy();
    const ghostItems = within(await openRowMenu("Zeca Quintal"))
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(ghostItems).toEqual(["Ativar", "Fundir", "Redefinir senha", "Desativar"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu") === null).toBe(true));
    const otherItems = within(await openRowMenu("Outro Docente"))
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(otherItems).toEqual(["Redefinir senha", "Desativar"]);
  });

  test("filtro de status 'Não ativadas' mostra só as fantasmas", async () => {
    await renderManager([me, other, ghost]);
    expect(screen.getByRole("heading", { name: "Contas (3)" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filtrar por status"), {
      target: { value: "placeholder" },
    });
    expect(screen.getByRole("heading", { name: "Contas (1)" })).toBeTruthy();
    expect(screen.queryByText("Outro Docente")).toBeNull();
    expect(screen.getByText("Zeca Quintal")).toBeTruthy();
  });

  test("Ativar envia e-mail e senha da fantasma (o e-mail presumido vem preenchido)", async () => {
    await renderManager([me, other, ghost]);
    await chooseAction("Zeca Quintal", "Ativar");
    const email = (await screen.findByLabelText("E-mail da pessoa")) as HTMLInputElement;
    expect(email.value).toBe("zeca.quintal@ifsc.edu.br");
    fireEvent.change(email, { target: { value: "zeca@ifsc.edu.br" } });
    const password = screen.getAllByLabelText(/Senha inicial/)[1] as HTMLInputElement;
    fireEvent.change(password, { target: { value: "senha-falsa-nova-9" } }); // betterleaks:allow
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(ghostCalls).toEqual([
        {
          action: "activate",
          id: "g1",
          email: "zeca@ifsc.edu.br",
          password: "senha-falsa-nova-9", // betterleaks:allow
        },
      ]),
    );
    await waitFor(() => expect(screen.queryByLabelText("E-mail da pessoa")).toBeNull());
  });

  test("Ativar com e-mail em uso mostra o erro no campo", async () => {
    activateResponse = {
      ok: false,
      status: 409,
      message: "Este e-mail já está em uso.",
      field: "email",
    };
    await renderManager([me, other, ghost]);
    await chooseAction("Zeca Quintal", "Ativar");
    const email = (await screen.findByLabelText("E-mail da pessoa")) as HTMLInputElement;
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Este e-mail já está em uso.");
    expect(email.getAttribute("aria-describedby")).toBe(alert.id);
  });

  test("Fundir oferece só contas ativadas e ativas e envia a escolhida", async () => {
    await renderManager([me, other, ghost, otherGhost, inactive]);
    await chooseAction("Zeca Quintal", "Fundir");
    const select = (await screen.findByLabelText("Conta que recebe as aulas")) as HTMLElement;
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Escolha uma conta",
      "Eu Admin (eu@ifsc.edu.br)",
      "Outro Docente (outro@ifsc.edu.br)",
    ]);
    fireEvent.change(select, { target: { value: "outro" } });
    fireEvent.submit(select.closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(ghostCalls).toEqual([{ action: "merge", id: "g1", targetId: "outro" }]),
    );
  });

  test("Fundir recusado mostra o motivo", async () => {
    mergeResponse = {
      ok: false,
      status: 409,
      message: "As contas mudaram enquanto a fusão rodava. Recarregue e tente de novo.",
    };
    await renderManager([me, other, ghost]);
    await chooseAction("Zeca Quintal", "Fundir");
    const select = (await screen.findByLabelText("Conta que recebe as aulas")) as HTMLElement;
    fireEvent.change(select, { target: { value: "outro" } });
    fireEvent.submit(select.closest("form") as HTMLFormElement);
    expect((await screen.findByRole("alert")).textContent).toMatch(/As contas mudaram/);
  });
});

describe("consulta de contas", () => {
  const horarios: User = {
    ...other,
    id: "horarios",
    name: "María Soares",
    email: "maria.soares@ifsc.edu.br",
    code: "MS",
    roles: ["horarios"],
  };
  const maintenance: User = {
    ...other,
    id: "maintenance",
    name: "Pessoa Inativa",
    email: "inativa@ifsc.edu.br",
    code: "PI",
    active: false,
    roles: ["manutencao"],
  };

  test("busca por nome sem acento, e-mail e sigla e mostra a contagem filtrada", async () => {
    await renderManager([me, other, ghost, horarios]);
    const search = screen.getByRole("searchbox", { name: "Buscar por nome, e-mail ou sigla" });

    fireEvent.change(search, { target: { value: "maria" } });
    expect(screen.getByText("María Soares")).toBeTruthy();
    expect(screen.queryByText("Outro Docente")).toBeNull();
    expect(screen.getByText("Exibindo 1 de 4 contas")).toBeTruthy();

    fireEvent.change(search, { target: { value: "zeca.quintal@" } });
    expect(screen.getByText("Zeca Quintal")).toBeTruthy();
    expect(screen.queryByText("María Soares")).toBeNull();

    fireEvent.change(search, { target: { value: "zq" } });
    expect(screen.getByText("Zeca Quintal")).toBeTruthy();
    expect(screen.queryByText("Outro Docente")).toBeNull();
  });

  test("combina filtros de papel e status sem perder as ações da conta", async () => {
    await renderManager([me, other, ghost, maintenance]);
    fireEvent.change(screen.getByLabelText("Filtrar por papel"), {
      target: { value: "manutencao" },
    });
    fireEvent.change(screen.getByLabelText("Filtrar por status"), {
      target: { value: "inactive" },
    });

    expect(screen.getByRole("heading", { name: "Contas (1)" })).toBeTruthy();
    expect(screen.getByText("Pessoa Inativa")).toBeTruthy();
    expect(screen.queryByText("Outro Docente")).toBeNull();
    const items = within(await openRowMenu("Pessoa Inativa")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Redefinir senha", "Reativar"]);
  });

  test("mostra estado vazio e oferece limpar os filtros", async () => {
    await renderManager([me, other]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar por nome, e-mail ou sigla" }), {
      target: { value: "sem resultado" },
    });

    expect(screen.getByText("Nenhuma conta encontrada.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByRole("heading", { name: "Contas (2)" })).toBeTruthy();
    expect(screen.getByText("Outro Docente")).toBeTruthy();
  });
});

describe("tabela de contas", () => {
  const sigla: User = {
    ...other,
    id: "sg",
    name: "Ana Silva",
    email: "ana@ifsc.edu.br",
    code: "AS",
  };

  test("é uma tabela com as colunas pedidas e uma linha por conta", async () => {
    await renderManager([me, other, ghost]);
    const table = screen.getByRole("table", { name: "Contas" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Nome", "E-mail", "Sigla", "Papéis", "Status", "Ações"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const cells = within(rows[2] as HTMLElement)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(0, 5)).toEqual([
      "Zeca Quintal",
      "zeca.quintal@ifsc.edu.br",
      "Sigla ZQ",
      "Docente",
      "Não ativada",
    ]);
    expect(within(rows[0] as HTMLElement).getAllByRole("cell")[4]?.textContent).toBe("Ativa");
    expect(screen.getByText("Exibindo 3 de 3 contas")).toBeTruthy();
  });

  test("conta inativa mostra o selo 'Inativa'", async () => {
    await renderManager([me, { ...other, active: false }]);
    expect(screen.getByText("Inativa")).toBeTruthy();
  });

  test("os botões de ação são ícones com nome acessível da conta", async () => {
    await renderManager([me, other]);
    const pencil = screen.getByRole("button", { name: "Editar Outro Docente" });
    expect(pencil.getAttribute("title")).toBe("Editar");
    expect(pencil.textContent).toBe("");
    const more = screen.getByRole("button", { name: "Mais ações de Outro Docente" });
    expect(more.textContent).toBe("");
  });

  test("o lápis abre a edição num diálogo; salvar fecha e devolve o foco ao lápis", async () => {
    await renderManager([me, other]);
    const pencil = screen.getByRole("button", { name: "Editar Outro Docente" });
    pencil.focus();
    fireEvent.click(pencil);
    const dialog = await screen.findByRole("dialog", { name: "Editar conta" });
    const name = within(dialog).getByLabelText("Nome") as HTMLInputElement;
    expect(name.value).toBe("Outro Docente");
    await waitFor(() => expect(document.activeElement === name).toBe(true));
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    await waitFor(() => expect(document.activeElement === pencil).toBe(true));
  });

  test("Cancelar fecha a edição e devolve o foco ao lápis", async () => {
    await renderManager([me, other]);
    const pencil = screen.getByRole("button", { name: "Editar Outro Docente" });
    fireEvent.click(pencil);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    await waitFor(() => expect(document.activeElement === pencil).toBe(true));
  });

  test("ação do menu abre o formulário correspondente num diálogo", async () => {
    await renderManager([me, other]);
    await chooseAction("Outro Docente", "Redefinir senha");
    const dialog = await screen.findByRole("dialog", { name: "Redefinir senha" });
    expect(within(dialog).getByLabelText(/Nova senha/)).toBeTruthy();
  });

  test("clicar em 'Nome' ordena crescente e depois decrescente", async () => {
    await renderManager([other, me, sigla]);
    const names = () =>
      within(screen.getByRole("table", { name: "Contas" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(names()).toEqual(["Outro Docente", "Eu Admin", "Ana Silva"]);
    const sort = () =>
      within(screen.getByRole("columnheader", { name: /Nome/ })).getByRole("button");
    fireEvent.click(sort());
    expect(names()).toEqual(["Ana Silva", "Eu Admin", "Outro Docente"]);
    fireEvent.click(sort());
    expect(names()).toEqual(["Outro Docente", "Eu Admin", "Ana Silva"]);
  });

  test("falha ao desativar é anunciada acima da tabela", async () => {
    activeResponse = {
      ok: false,
      status: 409,
      message: "Não é possível desativar a última conta.",
    };
    await renderManager([me, other]);
    await chooseAction("Eu Admin", "Desativar");
    expect((await screen.findByRole("alert")).textContent).toMatch(/última conta/);
  });
});

describe("SpacesManager", () => {
  const spaces: Space[] = [
    { id: "b101", name: "B-101", capacity: null },
    { id: "aud", name: "Auditório", capacity: 200 },
    { id: "a202", name: "A-202", capacity: 40 },
    { id: "a105", name: "A-105", capacity: null },
    { id: "a110", name: "A-110", capacity: null },
  ];

  /** O loader da rota de teste lê `served` e conta as cargas, como a rota real recarrega a lista. */
  let served: Space[] = [];
  let loads = 0;

  async function renderSpaces(list: Space[]) {
    served = list;
    loads = 0;
    const root = createRootRoute({
      loader: () => {
        loads += 1;
        return served;
      },
      component: () => <SpacesManager spaces={useLoaderData({ strict: false }) as Space[]} />,
    });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("button", { name: "Novo espaço" });
  }

  const spaceRows = () =>
    screen.getAllByRole("row").filter((row) => within(row).queryAllByRole("cell").length > 0);
  const names = () => spaceRows().map((row) => within(row).getAllByRole("cell")[0]?.textContent);

  test("agrupa por bloco, com uma tabela por bloco, o andar em coluna e 'Outros espaços' por último", async () => {
    await renderSpaces(spaces);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Bloco A",
      "Bloco B",
      "Outros espaços",
    ]);
    const blockA = screen.getByRole("region", { name: "Bloco A" });
    expect(
      within(within(blockA).getByRole("table", { name: "Espaços do Bloco A" }))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[1]?.textContent),
    ).toEqual(["Andar 1", "Andar 1", "Andar 2"]);
    expect(names()).toEqual(["A-105", "A-110", "A-202", "B-101", "Auditório"]);
    expect(
      within(screen.getByRole("region", { name: "Outros espaços" })).getAllByRole("cell")[1]
        ?.textContent,
    ).toBe("Sem andar identificado");
    expect(screen.getByText("5 de 5 espaços")).toBeTruthy();
  });

  test("busca filtra e conta; sem resultado oferece 'Limpar busca'", async () => {
    await renderSpaces(spaces);
    const search = screen.getByRole("searchbox", { name: "Buscar espaço" });
    fireEvent.change(search, { target: { value: "a202" } });
    expect(screen.getByText("1 de 5 espaços")).toBeTruthy();
    expect(names()).toEqual(["A-202"]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhum espaço encontrado.")).toBeTruthy();
    expect(screen.getByText("0 de 5 espaços")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(names()).toHaveLength(5);
  });

  test("sem espaços, 'Cadastrar espaço' abre o diálogo de novo espaço", async () => {
    await renderSpaces([]);
    expect(screen.getByText("Nenhum espaço cadastrado.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar espaço" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Novo espaço" })).toBeTruthy();
  });

  test("Editar abre o diálogo com o espaço; salvar fecha, recarrega a lista e anuncia 'Espaço salvo.'", async () => {
    await renderSpaces(spaces);
    expect(loads).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Editar A-202" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("A-202");
    served = spaces.map((space) => (space.id === "a202" ? { ...space, name: "A-203" } : space));
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Espaço salvo."));
    expect(loads).toBe(2);
    expect(names()).toEqual(["A-105", "A-110", "A-203", "B-101", "Auditório"]);
    expect(screen.queryByRole("dialog") === null).toBe(true);
    expect(spaceCalls).toMatchObject([{ action: "update", id: "a202" }]);
  });

  test("excluir recarrega a lista e anuncia 'Espaço excluído.'", async () => {
    await renderSpaces(spaces);
    await chooseAction("B-101", "Excluir");
    served = spaces.filter((space) => space.id !== "b101");
    fireEvent.click(await screen.findByRole("button", { name: "Excluir espaço" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Espaço excluído."));
    expect(loads).toBe(2);
    expect(names()).toEqual(["A-105", "A-110", "A-202", "Auditório"]);
    expect(screen.getByText("4 de 4 espaços")).toBeTruthy();
    expect(spaceCalls).toEqual([{ action: "delete", id: "b101" }]);
  });

  test("erro de carga oferece 'Tentar de novo'", () => {
    let retries = 0;
    render(
      <SpacesLoadError
        onRetry={() => {
          retries += 1;
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Não foi possível carregar os espaços\./);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(retries).toBe(1);
  });

  test("erro de capacidade é anunciado, ligado ao campo e recebe o foco", async () => {
    await renderSpaces([]);
    fireEvent.click(screen.getByRole("button", { name: "Novo espaço" }));
    const name = (await screen.findByLabelText("Nome")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Lab" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    const capacity = screen.getByLabelText("Capacidade (opcional)");
    await waitFor(() => expect(document.activeElement === capacity).toBe(true));
    expect(capacity.getAttribute("aria-invalid")).toBe("true");
    expect(capacity.getAttribute("aria-describedby")).toBe(alert.id);
  });
});

describe("tabela de espaços", () => {
  const informed: Space = {
    id: "a202",
    name: "A-202",
    capacity: 40,
    equipment: {
      items: { projetor: 1, computadores: 12, som: 0 },
      notes: "Lousa digital\nTV",
      computersInMaintenance: 2,
    },
  };
  const bare: Space = { id: "b1", name: "Auditório", capacity: null };

  async function renderTable(list: Space[]) {
    const root = createRootRoute({ component: () => <SpacesManager spaces={list} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("button", { name: "Novo espaço" });
  }

  test("tem as colunas pedidas, com cabeçalhos de coluna", async () => {
    await renderTable([informed]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Nome da sala",
      "Andar",
      "Capacidade",
      "Equipamentos",
      "Computadores em manutenção",
      "Observações",
      "Ações",
    ]);
  });

  test("mostra capacidade, um rótulo por equipamento, computadores em manutenção e observações", async () => {
    await renderTable([informed]);
    const row = screen.getByText("A-202").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    expect(cells[2]?.textContent).toBe("40 lugares");
    const marks = within(cells[3] as HTMLElement).getByRole("group", { name: "Equipamentos" });
    expect(marks.textContent).toBe("Projetor12 computadoresSem aparelho de som");
    expect(cells[4]?.textContent).toContain("2");
    const notes = within(cells[5] as HTMLElement).getByText(/Lousa digital/);
    expect(notes.getAttribute("title")).toBe("Lousa digital\nTV");
    expect(notes.classList.contains("md:truncate")).toBe(true);
  });

  test("sem dados: capacidade e equipamentos não informados, sem manutenção nem observações", async () => {
    await renderTable([bare]);
    const row = screen.getByText("Auditório").closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    expect(cells[2]?.textContent).toBe("Capacidade não informada");
    const marks = within(cells[3] as HTMLElement).getByRole("group", { name: "Equipamentos" });
    expect(marks.textContent).toBe(
      "Projetor não informadoComputadores não informadosAparelho de som não informado",
    );
    expect(within(cells[4] as HTMLElement).queryByText(/computador/) === null).toBe(true);
    expect(cells[5]?.textContent).toBe("—");
  });

  test("nome longo sem espaço pode quebrar em qualquer ponto", async () => {
    const long = `Sala-${"x".repeat(120)}`;
    await renderTable([{ id: "l1", name: long, capacity: null }]);
    expect(screen.getByText(long).classList.contains("wrap-anywhere")).toBe(true);
  });

  test("o lápis é um ícone 'Editar NOME' e o menu traz Excluir", async () => {
    await renderTable([informed]);
    const pencil = screen.getByRole("button", { name: "Editar A-202" });
    expect(pencil.getAttribute("title")).toBe("Editar");
    const items = within(await openRowMenu("A-202")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Excluir"]);
  });

  test("o lápis abre o diálogo de edição e Cancelar devolve o foco ao lápis", async () => {
    await renderTable([informed]);
    const pencil = screen.getByRole("button", { name: "Editar A-202" });
    fireEvent.click(pencil);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    await waitFor(() => expect(document.activeElement === pencil).toBe(true));
  });
});

describe("SpaceDeleteDialog", () => {
  const space: Space = { id: "a202", name: "A-202", capacity: 40 };

  function renderDialog(target: Space | null = space) {
    const deleted: string[] = [];
    const closed: string[] = [];
    render(
      <SpaceDeleteDialog
        space={target}
        onClose={() => closed.push("fechou")}
        onDeleted={() => deleted.push(space.id)}
      />,
    );
    return { deleted, closed };
  }

  test("fechado, não monta a confirmação", () => {
    renderDialog(null);
    expect(screen.queryByRole("alertdialog") === null).toBe(true);
  });

  test("pergunta antes; Cancelar fecha sem chamar o servidor", async () => {
    const { closed } = renderDialog();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Excluir A-202?")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Excluir espaço" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(closed).toEqual(["fechou"]);
    expect(spaceCalls).toEqual([]);
  });

  test("título com nome longo sem espaço pode quebrar em qualquer ponto", async () => {
    renderDialog({ ...space, name: `Sala-${"x".repeat(120)}` });
    const title = within(await screen.findByRole("alertdialog")).getByRole("heading");
    expect(title.classList.contains("wrap-anywhere")).toBe(true);
  });

  test("confirmar envia o id, mostra 'Excluindo…' e avisa ao concluir", async () => {
    const release = holdSpaceResponses();
    const { deleted } = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir espaço" }));
    const pending = await screen.findByRole("button", { name: "Excluindo…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(spaceCalls).toEqual([{ action: "delete", id: "a202" }]);
    release();
    await waitFor(() => expect(deleted).toEqual(["a202"]));
  });

  test("recusa aparece dentro da confirmação, que continua aberta", async () => {
    deleteSpaceResponse = {
      ok: false,
      status: 409,
      message: "Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído.",
    };
    const { deleted } = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Excluir espaço" }));
    const alert = await within(screen.getByRole("alertdialog")).findByRole("alert");
    expect(alert.textContent).toMatch(/não pode ser excluído/);
    expect(deleted).toEqual([]);
  });
});

/** Abre o diálogo por um botão, como o gerenciador faz; fechar volta a `undefined`. */
function SpaceDialogHarness({ space }: { space: Space | null }) {
  const [open, setOpen] = useState<Space | null | undefined>(undefined);
  const [saved, setSaved] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(space)}>
        Abrir
      </button>
      <p>Salvos: {saved}</p>
      <SpaceFormDialog
        space={open}
        onClose={() => setOpen(undefined)}
        onSaved={() => {
          setSaved((count) => count + 1);
          setOpen(undefined);
        }}
      />
    </>
  );
}

describe("SpaceFormDialog", () => {
  const a202: Space = {
    id: "a202",
    name: "A-202",
    capacity: 40,
    equipment: { items: { projetor: 1, computadores: 0 }, notes: "Lousa digital" },
  };

  async function open(space: Space | null) {
    render(<SpaceDialogHarness space={space} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    return screen.findByRole("dialog");
  }

  const checked = (dialog: HTMLElement, group: string) =>
    within(within(dialog).getByRole("group", { name: group }))
      .getAllByRole("radio")
      .filter((radio) => (radio as HTMLInputElement).checked)
      .map((radio) => radio.closest("label")?.textContent);

  test("novo espaço abre vazio, com 'Não informado' e foco no nome", async () => {
    const dialog = await open(null);
    expect(within(dialog).getByRole("heading", { name: "Novo espaço" })).toBeTruthy();
    const name = within(dialog).getByLabelText("Nome") as HTMLInputElement;
    expect(name.value).toBe("");
    expect((within(dialog).getByLabelText("Capacidade (opcional)") as HTMLInputElement).value).toBe(
      "",
    );
    expect(checked(dialog, "Projetor")).toEqual(["Não informado"]);
    expect(checked(dialog, "Aparelho de som")).toEqual(["Não informado"]);
    expect(
      (within(dialog).getByLabelText("Computadores (quantidade)") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (within(dialog).getByLabelText("Observações (opcional)") as HTMLTextAreaElement).value,
    ).toBe("");
    await waitFor(() => expect(document.activeElement === name).toBe(true));
  });

  test("editar abre preenchido com os dados gravados", async () => {
    const dialog = await open(a202);
    expect(within(dialog).getByRole("heading", { name: "Editar espaço" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("A-202");
    expect((within(dialog).getByLabelText("Capacidade (opcional)") as HTMLInputElement).value).toBe(
      "40",
    );
    expect(checked(dialog, "Projetor")).toEqual(["Sim"]);
    expect(checked(dialog, "Aparelho de som")).toEqual(["Não informado"]);
    expect(
      (within(dialog).getByLabelText("Computadores (quantidade)") as HTMLInputElement).value,
    ).toBe("0");
    expect(
      (within(dialog).getByLabelText("Observações (opcional)") as HTMLTextAreaElement).value,
    ).toBe("Lousa digital");
  });

  test("tem o campo de computadores em manutenção e a dica de observações", async () => {
    const dialog = await open(null);
    expect(
      (within(dialog).getByLabelText("Computadores em manutenção") as HTMLInputElement).value,
    ).toBe("");
    expect(within(dialog).getByText("Visível para qualquer pessoa na consulta.")).toBeTruthy();
  });

  test("criar envia o formato do fio e fecha ao salvar", async () => {
    createSpaceResponse = { ok: true, data: {} };
    const dialog = await open(null);
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Lab" } });
    fireEvent.change(within(dialog).getByLabelText("Capacidade (opcional)"), {
      target: { value: "30" },
    });
    fireEvent.click(
      within(within(dialog).getByRole("group", { name: "Aparelho de som" })).getByLabelText("Não"),
    );
    fireEvent.change(within(dialog).getByLabelText("Computadores (quantidade)"), {
      target: { value: " 12 " },
    });
    fireEvent.change(within(dialog).getByLabelText("Observações (opcional)"), {
      target: { value: "Lousa\nTV" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await screen.findByText("Salvos: 1");
    expect(spaceCalls).toEqual([
      {
        action: "create",
        name: "Lab",
        capacity: "30",
        equipment: { projetor: null, computadores: " 12 ", som: 0 },
        computersInMaintenance: null,
        notes: "Lousa\nTV",
      },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  });

  test("editar envia o id e mostra 'Salvando…' enquanto grava", async () => {
    const release = holdSpaceResponses();
    const dialog = await open(a202);
    fireEvent.click(
      within(within(dialog).getByRole("group", { name: "Projetor" })).getByLabelText("Não"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    const pending = await within(dialog).findByRole("button", { name: "Salvando…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(spaceCalls).toEqual([
      {
        action: "update",
        id: "a202",
        name: "A-202",
        capacity: "40",
        equipment: { projetor: 0, computadores: "0", som: null },
        computersInMaintenance: null,
        notes: "Lousa digital",
      },
    ]);
    release();
    await screen.findByText("Salvos: 1");
  });

  test("erro de computadores fica no campo, com foco, e o diálogo mantém o que foi digitado", async () => {
    createSpaceResponse = {
      ok: false,
      status: 400,
      message: "A quantidade de computadores deve ser um número inteiro de 0 a 999.",
      field: "computadores",
    };
    const dialog = await open(null);
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Lab" } });
    const count = within(dialog).getByLabelText("Computadores (quantidade)") as HTMLInputElement;
    fireEvent.change(count, { target: { value: "1000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/0 a 999/);
    await waitFor(() => expect(document.activeElement === count).toBe(true));
    expect(count.getAttribute("aria-invalid")).toBe("true");
    expect(count.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    expect(count.value).toBe("1000");
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("Lab");
    expect(screen.getByText("Salvos: 0")).toBeTruthy();

    const save = within(dialog).getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    createSpaceResponse = { ok: true, data: {} };
    fireEvent.change(count, { target: { value: "10" } });
    fireEvent.click(save);
    await screen.findByText("Salvos: 1");
    expect(
      spaceCalls.map((call) => (call.equipment as Record<string, unknown>).computadores),
    ).toEqual(["1000", "10"]);
  });

  test("erro de projetor leva o foco à primeira opção e liga a mensagem ao grupo", async () => {
    updateSpaceResponse = {
      ok: false,
      status: 400,
      message: "Escolha sim, não ou não informado.",
      field: "projetor",
    };
    const dialog = await open(a202);
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    const alert = await within(dialog).findByRole("alert");
    const group = within(dialog).getByRole("group", { name: "Projetor" });
    const first = within(group).getByLabelText("Sim");
    await waitFor(() => expect(document.activeElement === first).toBe(true));
    expect(group.getAttribute("aria-describedby")).toBe(alert.id);
  });

  test("erro sem campo aparece no topo do diálogo, que continua aberto", async () => {
    createSpaceResponse = { ok: false, status: 403, message: "Sem permissão para esta ação." };
    const dialog = await open(null);
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Lab" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "Sem permissão para esta ação.",
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  test("cancelar ou fechar descarta o que não foi salvo", async () => {
    let dialog = await open(a202);
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Outro" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("A-202");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Outro" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Nome") as HTMLInputElement).value).toBe("A-202");
    expect(spaceCalls).toEqual([]);
  });
});

describe("SemesterForm", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  function renderForm(semester: Semester | null = null) {
    const root = createRootRoute({ component: () => <SemesterForm semester={semester} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
  }

  function mockPreview(body: unknown) {
    globalThis.fetch = (async () => Response.json(body)) as unknown as typeof fetch;
  }

  test("erro de data é anunciado, ligado ao campo e recebe o foco", async () => {
    semesterCalls.length = 0;
    semesterResponse = {
      ok: false,
      status: 400,
      message: "Data de início inválida.",
      field: "start",
    };
    renderForm();
    const name = (await screen.findByLabelText("Nome")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "2026.2" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    const start = screen.getAllByLabelText("Início")[0] as HTMLInputElement;
    await waitFor(() => expect(document.activeElement === start).toBe(true));
    expect(start.getAttribute("aria-invalid")).toBe("true");
    expect(start.getAttribute("aria-describedby")).toBe(alert.id);
    expect(semesterCalls[0]).toMatchObject({ name: "2026.2", terms: expect.any(Array) });
  });

  test("editar o início limpa o erro de validação anterior desse campo", async () => {
    semesterResponse = {
      ok: false,
      status: 400,
      message: "Data de início inválida.",
      field: "start",
    };
    renderForm();
    const name = (await screen.findByLabelText("Nome")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "2026.2" } });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    await screen.findByText("Data de início inválida.");

    const start = screen.getAllByLabelText("Início")[0] as HTMLInputElement;
    fireEvent.click(start);
    fireEvent.click(await screen.findByText("15", { selector: "button" }));

    await waitFor(() => {
      expect(screen.queryByText("Data de início inválida.")).toBeNull();
      expect(start.getAttribute("aria-invalid")).not.toBe("true");
    });
  });

  test("erro em campo de bloco leva o foco ao campo do bloco certo", async () => {
    semesterResponse = {
      ok: false,
      status: 400,
      message: "A hora de fim deve ser posterior à de início.",
      field: "block-0-end",
    };
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar bloco" }));
    const name = screen.getByLabelText("Nome", { selector: "input[maxlength='40']" });
    fireEvent.submit(name.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    const ends = screen.getAllByLabelText("Fim");
    const blockEnd = ends[ends.length - 1] as HTMLInputElement;
    await waitFor(() => expect(document.activeElement === blockEnd).toBe(true));
    expect(blockEnd.getAttribute("aria-describedby")).toBe(alert.id);
  });

  test("usar blocos do XML preenche o formulário sem salvar", async () => {
    semesterCalls.length = 0;
    mockPreview({
      ok: true,
      preview: {
        periods: [
          { number: 5, name: "Noite 12", short: "N12", start: "18:00", end: "19:50" },
          { number: 6, name: "Noite 34", short: "N34", start: "20:10", end: "22:00" },
        ],
      },
    });
    renderForm();
    const file = (await screen.findByLabelText(/Usar blocos do XML/)) as HTMLInputElement;
    fireEvent.change(file, {
      target: { files: [new File(["<xml/>"], "horario.xml", { type: "text/xml" })] },
    });
    await screen.findByText(/2 blocos carregados/);
    expect(screen.getByDisplayValue("Noite 12")).toBeDefined();
    expect(screen.getByDisplayValue("N34")).toBeDefined();
    expect(semesterCalls).toEqual([]);
  });

  test("falhas ao ler o XML são anunciadas", async () => {
    renderForm();
    const file = (await screen.findByLabelText(/Usar blocos do XML/)) as HTMLInputElement;
    const send = () =>
      fireEvent.change(file, {
        target: { files: [new File(["x"], "a.xml", { type: "text/xml" })] },
      });

    mockPreview({ ok: false, message: "Arquivo inválido." });
    send();
    expect((await screen.findByRole("alert")).textContent).toBe("Arquivo inválido.");

    mockPreview({ ok: true, preview: { periods: [] } });
    send();
    await screen.findByText(/não tem blocos/);

    globalThis.fetch = (async () => {
      throw new Error("rede");
    }) as unknown as typeof fetch;
    send();
    await screen.findByText(/Não foi possível ler o arquivo/);
  });

  test("edição envia o id, mostra o semestre salvo e remove blocos", async () => {
    semesterCalls.length = 0;
    const semester: Semester = {
      id: "sem-1",
      name: "2026.1",
      start: "2026-02-02",
      end: "2026-06-30",
      terms: [{ position: 2, start: "2026-03-01", end: "2026-04-01" }],
      blocks: [{ number: 1, name: "Manhã", short: "M", start: "08:00", end: "09:50" }],
    };
    semesterResponse = { ok: true, data: semester };
    renderForm(semester);
    const save = await screen.findByRole("button", { name: "Salvar" });
    expect(screen.getByDisplayValue("Manhã")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Remover bloco 1" }));
    expect(screen.queryByDisplayValue("Manhã")).toBeNull();
    fireEvent.submit(save.closest("form") as HTMLFormElement);
    await screen.findByText("Semestre salvo.");
    expect(semesterCalls[0]).toMatchObject({ id: "sem-1", name: "2026.1", blocks: [] });
  });
});

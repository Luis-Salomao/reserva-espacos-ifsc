import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
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
const { SpacesManager } = await import("./spaces-manager");
const { SpaceCard } = await import("./space-card");
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
    fireEvent.click(screen.getAllByRole("button", { name: "Redefinir senha" })[0] as HTMLElement);
    const field = await screen.findByLabelText(/Nova senha/);
    fireEvent.change(field, { target: { value: "senha-falsa-nova-9" } }); // betterleaks:allow
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(calls).toEqual(["reset:me"]);
  });

  test("desativar a própria conta leva ao login", async () => {
    const router = await renderManager();
    fireEvent.click(screen.getAllByRole("button", { name: "Desativar" })[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(calls).toEqual(["active:me"]);
  });

  test("desativar outra conta não sai da página", async () => {
    const router = await renderManager();
    fireEvent.click(screen.getAllByRole("button", { name: "Desativar" })[1] as HTMLElement);
    await waitFor(() => expect(calls).toEqual(["active:outro"]));
    expect(router.state.location.pathname).toBe("/");
  });

  test("redefinir a senha de outra conta não sai da página", async () => {
    const router = await renderManager();
    fireEvent.click(screen.getAllByRole("button", { name: "Redefinir senha" })[1] as HTMLElement);
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

  test("só a fantasma tem o selo 'Não ativada' e os botões Ativar e Fundir", async () => {
    await renderManager([me, other, ghost]);
    expect(screen.getAllByText("Não ativada")).toHaveLength(1);
    const card = screen.getByText("Zeca Quintal").closest("li") as HTMLElement;
    expect(within(card).getByText("Não ativada")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Ativar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Fundir" })).toHaveLength(1);
  });

  test("filtro 'Só não ativadas' mostra só as fantasmas", async () => {
    await renderManager([me, other, ghost]);
    expect(screen.getByRole("heading", { name: "Contas (3)" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Só não ativadas"));
    expect(screen.getByRole("heading", { name: "Contas (1)" })).toBeTruthy();
    expect(screen.queryByText("Outro Docente")).toBeNull();
    expect(screen.getByText("Zeca Quintal")).toBeTruthy();
  });

  test("Ativar envia e-mail e senha da fantasma (o e-mail presumido vem preenchido)", async () => {
    await renderManager([me, other, ghost]);
    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Ativar" }));
    const email = (await screen.findByLabelText("E-mail da pessoa")) as HTMLInputElement;
    fireEvent.submit(email.closest("form") as HTMLFormElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Este e-mail já está em uso.");
    expect(email.getAttribute("aria-describedby")).toBe(alert.id);
  });

  test("Fundir oferece só contas ativadas e ativas e envia a escolhida", async () => {
    await renderManager([me, other, ghost, otherGhost, inactive]);
    fireEvent.click(screen.getAllByRole("button", { name: "Fundir" })[0] as HTMLElement);
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
    fireEvent.click(screen.getByRole("button", { name: "Fundir" }));
    const select = (await screen.findByLabelText("Conta que recebe as aulas")) as HTMLElement;
    fireEvent.change(select, { target: { value: "outro" } });
    fireEvent.submit(select.closest("form") as HTMLFormElement);
    expect((await screen.findByRole("alert")).textContent).toMatch(/As contas mudaram/);
  });
});

describe("SpacesManager", () => {
  test("erro de capacidade é anunciado, ligado ao campo e recebe o foco", async () => {
    const root = createRootRoute({ component: () => <SpacesManager spaces={[]} /> });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
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

describe("SpaceCard", () => {
  const informed: Space = {
    id: "a202",
    name: "A-202",
    capacity: 40,
    equipment: { items: { projetor: 1, computadores: 1, som: 0 }, notes: "Lousa digital\nTV" },
  };

  function renderCard(space: Space) {
    const edits: string[] = [];
    const deleted: string[] = [];
    render(
      <ul>
        <SpaceCard
          space={space}
          onEdit={() => edits.push(space.id)}
          onDeleted={() => deleted.push(space.id)}
        />
      </ul>,
    );
    return { edits, deleted };
  }

  test("mostra capacidade, um rótulo por equipamento e as observações", () => {
    renderCard(informed);
    expect(screen.getByText("40 lugares")).toBeTruthy();
    const tags = within(screen.getByRole("list", { name: "Equipamentos" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(tags).toEqual(["Projetor", "1 computador", "Sem aparelho de som"]);
    expect(screen.getByText(/Lousa digital/).textContent).toBe("Observações: Lousa digital\nTV");
  });

  test("sem dados mostra capacidade e equipamentos não informados e nenhuma observação", () => {
    renderCard({ id: "b1", name: "Auditório", capacity: null });
    expect(screen.getByText("Capacidade não informada")).toBeTruthy();
    const tags = within(screen.getByRole("list", { name: "Equipamentos" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(tags).toEqual([
      "Projetor não informado",
      "Computadores não informados",
      "Aparelho de som não informado",
    ]);
    expect(screen.queryByText(/Observações/) === null).toBe(true);
  });

  test("Editar avisa o gerenciador", () => {
    const { edits } = renderCard(informed);
    fireEvent.click(screen.getByRole("button", { name: "Editar A-202" }));
    expect(edits).toEqual(["a202"]);
  });

  test("Excluir só abre a confirmação; Cancelar fecha sem chamar o servidor", async () => {
    renderCard(informed);
    fireEvent.click(screen.getByRole("button", { name: "Excluir A-202" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Excluir A-202?")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Excluir espaço" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog") === null).toBe(true));
    expect(spaceCalls).toEqual([]);
  });

  test("confirmar envia o id, mostra 'Excluindo…' e avisa ao concluir", async () => {
    const release = holdSpaceResponses();
    const { deleted } = renderCard(informed);
    fireEvent.click(screen.getByRole("button", { name: "Excluir A-202" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir espaço" }));
    const pending = await screen.findByRole("button", { name: "Excluindo…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    expect(spaceCalls).toEqual([{ action: "delete", id: "a202" }]);
    release();
    await waitFor(() => expect(deleted).toEqual(["a202"]));
    await waitFor(() => expect(screen.queryByRole("alertdialog") === null).toBe(true));
  });

  test("recusa aparece dentro da confirmação, que continua aberta", async () => {
    deleteSpaceResponse = {
      ok: false,
      status: 409,
      message: "Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído.",
    };
    const { deleted } = renderCard(informed);
    fireEvent.click(screen.getByRole("button", { name: "Excluir A-202" }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir espaço" }));
    const dialog = screen.getByRole("alertdialog");
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/não pode ser excluído/);
    expect(deleted).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog") === null).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Excluir A-202" }));
    await screen.findByRole("alertdialog");
    expect(screen.queryByRole("alert") === null).toBe(true);
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

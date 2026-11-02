import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { User } from "#/domain/user";
import type { AdminResponse } from "#/server/admin-actions";

type Call = { data: Record<string, unknown> };
let createResponse: AdminResponse<User> = { ok: true, data: {} as User };
let activeResponse: AdminResponse<User> = { ok: true, data: {} as User };
let resetResponse: AdminResponse<null> = { ok: true, data: null };
const calls: string[] = [];

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
  createSpaceFn: async () => ({
    ok: false,
    status: 400,
    message: "A capacidade deve ser um número inteiro de 1 a 2000.",
    field: "capacity",
  }),
  updateSpaceFn: async () => ({ ok: true, data: {} }),
}));

const { AccountsManager } = await import("./accounts-manager");
const { SpacesManager } = await import("./spaces-manager");

const me: User = {
  id: "me",
  email: "eu@ifsc.edu.br",
  name: "Eu Admin",
  code: null,
  roles: ["admin"],
  active: true,
};
const other: User = {
  id: "outro",
  email: "outro@ifsc.edu.br",
  name: "Outro Docente",
  code: null,
  roles: ["docente"],
  active: true,
};

async function renderManager() {
  const root = createRootRoute({
    component: () => <AccountsManager users={[me, other]} currentUserId="me" />,
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
});

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
    await waitFor(() => expect(document.activeElement).toBe(email));
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
    await waitFor(() => expect(document.activeElement).toBe(first));
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
    await waitFor(() => expect(document.activeElement).toBe(capacity));
    expect(capacity.getAttribute("aria-invalid")).toBe("true");
    expect(capacity.getAttribute("aria-describedby")).toBe(alert.id);
  });
});

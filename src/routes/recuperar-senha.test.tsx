import { expect, mock, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecoveryForm } from "#/routes/recuperar-senha";
import { ResetPasswordForm } from "#/routes/redefinir-senha";

async function page(component: () => React.ReactNode) {
  cleanup();
  const root = createRootRoute({ component });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([home]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
}

test("modo desabilitado orienta contato com administrador e não oferece envio", async () => {
  await page(() => <RecoveryForm enabled={false} />);
  expect(await screen.findByText(/Entre em contato com o administrador/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "Enviar instruções" })).toBeNull();
});

test("reset retira fragmento, envia token apenas no corpo e limpa senha após sucesso", async () => {
  const token = "a".repeat(43);
  window.location.hash = `token=${token}`;
  const save = mock(async (..._args: unknown[]) => ({
    ok: true as const,
    data: { message: "Senha redefinida." },
  }));
  await page(() => <ResetPasswordForm enabled resetFn={save} />);
  await waitFor(() => expect(screen.getByLabelText("Nova senha")).toBeDefined());
  expect(window.location.hash).toBe("");
  expect(document.body.textContent).not.toContain(token);
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha-segura-nova" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: "senha-segura-nova" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0]).toEqual([{ data: { token, password: "senha-segura-nova" } }]); // betterleaks:allow
  expect(await screen.findByText("Senha redefinida. Entre com sua nova senha.")).toBeDefined();
  expect(screen.queryByLabelText("Nova senha")).toBeNull();
});

import { expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { Route as EntrarRoute } from "#/routes/entrar";
import type { SessionInfo } from "#/server/session";

test("login apresenta a marca IFSC com nome acessível", async () => {
  const root = createRootRouteWithContext<{ session: SessionInfo }>()({
    component: Outlet,
  });
  const entrar = EntrarRoute.update({
    id: "/entrar",
    path: "/entrar",
    getParentRoute: () => root,
  } as never);
  const router = createRouter({
    routeTree: root.addChildren([entrar]),
    history: createMemoryHistory({ initialEntries: ["/entrar"] }),
    context: {
      session: { user: null, publicRead: true, timeZone: "America/Sao_Paulo" },
    },
  });

  render(<RouterProvider router={router} />);

  expect(await screen.findByRole("img", { name: "Marca do IFSC" })).toBeDefined();
  expect(screen.getByText("Sistema de Reserva de Espaços")).toBeDefined();
  expect(document.querySelector("[data-faixa-ifsc]")).toBeNull();
});

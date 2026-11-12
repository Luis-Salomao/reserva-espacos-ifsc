import { expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { SystemIntro } from "./system-intro";

test("apresenta o sistema, quem consulta e o botão Entrar", async () => {
  const root = createRootRoute({ component: SystemIntro });
  const entrar = createRoute({ getParentRoute: () => root, path: "/entrar" });
  const router = createRouter({
    routeTree: root.addChildren([entrar]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  const region = await screen.findByRole("region", { name: "Sobre o sistema" });
  expect(region.textContent).toContain("Qualquer pessoa pode consultar");
  expect(region.textContent).toContain("é preciso entrar");
  expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/entrar");
  expect(region.querySelectorAll("h1").length).toBe(0);
});

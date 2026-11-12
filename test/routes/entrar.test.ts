import { expect, test } from "bun:test";
import { Route } from "#/routes/entrar";

test("login restaura referrer same-origin ao voltar da recuperação por navegação SPA", async () => {
  type HeadArgs = Parameters<NonNullable<typeof Route.options.head>>[0];
  const head = await Route.options.head?.({} as HeadArgs);
  expect(head?.meta).toContainEqual({ name: "referrer", content: "same-origin" });
});

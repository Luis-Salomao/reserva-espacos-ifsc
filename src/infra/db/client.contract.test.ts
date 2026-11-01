import { expect, test } from "bun:test";
import type { DbClientModule } from "#/infra/db/client";
import type * as Cloudflare from "#/infra/db/client.cloudflare";
import type * as Local from "#/infra/db/client.local";

type Assert<T extends DbClientModule> = T;

// Verificação em tempo de tipo (tsc): os dois alvos exportam o mesmo contrato.
test("client.local e client.cloudflare cumprem DbClientModule", () => {
  const shapes: [Assert<typeof Local>, Assert<typeof Cloudflare>] | undefined = undefined;
  expect(shapes).toBeUndefined();
});

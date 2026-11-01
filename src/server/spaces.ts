import { createServerFn } from "@tanstack/react-start";
import type { Space } from "#/domain/space";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { getDb } from "#db-client";

/** Lista os espaços cadastrados (executa no servidor, em qualquer alvo de deploy). */
export const listSpaces = createServerFn({ method: "GET" }).handler(
  async (): Promise<Space[]> => createSpaceRepository(getDb()).list(),
);

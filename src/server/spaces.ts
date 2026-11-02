import { createServerFn } from "@tanstack/react-start";
import type { Space } from "#/domain/space";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { getDb } from "#db-client";
import { getRequestSession } from "./auth-context.ts";
import { canViewHome } from "./session.ts";

/**
 * Lista os espaços cadastrados (executa no servidor, em qualquer alvo de deploy). Com
 * PUBLIC_READ=false exige sessão: a checagem vale mesmo se alguém chamar a função direto.
 */
export const listSpaces = createServerFn({ method: "GET" }).handler(async (): Promise<Space[]> => {
  const { user, publicRead } = await getRequestSession();
  if (!canViewHome(publicRead, user)) throw new Error("É preciso entrar para ver os espaços.");
  return createSpaceRepository(getDb()).list();
});

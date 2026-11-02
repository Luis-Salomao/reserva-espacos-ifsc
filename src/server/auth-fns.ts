import { createServerFn } from "@tanstack/react-start";
import { getRequestSession } from "./auth-context.ts";
import type { SessionInfo } from "./session.ts";

/** Usuário logado (ou `null`) e se a leitura pública está ligada; alimenta guardas e o AppShell. */
export const getSessionInfo = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionInfo> => getRequestSession(),
);

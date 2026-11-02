import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createSemestersService } from "#/application/semesters";
import { createSpacesService } from "#/application/spaces";
import { createUsersService } from "#/application/users";
import { createConfiguredHasher } from "#/infra/auth/configured-hasher";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { getEnv } from "#/infra/env";
import { getDb, getRuntimeEnv } from "#db-client";
import {
  type AdminDeps,
  createAccount,
  createSemester,
  createSpace,
  getSemester,
  listAccounts,
  listAdminSpaces,
  listSemesters,
  resetAccountPassword,
  setAccountActive,
  updateAccount,
  updateSemester,
  updateSpace,
} from "./admin-actions.ts";
import { getAuth } from "./auth-context.ts";
import { finish } from "./finish.ts";

/**
 * Funções de servidor da administração (contas e espaços: `admin`; semestres: `admin` ou
 * `horarios`). Cada uma exige o papel no servidor (em
 * `admin-actions.ts`), então a checagem vale mesmo se alguém chamar a função direto. Sessão
 * ausente ou papel errado respondem HTTP 401/403 (o cliente recebe um erro); falhas de validação
 * voltam como resultado tipado com HTTP 200, para a tela mostrar a mensagem no campo.
 */
function getAdminDeps(): AdminDeps {
  const env = getEnv(getRuntimeEnv());
  const db = getDb();
  const users = createUserRepository(db);
  const sessions = createSessionRepository(db);
  return {
    auth: getAuth(),
    users: createUsersService({
      users,
      sessions,
      hasher: createConfiguredHasher(env),
    }),
    spaces: createSpacesService({ spaces: createSpaceRepository(db) }),
    semesters: createSemestersService({ semesters: createSemesterRepository(db) }),
    cookieSecure: env.COOKIE_SECURE,
  };
}

export const passthrough = (data: unknown): unknown => data;

export const listAccountsFn = createServerFn({ method: "GET" }).handler(async () =>
  finish(await listAccounts(getAdminDeps(), getRequest())),
);

export const createAccountFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await createAccount(getAdminDeps(), getRequest(), data)));

export const updateAccountFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await updateAccount(getAdminDeps(), getRequest(), data)));

export const setAccountActiveFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await setAccountActive(getAdminDeps(), getRequest(), data)));

export const resetAccountPasswordFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await resetAccountPassword(getAdminDeps(), getRequest(), data)),
  );

export const listAdminSpacesFn = createServerFn({ method: "GET" }).handler(async () =>
  finish(await listAdminSpaces(getAdminDeps(), getRequest())),
);

export const createSpaceFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await createSpace(getAdminDeps(), getRequest(), data)));

export const updateSpaceFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await updateSpace(getAdminDeps(), getRequest(), data)));

export const listSemestersFn = createServerFn({ method: "GET" }).handler(async () =>
  finish(await listSemesters(getAdminDeps(), getRequest())),
);

export const getSemesterFn = createServerFn({ method: "GET" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await getSemester(getAdminDeps(), getRequest(), data)));

export const createSemesterFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await createSemester(getAdminDeps(), getRequest(), data)));

export const updateSemesterFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await updateSemester(getAdminDeps(), getRequest(), data)));

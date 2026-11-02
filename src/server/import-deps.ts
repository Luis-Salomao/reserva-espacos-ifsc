import { createImportService } from "#/application/import-apply";
import { createMappingsService } from "#/application/import-mappings";
import { createImportReportService } from "#/application/import-report";
import { createSemestersService } from "#/application/semesters";
import { createSpacesService } from "#/application/spaces";
import { createUsersService } from "#/application/users";
import { createConfiguredHasher } from "#/infra/auth/configured-hasher";
import { createImportRepository } from "#/infra/db/repos/import-repository";
import { createMappingRepositories } from "#/infra/db/repos/mapping-repositories";
import { createSemesterRepository } from "#/infra/db/repos/semester-repository";
import { createSessionRepository } from "#/infra/db/repos/session-repository";
import { createSpaceRepository } from "#/infra/db/repos/space-repository";
import { createUserRepository } from "#/infra/db/repos/user-repository";
import { getEnv } from "#/infra/env";
import { systemClock } from "#/infra/runtime";
import { getDb, getRuntimeEnv } from "#db-client";
import { getAuth } from "./auth-context.ts";
import type { ImportFlowDeps } from "./import-flow.ts";

/**
 * Raiz de composição da importação (só no servidor). Fica fora de `import-fns.ts` para que o
 * cliente, que importa as funções de servidor, nunca arraste o hasher de senha para o pacote.
 */
export function getImportFlowDeps(): ImportFlowDeps {
  const env = getEnv(getRuntimeEnv());
  const db = getDb();
  const spaces = createSpaceRepository(db);
  const users = createUserRepository(db);
  const semesters = createSemesterRepository(db);
  const maps = createMappingRepositories(db);
  const imports = createImportRepository(db);
  return {
    auth: getAuth(),
    cookieSecure: env.COOKIE_SECURE,
    users: createUsersService({
      users,
      sessions: createSessionRepository(db),
      hasher: createConfiguredHasher(env),
    }),
    spaces: createSpacesService({ spaces }),
    semesters: createSemestersService({ semesters }),
    imports: createImportService({
      imports,
      rooms: maps.rooms,
      teachers: maps.teachers,
      semesters,
      clock: systemClock,
    }),
    mappings: createMappingsService({
      rooms: maps.rooms,
      teachers: maps.teachers,
      spaces,
      users,
      clock: systemClock,
    }),
    report: createImportReportService({ imports, spaces, users, semesters }),
  };
}

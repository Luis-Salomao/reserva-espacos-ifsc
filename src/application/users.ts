import { MAX_PASSWORD_LENGTH, validatePassword } from "#/application/auth";
import type { PasswordHasher, SessionRepository, UserRepository } from "#/application/ports";
import { fail, ok, parseText, type Result } from "#/application/validation";
import {
  isRole,
  isValidCode,
  isValidEmail,
  normalizeEmail,
  type Role,
  type User,
} from "#/domain/user";

export const MAX_NAME_LENGTH = 120;

export type UsersDeps = {
  users: UserRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
};

export type CreateUserInput = {
  email: string;
  name: string;
  /** Sigla; vazio = sem sigla. */
  code: string;
  roles: readonly string[];
  password: string;
};

export type UpdateUserInput = { name: string; code: string; roles: readonly string[] };

function parseEmail(raw: string): Result<string> {
  const email = normalizeEmail(raw);
  return isValidEmail(email) ? ok(email) : fail("validation", "Informe um e-mail válido.", "email");
}

function parseCode(raw: string): Result<string | null> {
  const code = raw.trim();
  if (code === "") return ok(null);
  return isValidCode(code)
    ? ok(code)
    : fail(
        "validation",
        "A sigla deve ter de 1 a 16 caracteres: letras, números, ponto, hífen ou sublinhado.",
        "code",
      );
}

function parseUserRoles(raw: readonly string[]): Result<Role[]> {
  const roles: Role[] = [];
  for (const value of raw) {
    if (!isRole(value)) return fail("validation", "Papel desconhecido.", "roles");
    if (!roles.includes(value)) roles.push(value);
  }
  return roles.length === 0
    ? fail("validation", "Selecione ao menos um papel.", "roles")
    : ok(roles);
}

function parseNewPassword(password: string): Result<string> {
  const problem = validatePassword(password);
  if (problem !== null) return fail("validation", problem, "password");
  if (password.length > MAX_PASSWORD_LENGTH) {
    return fail(
      "validation",
      `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`,
      "password",
    );
  }
  return ok(password);
}

const DUPLICATE = "Já existe uma conta com este e-mail.";
const DUPLICATE_CODE = "Já existe uma conta com esta sigla.";
const NOT_FOUND = "Conta não encontrada.";
const LAST_ADMIN = "Não é possível deixar o sistema sem administrador ativo.";
const EMAIL_IN_USE = "Este e-mail já está em uso.";
const NOT_PLACEHOLDER = "Esta conta já está ativada.";
const MERGE_TARGET_MISSING = "Escolha uma conta existente para receber as aulas.";
const MERGE_TARGET_PLACEHOLDER =
  "A conta escolhida também não está ativada. Escolha uma conta ativada.";
const MERGE_TARGET_INACTIVE = "A conta escolhida está desativada. Reative-a ou escolha outra.";
const MERGE_CHANGED = "As contas mudaram enquanto a fusão rodava. Recarregue e tente de novo.";

export function createUsersService(deps: UsersDeps) {
  const { users, sessions, hasher } = deps;

  async function codeTaken(code: string | null, ownId: string | null): Promise<boolean> {
    if (code === null) return false;
    const other = await users.findByCode(code);
    return other !== null && other.id !== ownId;
  }

  return {
    list(): Promise<User[]> {
      return users.list();
    },

    async create(input: CreateUserInput): Promise<Result<User>> {
      const email = parseEmail(input.email);
      if (!email.ok) return email;
      const name = parseText(input.name, MAX_NAME_LENGTH, "O nome", "name");
      if (!name.ok) return name;
      const code = parseCode(input.code);
      if (!code.ok) return code;
      const roles = parseUserRoles(input.roles);
      if (!roles.ok) return roles;
      const password = parseNewPassword(input.password);
      if (!password.ok) return password;

      if ((await users.findByEmail(email.value)) !== null) {
        return fail("conflict", DUPLICATE, "email");
      }
      if (await codeTaken(code.value, null)) return fail("conflict", DUPLICATE_CODE, "code");

      const passwordHash = await hasher.hash(password.value);
      try {
        return ok(
          await users.create({
            email: email.value,
            name: name.value,
            code: code.value,
            roles: roles.value,
            passwordHash,
          }),
        );
      } catch (error) {
        // Corrida entre a checagem e a gravação: a restrição de unicidade do banco decide.
        if ((await users.findByEmail(email.value)) !== null) {
          return fail("conflict", DUPLICATE, "email");
        }
        if (await codeTaken(code.value, null)) return fail("conflict", DUPLICATE_CODE, "code");
        throw error;
      }
    },

    async update(id: string, input: UpdateUserInput): Promise<Result<User>> {
      const name = parseText(input.name, MAX_NAME_LENGTH, "O nome", "name");
      if (!name.ok) return name;
      const code = parseCode(input.code);
      if (!code.ok) return code;
      const roles = parseUserRoles(input.roles);
      if (!roles.ok) return roles;

      const target = await users.findById(id);
      if (target === null) return fail("not_found", NOT_FOUND);
      if (await codeTaken(code.value, id)) return fail("conflict", DUPLICATE_CODE, "code");
      // A proteção do último admin é atômica no repositório (uma única instrução condicional).
      let updated: User | null;
      try {
        updated = await users.update(id, {
          name: name.value,
          code: code.value,
          roles: roles.value,
        });
      } catch (error) {
        // Corrida entre a checagem e a gravação: a restrição de unicidade da sigla decide.
        if (await codeTaken(code.value, id)) return fail("conflict", DUPLICATE_CODE, "code");
        throw error;
      }
      if (updated !== null) return ok(updated);
      return (await users.findById(id)) === null
        ? fail("not_found", NOT_FOUND)
        : fail("last_admin", LAST_ADMIN, "roles");
    },

    /** Desativar revoga todas as sessões da conta; reativar só volta a permitir o login. */
    async setActive(id: string, active: boolean): Promise<Result<User>> {
      const target = await users.findById(id);
      if (target === null) return fail("not_found", NOT_FOUND);
      if (!(await users.setActive(id, active))) {
        return (await users.findById(id)) === null
          ? fail("not_found", NOT_FOUND)
          : fail("last_admin", LAST_ADMIN);
      }
      if (!active) await sessions.revokeAllForUser(id);
      return ok({ ...target, active });
    },

    /** Redefine a senha e revoga as sessões abertas da conta. */
    async resetPassword(id: string, password: string): Promise<Result<null>> {
      const parsed = parseNewPassword(password);
      if (!parsed.ok) return parsed;
      if ((await users.findById(id)) === null) return fail("not_found", NOT_FOUND);
      await users.updatePasswordHash(id, await hasher.hash(parsed.value));
      await sessions.revokeAllForUser(id);
      return ok(null);
    },

    /** Ativa uma conta fantasma com e-mail e senha reais: a partir daí ela entra normalmente. */
    async activatePlaceholder(
      id: string,
      input: { email: string; password: string },
    ): Promise<Result<User>> {
      const email = parseEmail(input.email);
      if (!email.ok) return email;
      const password = parseNewPassword(input.password);
      if (!password.ok) return password;
      const target = await users.findById(id);
      if (target === null) return fail("not_found", NOT_FOUND);
      if (!target.placeholder) return fail("validation", NOT_PLACEHOLDER);
      const emailTaken = async () => {
        const owner = await users.findByEmail(email.value);
        return owner !== null && owner.id !== id;
      };
      if (await emailTaken()) return fail("conflict", EMAIL_IN_USE, "email");

      const passwordHash = await hasher.hash(password.value);
      let activated: boolean;
      try {
        activated = await users.activatePlaceholder(id, email.value, passwordHash);
      } catch (error) {
        // Corrida entre a checagem e a gravação: a restrição de unicidade do banco decide.
        if (await emailTaken()) return fail("conflict", EMAIL_IN_USE, "email");
        throw error;
      }
      if (!activated) {
        return (await users.findById(id)) === null
          ? fail("not_found", NOT_FOUND)
          : fail("validation", NOT_PLACEHOLDER);
      }
      return ok({ ...target, email: email.value, placeholder: false });
    },

    /**
     * Funde a fantasma `id` na conta `targetId` (ativada e ativa): as aulas e os vínculos do XML
     * passam para ela e a fantasma é apagada.
     */
    async mergePlaceholder(id: string, targetId: string): Promise<Result<null>> {
      const from = await users.findById(id);
      if (from === null) return fail("not_found", NOT_FOUND);
      if (!from.placeholder) return fail("validation", NOT_PLACEHOLDER);
      const target = await users.findById(targetId);
      if (target === null) return fail("validation", MERGE_TARGET_MISSING, "targetId");
      if (target.placeholder) return fail("validation", MERGE_TARGET_PLACEHOLDER, "targetId");
      if (!target.active) return fail("validation", MERGE_TARGET_INACTIVE, "targetId");
      if (!(await users.mergeInto(id, targetId))) return fail("conflict", MERGE_CHANGED);
      return ok(null);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;

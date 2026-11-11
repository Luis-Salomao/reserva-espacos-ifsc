import { MAX_PASSWORD_LENGTH, validatePassword } from "#/application/auth";
import type { EmailPayloadCodec } from "#/application/email-ports";
import type {
  PasswordRecoveryRepository,
  RecoveryTokens,
} from "#/application/password-recovery-ports";
import type { Clock, PasswordHasher, UserRepository } from "#/application/ports";
import { fail, ok } from "#/application/validation";
import { isValidEmail, normalizeEmail } from "#/domain/user";

export const RECOVERY_MESSAGE =
  "Se houver uma conta habilitada com este e-mail, você receberá as instruções para redefinir sua senha.";
const INVALID_TOKEN = "Link inválido ou expirado. Solicite uma nova recuperação de senha.";
const TTL = 20 * 60 * 1000;
const RATE_WINDOW = 60 * 60 * 1000;

export type RecoveryDeps = {
  users: Pick<UserRepository, "findByEmail">;
  repository: PasswordRecoveryRepository;
  hasher: PasswordHasher;
  tokens: RecoveryTokens;
  clock: Clock;
  email: { publicOrigin: string; codec: EmailPayloadCodec } | null;
};

export function createPasswordRecoveryService(deps: RecoveryDeps) {
  return {
    enabled: deps.email !== null,
    async request(rawEmail: string, client: string) {
      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email) || deps.email === null) return { message: RECOVERY_MESSAGE };
      const now = deps.clock.now();
      const allowed = await deps.repository.allowRequest({
        id: deps.tokens.create(),
        emailHash: await deps.tokens.hash(`email:${email}`),
        clientHash: await deps.tokens.hash(`client:${client}`),
        now: now.toISOString(),
        since: new Date(now.getTime() - RATE_WINDOW).toISOString(),
      });
      if (!allowed) return { message: RECOVERY_MESSAGE };
      const token = deps.tokens.create();
      const expiresAt = new Date(now.getTime() + TTL).toISOString();
      const link = `${deps.email.publicOrigin}/redefinir-senha#token=${token}`;
      // Mesmo trabalho criptográfico para contas existentes e desconhecidas.
      const payload = await deps.email.codec.seal({
        to: email,
        subject: "Redefinir sua senha",
        text: `Para redefinir sua senha, acesse: ${link}\nEste link expira em 20 minutos e só pode ser usado uma vez. Se você não solicitou, ignore esta mensagem.`,
      });
      const account = await deps.users.findByEmail(email);
      if (account?.active && !account.placeholder) {
        await deps.repository.create({
          id: deps.tokens.create(),
          userId: account.id,
          tokenHash: await deps.tokens.hash(token),
          createdAt: now.toISOString(),
          expiresAt,
          mail: { id: deps.tokens.create(), payload, createdAt: now.toISOString(), expiresAt },
        });
      }
      return { message: RECOVERY_MESSAGE };
    },
    async reset(token: string, password: string, client = "unknown") {
      if (deps.email === null || !/^[A-Za-z0-9_-]{43}$/.test(token))
        return fail("validation", INVALID_TOKEN);
      const error = validatePassword(password);
      if (error !== null) return fail("validation", error, "password");
      if (password.length > MAX_PASSWORD_LENGTH)
        return fail("validation", "A senha deve ter no máximo 1024 caracteres.", "password");
      const now = deps.clock.now();
      const tokenHash = await deps.tokens.hash(token);
      const admitted = await deps.repository.allowRequest({
        id: deps.tokens.create(),
        emailHash: await deps.tokens.hash(`reset-token:${tokenHash}`),
        clientHash: await deps.tokens.hash(`reset-client:${client}`),
        now: now.toISOString(),
        since: new Date(now.getTime() - RATE_WINDOW).toISOString(),
      });
      if (!admitted || !(await deps.repository.eligible(tokenHash, now.toISOString())))
        return fail("validation", INVALID_TOKEN);
      const consumed = await deps.repository.consume({
        tokenHash,
        passwordHash: await deps.hasher.hash(password),
        now: deps.clock.now().toISOString(),
        claimId: deps.tokens.create(),
      });
      return consumed
        ? ok({ message: "Senha redefinida. Entre com sua nova senha." })
        : fail("validation", INVALID_TOKEN);
    },
  };
}

export type PasswordRecoveryService = ReturnType<typeof createPasswordRecoveryService>;

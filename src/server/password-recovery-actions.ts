import { type PasswordRecoveryService, RECOVERY_MESSAGE } from "#/application/password-recovery";
import { type AdminResponse, fromResult, record, reject, text } from "./admin-actions";

export async function requestPasswordRecovery(
  service: PasswordRecoveryService,
  data: unknown,
  client: string,
): Promise<AdminResponse<{ message: string }>> {
  const body = record(data);
  const email = body && text(body, "email");
  // A mesma resposta também cobre formato inválido e falhas da infraestrutura, sem dados de conta.
  if (email !== null && email.length <= 254) {
    try {
      await service.request(email, client);
    } catch {
      /* Resposta pública deliberadamente genérica. */
    }
  }
  return { ok: true, data: { message: RECOVERY_MESSAGE } };
}

export async function resetPassword(
  service: PasswordRecoveryService,
  data: unknown,
  client = "unknown",
): Promise<AdminResponse<{ message: string }>> {
  const body = record(data);
  const token = body && text(body, "token");
  const password = body && text(body, "password");
  if (token === null || password === null || token.length > 100 || password.length > 1024)
    return reject(400, "Informe um link válido e uma senha de até 1024 caracteres.");
  try {
    return fromResult(await service.reset(token, password, client));
  } catch {
    return reject(400, "Não foi possível redefinir a senha. Tente novamente.");
  }
}

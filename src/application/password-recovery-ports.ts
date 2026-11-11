import type { OutboxWrite } from "#/application/email-ports";

export interface RecoveryTokens {
  create(): string;
  hash(value: string): Promise<string>;
}

export interface PasswordRecoveryRepository {
  /** Consulta barata antes do KDF; o consumo repete as condições de forma atômica. */
  eligible(tokenHash: string, now: string): Promise<boolean>;
  /** Admissão atômica independente das tentativas de login. Apenas hashes identificadores. */
  allowRequest(input: {
    id: string;
    emailHash: string;
    clientHash: string;
    now: string;
    since: string;
  }): Promise<boolean>;
  /** Hash do token e mensagem cifrada persistidos na mesma transação. */
  create(input: {
    id: string;
    userId: string;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
    mail: OutboxWrite;
  }): Promise<void>;
  /** Uso único, nova senha e revogação das sessões na mesma transação. */
  consume(input: {
    tokenHash: string;
    passwordHash: string;
    now: string;
    claimId: string;
  }): Promise<boolean>;
}

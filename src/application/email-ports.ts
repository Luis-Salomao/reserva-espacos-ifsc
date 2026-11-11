export type EmailMessage = { to: string; subject: string; text: string };
export type OutboxWrite = { id: string; payload: string; createdAt: string; expiresAt: string };
export interface EmailPayloadCodec {
  seal(message: EmailMessage): Promise<string>;
  open(payload: string): Promise<EmailMessage>;
}
export interface EmailSender {
  send(message: EmailMessage, idempotencyKey: string): Promise<void>;
}

type OutboxLease = OutboxWrite & { token: string; attempts: number };
/** Every settlement is fenced by the lease token; stale workers cannot change a newer claim. */
export interface OutboxRepository {
  enqueue(write: OutboxWrite): Promise<void>;
  claim(now: string, leaseUntil: string, token: string): Promise<OutboxLease | null>;
  sent(id: string, token: string, now: string): Promise<boolean>;
  retry(id: string, token: string, now: string, nextAttemptAt: string): Promise<boolean>;
  cleanup(now: string): Promise<void>;
}

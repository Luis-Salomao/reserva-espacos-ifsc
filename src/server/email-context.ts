import { createOutboxProcessor, type DrainResult } from "#/application/email-outbox";
import { createOutboxRepository } from "#/infra/db/repos/outbox-repository";
import { getEmailConfig } from "#/infra/email/config";
import { createEmailPayloadCodec } from "#/infra/email/payload-codec";
import { createResendSender } from "#/infra/email/resend";
import { getDb, getRuntimeEnv } from "#db-client";

/** Disabled não abre banco, não importa segredos obrigatórios e não acessa rede. */
export function getEmailContext() {
  const config = getEmailConfig(getRuntimeEnv());
  if (config === null) return null;
  return {
    config,
    codec: createEmailPayloadCodec(config.payloadKey),
    sender: createResendSender(config),
    outbox: createOutboxRepository(getDb()),
  };
}

export async function drainEmailOutbox(): Promise<DrainResult> {
  const context = getEmailContext();
  if (context === null) return { sent: 0, failed: 0 };
  return createOutboxProcessor(context).drain();
}

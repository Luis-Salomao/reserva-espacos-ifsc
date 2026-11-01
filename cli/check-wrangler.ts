#!/usr/bin/env bun
import { hasPlaceholderDatabaseId } from "./wrangler-config.ts";

// Aborta antes de build/migração/deploy se o wrangler.jsonc ainda tem o database_id provisório.
const text = await Bun.file("wrangler.jsonc").text();
if (hasPlaceholderDatabaseId(text)) {
  console.error(
    'wrangler.jsonc ainda contém o database_id provisório ("local-placeholder"). ' +
      "Cole o database_id exibido por `wrangler d1 create reserva-espacos` em " +
      "d1_databases[0].database_id e rode o comando de novo.",
  );
  process.exit(1);
}
console.log("wrangler.jsonc: database_id configurado.");

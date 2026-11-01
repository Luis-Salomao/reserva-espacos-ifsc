import { getDb } from "#db-client";

// getDb() aplica as migrações pendentes no primeiro uso.
getDb();
console.log("Migrações aplicadas.");

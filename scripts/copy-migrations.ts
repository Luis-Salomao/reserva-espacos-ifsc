// Copia as migrações para dentro do build local (.output/drizzle), de modo que o
// servidor empacotado migre o banco sem depender da pasta do repositório.
import { cpSync } from "node:fs";

cpSync("drizzle", ".output/drizzle", { recursive: true });
console.log("Migrações copiadas para .output/drizzle");

/** Valor provisório de `database_id` deixado no wrangler.jsonc versionado. */
export const PLACEHOLDER_DATABASE_ID = "local-placeholder";

/** Verdadeiro se o conteúdo do wrangler.jsonc ainda contém o `database_id` provisório. */
export function hasPlaceholderDatabaseId(wranglerConfigText: string): boolean {
  return wranglerConfigText.includes(PLACEHOLDER_DATABASE_ID);
}

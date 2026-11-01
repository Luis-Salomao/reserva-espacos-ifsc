import { describe, expect, test } from "bun:test";
import { hasPlaceholderDatabaseId } from "./wrangler-config.ts";

describe("hasPlaceholderDatabaseId", () => {
  test("detecta o id provisório", () => {
    expect(hasPlaceholderDatabaseId('{ "database_id": "local-placeholder" }')).toBe(true);
  });

  test("aceita um id real", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(hasPlaceholderDatabaseId(`{ "database_id": "${id}" }`)).toBe(false);
  });
});

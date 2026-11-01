# Contribuindo

## Fluxo

1. `bun install` (instala dependências e os hooks do lefthook).
2. Crie uma branch e faça suas alterações.
3. `bun run check` antes de enviar.
4. Commits seguem Conventional Commits, em português (pt-BR).

## Hooks

- `pre-commit`: Betterleaks nos arquivos em stage (e o Biome).
- `pre-push`: `bun run check`.

Não use `--no-verify` para contornar os hooks.

## Dados e segredos

Nunca commite dados reais (pasta `data/`), `.env`, `.dev.vars`, bancos SQLite, tokens ou chaves. Se um segredo vazar, revogue-o imediatamente; apagar o commit não basta.

## Convenções

- Use apenas Bun (sem npm, pnpm ou yarn).
- Documentação e mensagens de commit em português; identificadores de código em inglês.

## Dependências fixadas (overrides)

`package.json` fixa `"overrides": {"tslib": "2.9.1"}`. O `@lhci/cli` (Lighthouse) depende de `tslib` 1.x; sem o override, o Bun o hoisteia na raiz e cria cópias aninhadas de `tslib` 2.x. No Windows, o build do Nitro copia todas para o mesmo destino em paralelo e falha com `EBUSY`. Remova o override quando o `@lhci/cli` passar a usar `tslib` 2.x (ou for removido) e `bun run build:local` funcionar sem ele após `rm -rf node_modules && bun install`.

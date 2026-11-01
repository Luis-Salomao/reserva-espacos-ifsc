# Contribuindo

## Fluxo

1. `bun install` (instala dependências e os hooks do lefthook).
2. Crie uma branch e faça suas alterações.
3. `bun run check` antes de enviar.
4. Commits seguem Conventional Commits, em português (pt-BR).

## Hooks

- `pre-commit`: Betterleaks nos arquivos em stage (e o linter, quando configurado).
- `pre-push`: `bun run check`.

Não use `--no-verify` para contornar os hooks.

## Dados e segredos

Nunca commite dados reais (pasta `data/`), `.env`, `.dev.vars`, bancos SQLite, tokens ou chaves. Se um segredo vazar, revogue-o imediatamente; apagar o commit não basta.

## Convenções

- Use apenas Bun (sem npm, pnpm ou yarn).
- Documentação e mensagens de commit em português; identificadores de código em inglês.

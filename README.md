# Reserva de Espaços IFSC

Aplicação web de código aberto para reserva de salas e espaços de uma escola (IFSC). Construída com TanStack Start e Bun.

## Alvos

O projeto tem dois alvos de execução:

1. **Desenvolvimento local**: servidor Bun com banco SQLite local.
2. **Produção**: Cloudflare Workers.

## Pré-requisitos

- [Bun](https://bun.sh) 1.4 ou superior.
- [Betterleaks](https://github.com/betterleaks/betterleaks) para varredura de segredos:
  - Windows: `winget install Betterleaks.Betterleaks`
  - macOS/Linux: `brew install betterleaks` ou baixe o binário da página de releases.

## Primeiros passos

```bash
bun install
bun run check
```

`bun install` também instala os hooks do Git (lefthook).

## Segurança

Dados reais (`data/`), arquivos `.env`, `.dev.vars` e bancos SQLite nunca entram no Git. O hook de pre-commit executa o Betterleaks nos arquivos em stage e rejeita o commit se encontrar segredos. Para varrer o histórico: `bun run secrets`.

## Licença

[MIT](LICENSE)

## Desenvolvimento

```bash
bun install
bun run dev   # http://localhost:3000
```

### Alvo Cloudflare (Workers + D1) em desenvolvimento

```bash
bun run db:migrate:d1:local   # aplica as migrações no D1 local (miniflare); rode antes do dev:cf
bun run dev:cf                # Vite + Workers
bun run build:cf && bun run preview:cf   # build e wrangler dev
```

### Docker (alvo local)

```bash
docker build -t reserva .
docker run -p 3000:3000 -v reserva-data:/data reserva
```

Use de preferência um volume nomeado em `/data`. Se montar uma pasta do host (bind mount), ela precisa ser gravável pelo uid do usuário `bun` da imagem (1000).

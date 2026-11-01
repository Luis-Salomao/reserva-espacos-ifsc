# Reserva de Espaços IFSC

Aplicação web de código aberto para reserva de salas e espaços de uma escola (IFSC). Construída com TanStack Start e Bun.

## Alvos

O mesmo código gera dois alvos de execução, ambos adequados para produção:

1. **Local/contêiner**: servidor Bun (Nitro) com banco SQLite em arquivo (`DEPLOY_TARGET=local`).
2. **Cloudflare**: Workers com banco D1 (`DEPLOY_TARGET=cloudflare`).

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

## Instalação

O CLI `init` gera a configuração do alvo escolhido, mostra o plano (arquivos e comandos), pede confirmação e só então executa. Ele recusa sobrescrever arquivos existentes sem `--force`.

```bash
bun install
bun run cli init
```

Opções para uso não interativo: `--target local|cloudflare`, `--database-path`, `--timezone`, `--yes`, `--force` e `--dry-run` (apenas mostra o plano) e `--help` (lista todas as opções).

### Alvo local (Bun + SQLite)

`bun run cli init --target local` cria o `.env` (`DEPLOY_TARGET=local`, `DATABASE_PATH`, `TIMEZONE`) e aplica as migrações (`bun run db:migrate`). `DATABASE_PATH` é obrigatória e não tem valor padrão no código: sem ela, `start:local`, `db:migrate` e `db:generate` falham informando a variável. O padrão sugerido (`.env.example` e CLI) é `./data/app.sqlite`. Depois:

```bash
bun run build:local
bun run start:local
```

Verifique em `http://localhost:3000/api/health`.

### Alvo Cloudflare (Workers + D1)

`bun run cli init --target cloudflare` cria o `.dev.vars` (apenas `TIMEZONE`) e executa, em sequência:

1. `wrangler d1 create reserva-espacos` (exige `wrangler login` prévio);
2. pausa para você copiar o `database_id` exibido e colá-lo em `wrangler.jsonc` (`d1_databases[0].database_id`);
3. `bun run cf:check`: aborta se o `wrangler.jsonc` ainda tiver o id provisório `local-placeholder`;
4. `bun run build:cf`;
5. `bun run db:migrate:d1:remote`;
6. `wrangler deploy`.

Com `--yes` o CLI encerra após o `d1 create` e imprime os comandos restantes; se o stdin fechar na pausa, ele avisa que o D1 já foi criado e como retomar. O CLI nunca edita o `wrangler.jsonc` nem grava segredos.

Para publicar de novo depois (sem recriar o banco): `bun run deploy:cf` (verifica o id, compila e publica). Aplique migrações novas com `bun run db:migrate:d1:remote`.

Os scripts `dev:cf` e `preview:cf` definem `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` para o wrangler não injetar o `.env` (que tem `DEPLOY_TARGET=local` e, às vezes, `CLOUDFLARE_*`) no Worker; só `.dev.vars` (apenas `TIMEZONE`/`PUBLIC_READ`) é lido.

Importante: o build (`build:cf`) grava `.wrangler/deploy/config.json`, que faz o `wrangler deploy` usar o snapshot `dist/server/wrangler.json` gerado a partir do `wrangler.jsonc`. Por isso o `database_id` deve ser colado **antes** do build, e os scripts de migração D1 usam `--config wrangler.jsonc` explicitamente, para que a fonte da verdade seja sempre o `wrangler.jsonc`.

## Segurança

Dados reais (`data/`), arquivos `.env`, `.dev.vars` e bancos SQLite nunca entram no Git. O hook de pre-commit executa o Betterleaks nos arquivos em stage e rejeita o commit se encontrar segredos. Para varrer o histórico: `bun run secrets`.

## Desenvolvimento

```bash
bun install
cp .env.example .env   # define DATABASE_PATH (obrigatória no alvo local)
bun run dev            # http://localhost:3000
```

### Alvo Cloudflare (Workers + D1) em desenvolvimento

```bash
bun run db:migrate:d1:local   # aplica as migrações no D1 local (miniflare); rode antes do dev:cf
bun run dev:cf                # Vite + Workers
bun run preview:cf            # build:cf + wrangler dev
```

### Docker (alvo local) — não verificado ainda

> O `Dockerfile` ainda não foi construído nem executado: o daemon do Docker não estava disponível no ambiente de desenvolvimento. Trate-o como não verificado até alguém rodar o build e o healthcheck.

```bash
docker build -t reserva .
docker run -p 3000:3000 -v reserva-data:/data reserva
```

Use de preferência um volume nomeado em `/data`. Se montar uma pasta do host (bind mount), ela precisa ser gravável pelo uid do usuário `bun` da imagem (1000).

## Prévia de importação do aSc Horários

```bash
bun run cli import-preview <arquivo.xml> [--json] [--full]
```

Lê o XML exportado pelo aSc Horários e imprime um resumo em português (contagens, horários semanais por situação de sala, sobreposições, durações usadas, avisos agrupados e salas). **Não grava nada** no banco. Com `--json` imprime a prévia sem a grade completa; `--full` inclui `timetable`, `slots` e `overlapsDetail`. O resumo não contém dados pessoais de docentes. Arquivos reais ficam em `data/real/` (fora do Git); o teste `src/import-asc/real-file.test.ts` os usa se existirem e imprime só contagens.

## Licença

[MIT](LICENSE)

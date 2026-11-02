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

O cookie de sessão (`sid`) é `HttpOnly; SameSite=Lax` e leva `Secure`, exceto em `http://localhost` e `http://127.0.0.1`. A variável opcional `COOKIE_SECURE` muda isso: `auto` (padrão), `true` (sempre Secure) ou `false` (nunca). **Use `false` só em rede local sem HTTPS**; em produção mantenha `auto` ou `true`. Ao entrar de novo, a sessão anterior do navegador é revogada.

### Atrás de proxy reverso com TLS

O servidor não confia em `X-Forwarded-*`. Atrás de um proxy que termina o TLS (ele fala HTTP com o app), defina `PUBLIC_ORIGIN` com a origem pública, sem caminho: `PUBLIC_ORIGIN=https://reservas.campus.edu.br`. Com ela, o `Origin` aceito nos POST é exatamente essa origem (proteção CSRF) e o cookie de sessão leva `Secure` se e somente se ela for `https` (isso prevalece sobre `COOKIE_SECURE`). Sem `PUBLIC_ORIGIN`, vale o comportamento anterior (origem da própria requisição). Exemplos de proxy:

```nginx
server {
  listen 443 ssl;
  server_name reservas.campus.edu.br;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
}
```

```caddyfile
reservas.campus.edu.br {
  reverse_proxy 127.0.0.1:3000
}
```

## Administração

Contas e espaços são geridos por quem tem o papel `admin`, em `/admin/contas` e `/admin/espacos` (menu "Administração"). O primeiro administrador nasce pela CLI (`bun run cli create-admin`). Desativar uma conta ou redefinir sua senha encerra todas as sessões dela, e o último administrador ativo não pode se desativar nem perder o papel `admin`. Espaços não têm exclusão nesta etapa.

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

### Docker (alvo local)

> Verificado no commit `d84abcc`: o build funciona, o contêiner fica saudável (healthcheck em `/api/health`, que informa o alvo `local`), roda como usuário não root (uid 1000) e o banco persiste no volume nomeado ao reiniciar o contêiner.

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

## Importação da grade (passo a passo)

Quem tem o papel `admin` ou `horarios` importa em **Importar grade** (`/importar`). Antes, cadastre o semestre (com as datas de cada duração) em **Semestres** e os espaços em **Administração**.

1. **Prévia**: envie o XML; nada é salvo e o arquivo nunca é guardado (o lote guarda só o hash e o resumo).
2. **Semestre**: escolha o semestre. O aviso mostra durações usadas pelo arquivo que não têm datas nele (essas aulas ficam "não aplicáveis").
3. **Salas**: vincule cada sala do arquivo a um espaço existente, crie um espaço com o nome dela ou ignore-a. Sala sem vínculo deixa suas aulas não aplicáveis. Vínculos salvos voltam pré-preenchidos.
4. **Docentes**: o responsável é a conta do primeiro docente da aula que tiver vínculo; a sugestão compara a sigla com o código da conta.
5. **Conferência**: prepara o lote em passos (com barra de progresso) e mostra as contagens por estado e motivo. Enviar o mesmo arquivo de novo no mesmo semestre é reconhecido: nada é duplicado.
6. **Aplicação**: cria as ocupações em passos; se for interrompida, aplique de novo e ela continua de onde parou. Conflitos com ocupações existentes são listados e nunca inseridos.

O **resultado por linha** (cada aula/ocorrência com estado, motivo, conflito e falha, com filtros, busca e paginação) aparece ao fim e também em **Lotes anteriores** (`/importar/lotes`).

## Licença

[MIT](LICENSE)

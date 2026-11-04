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

Verifique em `http://localhost:3000/api/health` (com `PUBLIC_READ=false` a resposta informa só o alvo, sem a contagem de espaços).

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

## Primeiro acesso (criar o primeiro administrador)

Sem nenhuma conta, ninguém consegue entrar; o primeiro `admin` nasce pela CLI. A senha é pedida sem eco, ou lida da entrada padrão com `--password-stdin`, e nunca é impressa.

- **Local (Bun + SQLite):** `bun run cli create-admin --email EMAIL --name NOME` (grava no banco de `DATABASE_PATH`).
- **Docker:** a imagem traz a CLI empacotada em `/app/cli.mjs`. Com o contêiner rodando: `docker exec -it NOME_DO_CONTEINER bun /app/cli.mjs create-admin --email EMAIL --name NOME`. Sem terminal: `printf '%s' "$SENHA" | docker exec -i NOME_DO_CONTEINER bun /app/cli.mjs create-admin --email EMAIL --name NOME --password-stdin`. Com o contêiner parado, use o mesmo volume: `docker run --rm -it -v reserva-data:/data reserva bun /app/cli.mjs create-admin --email EMAIL --name NOME`.
- **Cloudflare:** `bun run cli create-admin --target cloudflare --email EMAIL --name NOME` calcula o hash e **imprime** o comando `wrangler d1 execute DB --remote ...` (a CLI não escreve no D1). Para o D1 de desenvolvimento (`bun run dev:cf`), acrescente `--local`: o comando impresso usa `--local` em vez de `--remote`. Use o mesmo `PASSWORD_PEPPER` do Worker, se houver, e `--shell powershell` no PowerShell.

### Custo do hash de senha no Cloudflare Workers

O padrão é scrypt com N=16384. Medições **locais** (tempo de parede numa máquina de desenvolvimento): scrypt N=16384 ≈ 30 ms, N=4096 ≈ 7 ms, PBKDF2 com 100 000 iterações ≈ 40–60 ms. O consumo de **CPU em produção no Workers não foi medido**. O plano gratuito limita a CPU por requisição (10 ms), então o login pode estourar o limite; meça no seu plano antes de decidir. Se precisar, defina em `wrangler.jsonc` (`vars`) `PASSWORD_HASH` (`scrypt` ou `pbkdf2`) e/ou `PASSWORD_SCRYPT_N` (potência de 2, 1024 a 65536); o pepper (`PASSWORD_PEPPER`) é segredo (`wrangler secret put`). Trocar o algoritmo ou o custo mantém válidos os hashes antigos: no próximo login bem-sucedido a senha é regravada com a configuração nova (`needsRehash`). Trocar o **pepper** invalida todas as senhas. Um login com e-mail inexistente paga o mesmo custo de hash que um existente (hash fictício calculado uma vez por processo/isolate), para não revelar quais e-mails existem pelo tempo de resposta.

## Administração

Contas e espaços são geridos por quem tem o papel `admin`, em `/admin/contas` e `/admin/espacos` (menu "Administração"). O primeiro administrador nasce pela CLI (veja "Primeiro acesso"). Quem tem o papel `horarios` pode criar espaços a partir do fluxo de importação (vínculo de salas), mas só o `admin` edita espaços depois. Desativar uma conta ou redefinir sua senha encerra todas as sessões dela, e o último administrador ativo não pode se desativar nem perder o papel `admin`. Cada espaço registra seus equipamentos (projetor, computadores, aparelho de som e outros) e observações. Só é possível excluir um espaço sem reservas, aulas ou vínculo com o XML importado.

## Cópia e restauração

O sistema oferece procedimentos de cópia de segurança (backup) e restauração para SQLite local e Cloudflare D1 (RO-01).

### SQLite local e Docker

A CLI oficial provê os comandos `backup` e `restore`:

```bash
# Cópia consistente com a aplicação em execução (modo WAL):
bun run cli backup --out ./backups/backup-2026-11-04.sqlite [--overwrite]

# Restauração com a aplicação PARADA:
bun run cli restore --from ./backups/backup-2026-11-04.sqlite [--yes]
```

- **Backup (`cli backup --out <arquivo>`):**
  - Utiliza o comando `VACUUM INTO '<arquivo>'` do SQLite em modo somente-leitura.
  - Permite criar uma cópia estritamente consistente sem paralisar o servidor nem bloquear requisições HTTP de leitura ou escrita em modo WAL.
  - Valida o arquivo gerado e exibe o tamanho em bytes na saída padrão.

- **Restauração (`cli restore --from <arquivo>`):**
  - **Atenção:** deve ser executada com o servidor da aplicação **parado**, evitando conflitos de arquivos e bloqueios (`EBUSY`).
  - Executa verificação prévia de integridade via `PRAGMA integrity_check` no arquivo de backup antes de qualquer alteração no banco ativo. Se a cópia estiver corrompida, o processo é abortado imediatamente sem tocar no banco ativo.
  - Compara a contagem de migrações registradas no backup com o journal local do Drizzle (`drizzle/meta/_journal.json`).
  - Cria automaticamente uma cópia de segurança do banco ativo (`<alvo>.bak-<timestamp>`) antes da substituição.
  - Remove arquivos residuais `-wal` e `-shm` para impedir que logs transacionais antigos sejam reaplicados sobre o banco restaurado.
  - Substitui o arquivo de banco e executa validação final com `PRAGMA integrity_check`. Em caso de qualquer falha na verificação final, restaura automaticamente a cópia de segurança anterior.

#### No Docker / Contêiner

A imagem Docker empacota os mesmos comandos em `/app/cli.mjs`:

```bash
# Cópia em contêiner ativo:
docker exec app bun /app/cli.mjs backup --out /data/backup.sqlite

# Restauração (parar a aplicação web antes de restaurar):
docker stop app
docker run --rm -v reserva-data:/data reserva bun /app/cli.mjs restore --from /data/backup.sqlite --yes
docker start app
```

### Cloudflare D1

Para instalações no Cloudflare Workers com D1, utilize as ferramentas oficiais do Wrangler:

```bash
# Exportar cópia remota (gera arquivo SQL com schema e dados):
wrangler d1 export DB --output backup-d1.sql --remote --config wrangler.jsonc

# Exportar do D1 local (ambiente de desenvolvimento):
wrangler d1 export DB --output backup-d1-local.sql --local --config wrangler.jsonc

# Restaurar cópia remota:
wrangler d1 execute DB --file backup-d1.sql --remote --config wrangler.jsonc

# Restaurar no D1 local:
wrangler d1 execute DB --file backup-d1-local.sql --local --config wrangler.jsonc
```

> **Aviso:** Nunca execute comandos de restauração (`wrangler d1 execute`) contra ambientes remotos de produção sem validação prévia em ambiente local ou de homologação.

### Demonstração sintética e testes automatizados

O ciclo completo de backup, alteração de dados, exclusão e restauração com verificação atômica é coberto pelo teste automatizado em `cli/backup-restore.test.ts`:
1. Inicialização de banco SQLite de teste com todas as migrações aplicadas.
2. Inserção de dados sintéticos de espaços, usuários e uma reserva avulsa específica.
3. Execução de `cli backup` em modo WAL ativo e confirmação da integridade do arquivo.
4. Exclusão e alteração de registros no banco ativo.
5. Execução de `cli restore` com confirmação.
6. Validação de integridade pós-restauração, contagens de tabelas e recuperação exata da reserva alvo.
7. Teste de rejeição de arquivo corrompido sem degradar o banco ativo.

Para executar a demonstração e toda a suíte de testes do CLI:
```bash
bun test cli/
```

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

### Regressão das reservas no D1 local

`RUN_D1_TESTS=1 bun test src/infra/db/flow/booking-d1.test.ts` roda criar, conflito, corrida, cancelar e série por posse contra o D1 local (workerd via `getPlatformProxy`, estado em pasta temporária; nada remoto). Sem a variável o teste é pulado, então `bun run check` continua rápido e offline.

### Docker (alvo local)

> Verificado no commit `d84abcc`: o build funciona, o contêiner fica saudável (healthcheck em `/api/health`, que informa o alvo `local`), roda como usuário não root (uid 1000) e o banco persiste no volume nomeado ao reiniciar o contêiner.
>
> A CLI empacotada na imagem (`/app/cli.mjs`, usada em "Primeiro acesso") foi verificada só fora do contêiner (bundle executado com Bun contra um SQLite temporário). [PENDENTE: verificar `docker build`, `docker exec ... create-admin` e login por `curl` no contêiner; Docker estava indisponível.]

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

### Nova versão da grade

Se o semestre já tem um lote aplicado, enviar um arquivo diferente cria uma **nova versão**: a conferência compara o arquivo com as ocupações importadas vigentes e mostra "Nova versão da grade" com os cartões **Inclusões**, **Alterações**, **Bloqueadas**, **Remoções**, **Inalteradas**, **Canceladas mantidas** e **Troca de responsável**, além de "Responsáveis afetados" (nomes das contas locais, para avisar quem tiver aula mexida). Clique num cartão para ver só aquele tipo na tabela; as alterações aparecem lado a lado, "antes → depois", por aula e data.

- **Aplicar mudanças** cancela as ocupações removidas ou alteradas (status `cancelada`, motivo "nova versão"; nada é apagado) e cria as novas. Reservas avulsas nunca são alteradas; uma inclusão que cai sobre uma reserva avulsa vira conflito. Cancelamentos feitos à mão antes continuam cancelados.
- **Alteração bloqueada**: se a nova ocorrência conflita, a versão anterior daquela aula continua ativa e nada daquele grupo é cancelado.
- **Um lote em andamento por semestre.** Enquanto houver um lote `aplicando` ou interrompido (`falhou`), preparar ou aplicar outro é recusado com um aviso e um link para o lote em andamento, com **Retomar** ou **Descartar**. Se outra versão for aplicada depois do seu preparo, a conferência é recusada ("envie o arquivo novamente").
- **Descartar lote** (em `/importar/lotes`, no detalhe do lote e no aviso acima) apaga um lote ainda não aplicado, com confirmação. Vale para lotes preparando e aguardando aplicação, e para os interrompidos só se nada foi aplicado; senão, retome a aplicação.
- Depois de aplicar, o resultado mostra as ocupações canceladas e criadas, trocas de responsável, bloqueadas, conflitos e falhas. A lista de lotes mostra "Nova versão de <data>".

**Limitações conhecidas:** a identidade de uma aula entre versões é o **título (disciplina + turmas) e a data**; os ids do aSc não são usados. Por isso, uma disciplina ou turma renomeada aparece como remoção mais inclusão. Aulas com várias salas continuam "não aplicáveis". Nenhum aviso é enviado aos responsáveis afetados (só a lista); isso vem em fase futura. Se a aula já aplicada passa a ter, na nova versão, horário não aplicável (várias salas, sala sem vínculo, duração sem datas...), as ocupações dela são **seguradas** (não canceladas) e aparecem como alteração bloqueada; só a sala marcada para ignorar continua cancelando. **Voltar a uma versão anterior (rollback) ainda não é suportado:** reenviar o arquivo de uma versão já substituída apenas informa isso; para reaplicá-la, gere uma nova exportação.

O **resultado por linha** (cada aula/ocorrência com estado, motivo, conflito e falha, com filtros, busca e paginação) aparece ao fim e também em **Lotes anteriores** (`/importar/lotes`).

## Licença

[MIT](LICENSE)

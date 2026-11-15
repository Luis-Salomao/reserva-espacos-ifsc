# Instalação e operação

Como instalar, configurar, publicar e manter a ferramenta nos dois alvos (servidor Bun com SQLite e Cloudflare Workers com D1). Para desenvolver no código, veja o [CONTRIBUTING](../CONTRIBUTING.md); para usar as telas, o [guia de uso](guia-de-uso.md).

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

Opções para uso não interativo: `--target local|cloudflare`, `--database-path`, `--timezone`, `--email-provider disabled|resend`, `--email-from`, `--public-origin`, `--yes`, `--force`, `--dry-run` (apenas mostra o plano) e `--help`.

### Alvo local (Bun + SQLite)

`bun run cli init --target local` cria o `.env` (`DEPLOY_TARGET=local`, `DATABASE_PATH`, `TIMEZONE`) e aplica as migrações (`bun run db:migrate`). Em produção (`start:local`), `DATABASE_PATH` é obrigatória e não tem padrão oculto: sem ela, o comando falha informando a variável (o padrão `./data/dev.sqlite` de `settings.ts` vale só em desenvolvimento). O padrão sugerido (`.env.example` e CLI) é `./data/app.sqlite`. Depois:

```bash
bun run build:local
bun run start:local
```

Verifique em `http://localhost:3000/api/health` (com `PUBLIC_READ=false` a resposta informa só o alvo, sem a contagem de espaços).

### Alvo Cloudflare (Workers + D1)

`bun run cli init --target cloudflare` cria o `.dev.vars` (`TIMEZONE` e configuração pública de e-mail, desabilitada por padrão) e executa, em sequência:

1. `wrangler d1 create reserva-espacos` (exige `wrangler login` prévio);
2. pausa para você copiar o `database_id` exibido e colá-lo em `wrangler.jsonc` (`d1_databases[0].database_id`);
3. `bun run cf:check`: aborta se o `wrangler.jsonc` ainda tiver o id provisório `local-placeholder`;
4. `bun run build:cf`;
5. `bun run db:migrate:d1:remote`;
6. `wrangler deploy`.

Com `--yes` o CLI encerra após o `d1 create` e imprime os comandos restantes; se o stdin fechar na pausa, ele avisa que o D1 já foi criado e como retomar. O CLI nunca edita o `wrangler.jsonc` nem grava segredos.

Para publicar de novo depois (sem recriar o banco): `bun run deploy:cf` (verifica o id, compila e publica). Aplique migrações novas com `bun run db:migrate:d1:remote`.

Os scripts `dev:cf` e `preview:cf` definem `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` para o wrangler não injetar o `.env` (que tem `DEPLOY_TARGET=local` e, às vezes, `CLOUDFLARE_*`) no Worker; só `.dev.vars` é lido para o desenvolvimento. Nunca coloque `DEPLOY_TARGET=local` ou `CLOUDFLARE_*` nele.

## E-mail, recuperação de senha e outbox

O envio é opcional: `EMAIL_PROVIDER=disabled` é o padrão. Para habilitar Resend na instalação, informe apenas dados públicos:

```bash
bun run cli init --target local --email-provider resend --email-from reservas@seu-dominio.edu.br --public-origin https://reservas.seu-dominio.edu.br --dry-run --yes
```

Retire `--dry-run` para executar a instalação. Em uma instalação existente, edite a configuração pública em vez de recriar o banco ou sobrescrever `.env`. Use domínio próprio verificado no Resend, aplique os registros DNS exigidos pelo provedor e um remetente autorizado nesse domínio. `PUBLIC_ORIGIN` define a origem aceita nos POST e o atributo `Secure` dos cookies. Em uma instalação atrás de proxy que reescreve o cabeçalho `Origin`, configure nela a origem que o app recebe após essa reescrita. `PUBLIC_LINK_ORIGIN` é opcional e define o domínio usado nos links de e-mail; quando omitida, os links usam `PUBLIC_ORIGIN`. Ambos devem ser origens sem caminho, credenciais ou parâmetros, e usar HTTPS (com exceção de HTTP em localhost/127.0.0.1 no desenvolvimento). Configure `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `PUBLIC_ORIGIN` e, quando houver proxy, `PUBLIC_LINK_ORIGIN` antes de iniciar o servidor.

Forneça `RESEND_API_KEY` e `EMAIL_PAYLOAD_KEY` pelo ambiente protegido do processo. A segunda chave deve conter 32 bytes aleatórios criptograficamente seguros codificados em base64url. Crie e guarde a chave em um gerenciador de segredos; não a inclua em argumentos, logs, capturas de tela ou arquivos versionados. O instalador não solicita nem imprime essas chaves. Se usar `.env` local ou `.dev.vars` para desenvolvimento, proteja o arquivo, mantenha-o fora do Git e separe as credenciais de produção. O servidor e o processo agendado precisam das mesmas chaves e do mesmo banco. Preserve a chave da outbox no procedimento protegido de backup; a perda ou troca da chave impede ler mensagens pendentes antigas.

### Processamento local sem depender de tráfego

As regras de domínio e remetente seguem a documentação de [domínios verificados do Resend](https://resend.com/docs/dashboard/domains/introduction).

Agende `bun run cli email:drain` a cada minuto. No Linux, adicione ao crontab do usuário do serviço, adaptando caminhos absolutos (o cron geralmente tem PATH reduzido):

```cron
* * * * * cd /caminho/reserva-espacos-ifsc && /caminho/bun run cli email:drain
```

No Windows, crie uma tarefa no Agendador de Tarefas com repetição de um minuto, programa apontando para `bun.exe`, argumentos `run cli email:drain` e “Iniciar em” apontando para a pasta da instalação. Execute com o usuário do serviço e acesso ao mesmo ambiente protegido. Não coloque segredos nos argumentos da tarefa. Em contêiner, agende `bun /app/cli.mjs email:drain` num processo com o mesmo volume e variáveis. Não é necessário manter a página aberta nem gerar requisições HTTP. Nenhuma tarefa do sistema operacional é criada pelo instalador.

### Cloudflare Workers e D1

Em produção, coloque somente `EMAIL_PROVIDER`, `EMAIL_FROM`, `PUBLIC_ORIGIN` e, quando necessária, `PUBLIC_LINK_ORIGIN` em `vars` de `wrangler.jsonc`. `.dev.vars` vale somente no desenvolvimento e não configura produção. Em arquitetura com proxy separado, `PUBLIC_ORIGIN` deve corresponder ao `Origin` que o app recebe depois do encaminhamento; `PUBLIC_LINK_ORIGIN` deve apontar para o domínio público que as pessoas acessam. Cadastre os segredos interativamente, sem colocar valores na linha de comando:

```bash
bunx wrangler secret put RESEND_API_KEY
bunx wrangler secret put EMAIL_PAYLOAD_KEY
```

Depois de configurar os dados públicos, segredos e migrações, altere `triggers.crons` de `[]` para `["* * * * *"]` em `wrangler.jsonc` e faça o build e deploy pelo procedimento habitual. O repositório mantém esse gatilho desativado por padrão. O entrypoint `src/worker.ts` preserva o `fetch` do TanStack Start e aguarda o mesmo dispatcher usado pela CLI no Scheduled Handler; ele acessa o binding D1 sem precisar de requisição HTTP. `EMAIL_PROVIDER=disabled` não envia mensagens nem faz chamadas ao Resend. Referências: [entrypoints TanStack no Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#custom-entrypoints) e [Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).

Antes de ativar o processamento da outbox, execute `bun run cli email:check`. O diagnóstico verifica a configuração sem enviar mensagens, consultar o banco ou imprimir chaves. Credenciais aceitas pelo Resend, domínio e entrega precisam ser conferidos no provedor. Na imagem Docker, use `bun /app/cli.mjs email:check`.

### Entrega e diagnóstico

Notificações de criação, edição e cancelamento referem-se às reservas manuais. Aulas importadas do aSc não geram essas notificações.

Reservas e solicitações de recuperação não aguardam disponibilidade do Resend. Mensagens ficam numa outbox persistente com payload criptografado, lease, tentativas limitadas, backoff e chave de idempotência. Mensagens concluídas ou expiradas têm o payload removido. O link de recuperação expira em 20 minutos, funciona uma vez e não autentica automaticamente; a troca encerra sessões anteriores. A tela mantém resposta genérica para não revelar contas existentes.

Se nada chega, confirme o provedor ativo, as quatro configurações exigidas, a origem, o domínio/remetente verificado e a execução do agendador ou Cron Trigger. Verifique limites e recusas do provedor e o horário da última execução. Se a fila cresce, confirme que servidor e dispatcher usam o mesmo banco e chave de payload; examine apenas estado, contagens e horários da fila. Nunca imprima payloads, destinatários, links, tokens ou chaves ao investigar. Após falha transitória, o dispatcher tenta novamente conforme backoff; após expiração, solicite um novo link. Desabilitar o provedor suspende envio, sem prometer entrega de mensagens que já expiraram.

Importante: o build (`build:cf`) grava `.wrangler/deploy/config.json`, que faz o `wrangler deploy` usar o snapshot `dist/server/wrangler.json` gerado a partir do `wrangler.jsonc`. Por isso o `database_id` deve ser colado **antes** do build, e os scripts de migração D1 usam `--config wrangler.jsonc` explicitamente, para que a fonte da verdade seja sempre o `wrangler.jsonc`.

## Segurança

Dados reais (`data/`), arquivos `.env`, `.dev.vars` e bancos SQLite nunca entram no Git. O hook de pre-commit executa o Betterleaks nos arquivos em stage e rejeita o commit se encontrar segredos. Para varrer o histórico: `bun run secrets`.

O cookie de sessão (`sid`) é `HttpOnly; SameSite=Lax` e leva `Secure`, exceto em `http://localhost` e `http://127.0.0.1`. A variável opcional `COOKIE_SECURE` muda isso: `auto` (padrão), `true` (sempre Secure) ou `false` (nunca). **Use `false` só em rede local sem HTTPS**; em produção mantenha `auto` ou `true`. Ao entrar de novo, a sessão anterior do navegador é revogada.

### Atrás de proxy reverso com TLS

O servidor não confia em `X-Forwarded-*`. Atrás de um proxy que termina o TLS (ele fala HTTP com o app), configure `PUBLIC_ORIGIN` conforme o cabeçalho `Origin` que chega ao app: se o proxy o preserva, use a origem pública, sem caminho, por exemplo `https://reservas.campus.edu.br`; se o proxy o reescreve para a origem upstream, use essa origem upstream. Nos dois casos, `PUBLIC_ORIGIN` define o valor exato aceito nos POST (proteção CSRF) e o cookie de sessão leva `Secure` quando a origem configurada usa `https` (isso prevalece sobre `COOKIE_SECURE`). Sem `PUBLIC_ORIGIN`, vale o comportamento anterior (origem da própria requisição). O proxy deste projeto valida o domínio público `https://reservas-ifsc.luissalomao.dev` e reescreve `Origin` para `https://reserva-espacos-ifsc.luis-salomao.workers.dev`; por isso o app usa o host upstream em `PUBLIC_ORIGIN` e o domínio público em `PUBLIC_LINK_ORIGIN`, para montar links de e-mail. A configuração de produção não foi verificada. Exemplos genéricos de proxy que preservam `Origin`:

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

## Docker (alvo local)

> Verificado no commit `d84abcc`: o build funciona, o contêiner fica saudável (healthcheck em `/api/health`, que informa o alvo `local`), roda como usuário não root (uid 1000) e o banco persiste no volume nomeado ao reiniciar o contêiner.
>
> A CLI empacotada na imagem (`/app/cli.mjs`, usada em "Primeiro acesso") foi verificada só fora do contêiner (bundle executado com Bun contra um SQLite temporário). [PENDENTE: verificar `docker build`, `docker exec ... create-admin` e login por `curl` no contêiner; Docker estava indisponível.]

```bash
docker build -t reserva .
docker run -p 3000:3000 -v reserva-data:/data reserva
```

Use de preferência um volume nomeado em `/data`. Se montar uma pasta do host (bind mount), ela precisa ser gravável pelo uid do usuário `bun` da imagem (1000).

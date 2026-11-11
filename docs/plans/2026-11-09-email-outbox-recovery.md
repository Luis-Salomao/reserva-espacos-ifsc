# E-mail transacional e recuperação de senha

Escopo aprovado: outbox persistente, adaptador Resend, configuração opcional na instalação e recuperação de senha por e-mail; notificações de criação, edição e cancelamento de reservas.

## Contratos e decisões

- Aplicação depende de portas; Resend, criptografia e SQLite/D1 são adaptadores. Sem dependência nova para enviar HTTP.
- `src/application/email-ports.ts`: `EmailMessage { to: string; subject: string; text: string }`, `OutboxWrite { id: string; payload: string; createdAt: string; expiresAt: string }`, `EmailPayloadCodec { seal(message: EmailMessage): Promise<string>; open(payload: string): Promise<EmailMessage> }`, `EmailSender { send(message: EmailMessage, idempotencyKey: string): Promise<void> }`.
- Payload de toda mensagem criptografado com AES-GCM antes de entrar na outbox. `EMAIL_PAYLOAD_KEY` fora do banco, obrigatório quando o envio está ativo. Token de recuperação não aparece em texto aberto no banco, logs ou saída CLI; tabela de recuperação guarda somente seu hash. Payload criptografado é removido ao concluir/expirar.
- `src/infra/email/config.ts`: `getEmailConfig(source)` retorna null se `EMAIL_PROVIDER=disabled` (padrão) ou `{ provider: 'resend', apiKey, from, publicOrigin, payloadKey }`. Exige `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_ORIGIN` absoluta confiável e `EMAIL_PAYLOAD_KEY` base64url de 32 bytes. HTTP permitido somente em localhost/127.0.0.1. Não revelar valores inválidos.
- Recuperação: token aleatório 32 bytes, SHA-256, expiração de 20 minutos, uso único; consumo, troca do hash da senha e revogação das sessões na mesma transação. Resposta genérica para conta inexistente/inativa/fantasma/desabilitado. Rate limit persistente por identificador e cliente, sem bloquear login. Link usa origem configurada e fragmento para evitar token em access logs; POST recebe token no corpo. Sem login automático.
- Outbox: lease com token de posse, retries limitados com backoff, expiração e chave estável de idempotência. Confirmação de reserva e recuperação não dependem da disponibilidade do Resend.
- Operação: comando `email:drain` para cron/Task Scheduler local e Worker com Scheduled Handler usando o mesmo dispatcher. Sem disparos reais, cron remoto ou deploy durante implementação.
- Instalação: modo opcional, configuração pública impressa sem chaves. Segredos fornecidos por ambiente/secrets, nunca argumentos com chave nem arquivo versionado.

## Tarefas

- [x] Implementar portas, outbox, dispatcher, Resend e criptografia com testes red/green.
- [x] Implementar recuperação e telas com testes de expiração, reutilização, corrida, anonimato e invalidação de sessões.
- [x] Integrar configuração CLI e notificações persistentes de reservas manuais.
- [x] Executar testes dirigidos, gate completo, builds local/Cloudflare e revisões.

Preservar alterações anteriores. Baseline conhecido da sessão: build local passa, suíte 1744 pass/2 skip/18 fail; lint/typecheck do gate geral falham nos testes challenger/e2e preexistentes. Não corrigir esses arquivos fora do escopo.

## Evidências e limites da entrega

- Builds local e Cloudflare concluídos sem publicação; tipos do Worker e rotas regenerados.
- Testes dirigidos finais de e-mail, outbox, recuperação e CLI: 28 passaram, zero falhas, 173 verificações em 10 arquivos. Testes D1 local habilitados: 2 passaram, 18 verificações, incluindo outbox criptografada de reservas e recuperação atômica. Nenhum D1 remoto foi acessado.
- Suíte completa antes do diagnóstico adicional `email:check`: 1773 passaram, 3 ignorados e 18 falharam. Mesmos grupos preexistentes challenger/e2e; o gate geral segue não aprovado. Typecheck final tem erros somente nesses arquivos preexistentes, sem diagnóstico em src ou cli. Lint direcionado dos arquivos alterados, dependency-cruiser, Knip e diff-check passaram.
- Migrações 0011 e 0012 acompanhadas de snapshots encadeados gerados pela API do Drizzle. Comparação entre snapshot final e modelo atual não gera migração adicional. Esquema de usuários extraído para módulo independente para declarar a FK de recuperação sem ciclo.
- Revisão independente identificou corrida na preparação do e-mail de cancelamento: corrigida por comparação do snapshot no UPDATE, com regressão red/green e re-revisão. Revisão da recuperação identificou KDF público sem limite: corrigido por admissão persistente por cliente e token e elegibilidade barata antes do cálculo da senha; consumo continua protegido atomicamente. Teste com 35 tokens aleatórios não executa KDF.
- Interface local conferida com banco fictício: pedido de recuperação retorna mensagem genérica; formulário de nova senha lê e remove o fragmento da URL. Nenhuma senha real foi alterada e nenhum e-mail real foi enviado.
- CLI oferece `init` opcional, `email:check` sem rede/banco/exposição de segredos e `email:drain --once` para agendamento, inclusive no entry Docker. Workers usam Scheduled Handler, com cron desativado por padrão.
- Pendente para ativação real: domínio/remetente verificados no Resend, secrets, configuração pública, agendamento e publicação. Rotacionar EMAIL_PAYLOAD_KEY invalida mensagens pendentes cifradas pela chave anterior; manter a chave no ambiente protegido e nas rotinas de recuperação da instalação.
- Notificações desta versão cobrem reservas manuais; importação de grade não dispara mensagens em massa.
- Feature futura de solicitação de liberação registrada separadamente em https://github.com/Luis-Salomao/reserva-espacos-ifsc/issues/2; não implementada nesta entrega.

Sem commit, push, migração remota, envio real ou agendamento de tarefa do sistema operacional.

## Atualização do gate após correção dos testes

Em 09/11/2026, o gate `bun run check` passou integralmente com exit code 0: lint, TypeScript, Knip, dependências, cobertura e Betterleaks. Resultado: 1794 testes passaram, nenhum falhou e 3 testes D1 ficaram condicionais no comando padrão. Executados separadamente com `RUN_D1_TESTS=1`, os três testes D1 locais passaram (25 verificações), sem acesso remoto. Cobertura agregada: 99,76% de funções e 99,61% de linhas, mantendo os limites existentes.

As 18 falhas anteriores foram resolvidas corrigindo fixtures, asserções tipadas de sucesso/falha, seletores de interface e metadados dos backups sintéticos. O TypeScript agora inclui `test/**/*.tsx`. Testes adicionais verificam a composição real do e-mail com banco descartável e sem rede; os wrappers de composição e de funções Start da recuperação seguem o mesmo escopo de cobertura dos wrappers já existentes. Não foram desabilitados testes nem reduzidos os limites de cobertura.

## Publicação autorizada

Em 09/11/2026, publicação solicitada pelo autor concluída no Worker `reserva-espacos-ifsc`, em https://reserva-espacos-ifsc.luis-salomao.workers.dev. Versão `9d0f7686-6281-4f65-b032-ccc088310946` com 100% do tráfego. Versão anterior: `640fa2a2-8a93-4afe-8cc4-02843b1d32b8`.

Build Cloudflare e dry-run aprovados. Migrações remotas 0011 e 0012 aplicadas com sucesso no D1 configurado; lista posterior sem migrações pendentes. Ponto de restauração D1 registrado antes da aplicação. Verificação pública: `/api/health` HTTP 200 com `ok:true` e `target:cloudflare`; `/` e `/recuperar-senha` HTTP 200. Recuperação confirma envio de e-mail desabilitado. `EMAIL_PROVIDER=disabled`, sem ativação do Resend ou cron e sem disparos de e-mail. Publicação feita a partir do workspace validado, sem commit ou push.

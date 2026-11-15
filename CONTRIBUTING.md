# Desenvolvimento e contribuição

Guia para quem vai ler, rodar ou alterar o código. A instalação em produção está em
[docs/instalacao-e-operacao.md](docs/instalacao-e-operacao.md) e o uso das telas em
[docs/guia-de-uso.md](docs/guia-de-uso.md).

## Rodar em desenvolvimento

Pré-requisitos: [Bun](https://bun.sh) 1.4 ou superior e o [Betterleaks](https://github.com/betterleaks/betterleaks), usado pelos ganchos do Git (instalação em [docs/instalacao-e-operacao.md](docs/instalacao-e-operacao.md#pré-requisitos)).

```bash
git clone <url-do-repositorio> && cd reserva-espacos-ifsc
bun install
bun run db:migrate     # cria data/ e o banco ./data/dev.sqlite
bun dev                # http://localhost:3000
```

Não é preciso criar `.env` nem passar variáveis: os valores não secretos ficam em `src/infra/settings.ts` (versionado). Prioridade: variável de ambiente (`.env` incluído) > `settings.ts` > padrão do código. `DEPLOY_TARGET=local` e `DATABASE_PATH=./data/dev.sqlite` valem como padrão só no desenvolvimento local; com `NODE_ENV=production` (como em `start:local` e no Docker) `DATABASE_PATH` continua obrigatória, e no alvo Cloudflare não há padrão. Segredos (`PASSWORD_PEPPER`, `RESEND_API_KEY`, `EMAIL_PAYLOAD_KEY`, `PUBLIC_ORIGIN`) nunca vão em `settings.ts`; veja `.env.example` para todos os nomes.

### Alvo Cloudflare (Workers + D1) em desenvolvimento

```bash
bun run db:migrate:d1:local   # aplica as migrações no D1 local (miniflare); rode antes do dev:cf
bun run dev:cf                # Vite + Workers
bun run preview:cf            # build:cf + wrangler dev
```

### Regressão das reservas no D1 local

`RUN_D1_TESTS=1 bun test src/infra/db/flow/booking-d1.test.ts` roda criar, conflito, corrida, cancelar e série por posse contra o D1 local (workerd via `getPlatformProxy`, estado em pasta temporária; nada remoto). Sem a variável o teste é pulado, então `bun run check` continua rápido e offline.

## Arquitetura

Um só projeto TanStack Start com interface e servidor. As pastas de `src/` seguem camadas
(arquitetura hexagonal); o `dependency-cruiser` (`bun run check`) impede que uma camada importe outra
fora da ordem, por exemplo que o domínio dependa do banco ou que a interface fale direto com ele.

```
src/
├── domain/        regras puras (horários, disponibilidade, papéis, pedidos); não importa nada de fora
├── application/   casos de uso (reservas, importação, contas, avisos) e as portas que a infra implementa
├── infra/         banco (Drizzle: SQLite local e D1), e-mail, autenticação, configuração
├── import-asc/    leitura e normalização do XML do aSc Horários
├── server/        funções de servidor: sessão, controle de acesso e ligação com os casos de uso
├── routes/        páginas (roteamento por arquivo do TanStack Router)
├── components/    interface em React (agenda, salas, administração, componentes base em ui/)
├── styles/        tokens de cor e tema
├── lib/           utilitários da interface
├── integrations/  provedor e devtools do TanStack Query
├── start.ts       entrada do servidor (alvo local)
└── worker.ts      entrada do Cloudflare Worker
cli/               comandos de linha (criar admin, cópia e restauração, prévia de importação, e-mail)
scripts/           apoio ao build e aos testes
drizzle/           migrações do banco
docs/              especificações, decisões e planos (índice em docs/README.md)
test/              apoio compartilhado dos testes: setup do DOM, fixtures do aSc, utilitários e e2e
```

Os testes ficam ao lado do arquivo testado (`booking-sheet.tsx` e `booking-sheet.test.tsx`). A pasta
`test/` guarda só o que vários testes usam; os utilitários dela são importados como `#test/...`.

## Qualidade e testes

`bun run check` é o gate do projeto. Ele roda, nesta ordem:

1. **Biome:** formatação e lint.
2. **TypeScript:** checagem de tipos (`tsc --noEmit`).
3. **knip:** arquivos, exportações e dependências sem uso.
4. **dependency-cruiser:** regras de arquitetura entre as camadas.
5. **bun test com cobertura:** falha abaixo de 90% de linhas ou de funções.
6. **Betterleaks:** varredura de segredos no histórico do Git.

O mesmo gate (menos o Betterleaks, que roda nos ganchos locais) roda no GitHub Actions a cada push
(`.github/workflows/check.yml`).

**O que a cobertura mede.** A meta de 90% vale para as camadas sem interface: `domain/`,
`application/`, `infra/`, `import-asc/`, as ações de `server/` e a lógica pura de `cli/` (veja
`coveragePathIgnorePatterns` em `bunfig.toml`). Os arquivos que só ligam peças (funções de servidor
que delegam, composição do Worker) ficam de fora com o motivo anotado ao lado. A interface
(`components/` e `routes/`) tem testes de componente e de rota, rodados com happy-dom, mas **não
entra na métrica de cobertura**.

### Testes de ponta a ponta e no D1

- `test/e2e/`: cenários que atravessam várias telas e regras, em quatro níveis
  (funcionalidades, limites, combinações e cenários de uso).
- `RUN_D1_TESTS=1 bun test src/infra/db/flow/booking-d1.test.ts`: as mesmas regras de reserva contra o
  D1 local (veja acima).

### Cópia e restauração ponta a ponta

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

# Docentes do XML: tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/docentes-do-xml/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md` do repositório do TCC (fila e `bun run check`), `package.json` (`check` = lint + typecheck + knip + depcruise + cobertura + betterleaks), `bunfig.toml` (cobertura mínima de 90%, `src/components/**` fora da cobertura).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain | unit | Todos os ramos; 1:1 com os ACs; todos os edge cases | `src/domain/*.test.ts` | `bun test src/domain` |
| Import XML | unit | Campos lidos e campos descartados | `src/import-asc/*.test.ts` | `bun test src/import-asc` |
| Application service | unit | Todos os ramos; 1:1 com os ACs; erros | `src/application/*.test.ts` | `bun test src/application` |
| Repository | integration | Consultas principais + atomicidade (bun:sqlite real) | `src/infra/db/**/*.test.ts` | `bun test src/infra` |
| Server action | unit | Papéis (403), validação de entrada, caminho feliz | `src/server/*.test.ts` | `bun test src/server` |
| Component | unit | Render, interação e regra de visitante (happy-dom) | `src/components/**/*.test.tsx`, `test/components/*.test.tsx` | `bun test src/components test/components` |
| Migration / schema | integration | Coluna existe com default (teste de schema) | `src/infra/db/*.test.ts` | `bun test src/infra/db` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefa com testes unitários | `bun test <pastas da tarefa>` |
| Full | Tarefa com repositório ou migração | `bun test` |
| Build | Fim de fase | `bun run check` |

---

## Execution Plan

### Phase 1: Modelo e XML

```
T1 → T2 → T3 → T4
```

### Phase 2: Fantasmas na importação

```
T5 → T6 → T7 → T8
```

### Phase 3: Avatar e responsáveis

```
T9 → T10 → T11 → T12 → T13
```

### Phase 4: Administração

```
T14 → T15 → T16
```

---

## Task Breakdown

### T1: Coluna `placeholder` em contas

**What**: Migração `0008` com `users.placeholder` (default 0), campo no schema, `User.placeholder` no domínio e leitura/escrita no repositório de contas.
**Where**: `src/infra/db/schema.ts` (+ `drizzle/0008_*.sql` gerado, `src/domain/user.ts`, `src/infra/db/repos/user-repository.ts`)
**Depends on**: None
**Reuses**: padrão das migrações `0001`–`0007`
**Requirement**: DOC-03

**Done when**:

- [x] `bun run db:generate` gera a migração; aplica em bun:sqlite e D1 local
- [x] Contas existentes leem `placeholder = false`
- [x] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(contas): marca de conta fantasma`

---

### T2: Login recusa conta fantasma

**What**: Fantasma não abre sessão; resposta e custo iguais aos de senha errada.
**Where**: `src/application/auth.ts`
**Depends on**: T1
**Reuses**: ramo de credencial inválida existente
**Requirement**: DOC-10

**Done when**:

- [x] Teste: fantasma com senha "correta" recebe a mesma falha de credencial inválida
- [x] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(auth): conta fantasma não entra`

---

### T3: Nome do docente no XML

**What**: `Teacher` ganha `name` (`name`, senão `firstname lastname`, senão sigla); prévia leva o nome; seção 7.2 da spec original cita AD-001.
**Where**: `src/import-asc/normalize.ts` (+ `src/domain/timetable.ts`, `src/server/import-preview-view.ts`, `docs/specs/2026-11-01-reserva-espacos-design.md`)
**Depends on**: T2
**Reuses**: `readSection`
**Requirement**: DOC-01

**Done when**:

- [x] Teste: XML sintético com nome, e-mail, celular, gênero e cor gera DTO só com `id`, `short` e `name`
- [x] Teste: fallback `firstname lastname` e sigla
- [x] Gate check passes: `bun test src/import-asc src/server`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(importar): lê o nome do docente do XML`

---

### T4: `guessEmail`

**What**: Função pura que gera `primeiro.ultimo@ifsc.edu.br` sem acento, com sufixo em colisão e fallbacks.
**Where**: `src/domain/guess-email.ts`
**Depends on**: T3
**Reuses**: `normalizeEmail`, `isValidEmail` de `src/domain/user.ts`
**Requirement**: DOC-03

**Done when**:

- [x] Testes: acentos, nome de uma palavra, nome vazio (`docente.ID@`), colisão `2` e `3`, resultado sempre válido
- [x] Gate check passes: `bun test src/domain`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(contas): e-mail presumido para docente`

---

### T5: Gravação atômica de fantasmas e vínculos

**What**: `TeacherMappingRepository.saveWithPlaceholders(placeholders, mappings, at)` cria contas e grava vínculos numa só transação.
**Where**: `src/infra/db/repos/mapping-repositories.ts` (+ porta em `src/application/ports.ts`)
**Depends on**: None
**Reuses**: `runAtomically`, upsert de `saveMany`
**Requirement**: DOC-03, DOC-04

**Done when**:

- [x] Teste: contas e vínculos gravados juntos
- [x] Teste: e-mail duplicado no meio do lote não deixa nenhuma conta nem vínculo
- [x] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(importar): grava fantasmas e vínculos juntos`

---

### T6: `saveTeachers` cria fantasmas

**What**: Itens com `createPlaceholder` viram fantasmas (e-mail presumido, sigla como código se livre, papel `docente`, hash aleatório); fantasma existente com o mesmo código é reaproveitada.
**Where**: `src/application/import-mappings.ts`
**Depends on**: T5
**Reuses**: validações atuais de `saveTeachers`
**Requirement**: DOC-03, DOC-04

**Done when**:

- [x] Testes: criação, colisão de e-mail, código ocupado vira `null`, reaproveita fantasma, `userId` + `createPlaceholder` juntos é erro
- [x] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(importar): cria contas fantasmas ao salvar docentes`

---

### T7: Sugestão padrão "Criar conta fantasma"

**What**: `suggestTeachers` devolve `name` e `defaultAction`; ação de servidor aceita `createPlaceholder`.
**Where**: `src/application/import-mappings.ts` (+ `src/server/import-actions.ts`)
**Depends on**: T6
**Reuses**: `suggestTeachers`
**Requirement**: DOC-02

**Done when**:

- [x] Testes: sem vínculo e sem sugestão → `fantasma`; com sugestão → `sugestao`; salvo → `salvo`
- [x] Teste de ação: entrada inválida recusada
- [x] Gate check passes: `bun test src/application src/server`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(importar): docente sem conta vira fantasma por padrão`

---

### T8: Opção no passo de docentes

**What**: Seletor de cada docente mostra nome e sigla, com "Criar conta fantasma" pré-selecionado quando `defaultAction = fantasma`.
**Where**: `src/components/import/mapping-steps.tsx` (+ `src/components/import/flow-helpers.ts`)
**Depends on**: T7
**Reuses**: `teacherMappingsToSave`
**Requirement**: DOC-02

**Done when**:

- [x] Teste: `teacherMappingsToSave` gera `createPlaceholder` com o nome
- [x] Gate check passes: `bun test src/components test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(importar): escolha de conta fantasma no passo de docentes`

---

### T9: `setResponsibles` no repositório

**What**: Atualiza `responsible_user_id` por aula no intervalo do semestre, só importadas ativas, em blocos atômicos de 50; devolve quantas mudaram.
**Where**: `src/infra/db/repos/import-repository.ts` (+ porta)
**Depends on**: None
**Reuses**: `runAtomically`
**Requirement**: DOC-08

**Done when**:

- [ ] Testes: avulsa e cancelada intocadas; fora do semestre intocada; repetir não muda nada
- [ ] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(importar): reaplica responsáveis por aula`

---

### T10: `refreshResponsibles` no serviço

**What**: Valida hash = último lote aplicado, calcula `lessonId → userId` com `responsibleOf` e os vínculos atuais e chama `setResponsibles`.
**Where**: `src/application/import-apply.ts`
**Depends on**: T9
**Reuses**: `responsibleOf`, `loadMaps`, `latestAppliedBatchId`
**Requirement**: DOC-08, DOC-09

**Done when**:

- [ ] Testes: hash diferente recusa sem escrita; resultado com `changed` e `withoutResponsible`; idempotente
- [ ] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(importar): atualizar responsáveis da versão aplicada`

---

### T11: Ação e botão "Atualizar responsáveis"

**What**: Server fn (admin e horários), botão na página do lote aplicado com envio do XML e resumo do resultado.
**Where**: `src/server/import-actions.ts` (+ `src/server/import-fns.ts`, `src/routes/importar.lotes.$id.tsx`)
**Depends on**: T10
**Reuses**: leitura de XML do fluxo de importação
**Requirement**: DOC-08, DOC-09

**Done when**:

- [ ] Teste de ação: 403 para docente; caminho feliz
- [ ] Gate check passes: `bun test src/server src/routes`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(importar): botão para atualizar responsáveis`

---

### T12: `AgendaPerson.placeholder`

**What**: `peopleFor` inclui `placeholder`; visitante continua sem pessoas.
**Where**: `src/application/bookings.ts`
**Depends on**: T11
**Reuses**: `peopleFor`
**Requirement**: DOC-06, DOC-07

**Done when**:

- [ ] Testes: logado recebe `placeholder`; visitante recebe `person: null`
- [ ] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): marca de conta fantasma no responsável`

---

### T13: Avatar no cartão e selo nos detalhes

**What**: `OccupationCard` mostra `Avatar xs` quando há pessoa (só avatar em cartão baixo, nome no rótulo acessível); detalhes mostram "conta não ativada".
**Where**: `src/components/agenda/agenda-blocks.tsx` (+ `src/components/agenda/occupation-details.tsx`)
**Depends on**: T12
**Reuses**: `Avatar`
**Requirement**: DOC-05, DOC-06, DOC-07

**Done when**:

- [ ] Testes: avatar com pessoa; nenhum avatar com `person: null`; cartão baixo com rótulo acessível; selo em fantasma
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): avatar do responsável nas aulas`

---

### T14: Ativar e fundir no repositório

**What**: `activatePlaceholder(id, email, hash)` e `mergeInto(fromId, toId)` atômico (ocupações, vínculos, sessões, apaga a conta).
**Where**: `src/infra/db/repos/user-repository.ts` (+ porta)
**Depends on**: None
**Reuses**: `runAtomically`
**Requirement**: DOC-10, DOC-11

**Done when**:

- [ ] Testes: fusão move responsável e `created_by` e vínculos e apaga a fantasma; ativação remove a marca
- [ ] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(contas): ativar e fundir conta fantasma no banco`

---

### T15: Ativar e fundir no serviço e nas ações

**What**: Regras (só admin, e-mail único, senha válida, alvo não fantasma e ativo) e server fns.
**Where**: `src/application/users.ts` (+ `src/server/admin-actions.ts`, `src/server/admin.ts`)
**Depends on**: T14
**Reuses**: validações de `createAccount` e `resetPassword`
**Requirement**: DOC-10, DOC-11

**Done when**:

- [ ] Testes: e-mail em uso, alvo fantasma, alvo inativo, não admin (403), caminhos felizes
- [ ] Gate check passes: `bun test src/application src/server`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(contas): regras para ativar e fundir fantasma`

---

### T16: Contas fantasmas na administração

**What**: Selo "Não ativada", filtro "Só não ativadas", diálogos Ativar (e-mail + senha) e Fundir (escolha da conta).
**Where**: `src/components/admin/accounts-manager.tsx`
**Depends on**: T15
**Reuses**: diálogos atuais de conta
**Requirement**: DOC-10, DOC-11

**Done when**:

- [ ] Testes: selo, filtro, envio dos dois diálogos
- [ ] Gate check passes: `bun test src/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(admin): ativar ou fundir conta fantasma`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 → T2 → T3 → T4
Phase 2:  T5 → T6 → T7 → T8
Phase 3:  T9 → T10 → T11 → T12 → T13
Phase 4:  T14 → T15 → T16
```

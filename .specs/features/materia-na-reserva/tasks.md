# Matéria na reserva: tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/materia-na-reserva/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `package.json` (`check`), `bunfig.toml` (cobertura de 90%, `src/components/**` fora).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain | unit | Todos os ramos; busca sem acento; `exact` | `src/domain/*.test.ts` | `bun test src/domain` |
| Application service | unit | Grupos, sem repetição, ordem, visitante recusado, escolha de semestre | `src/application/*.test.ts` | `bun test src/application` |
| Repository | integration | Distintos, só importadas ativas no intervalo | `src/infra/db/**/*.test.ts` | `bun test src/infra` |
| Server action | unit | Sem sessão recusa; caminho feliz | `src/server/*.test.ts` | `bun test src/server` |
| Component | unit | Grupos, filtro, título livre, erro de carga, validação | `test/components/*.test.tsx` | `bun test test/components` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefa com testes unitários | `bun test <pastas da tarefa>` |
| Full | Tarefa com repositório | `bun test` |
| Build | Fim da feature | `bun run check` |

---

## Execution Plan

### Phase 1: Catálogo

```
T1 → T2 → T3 → T4
```

### Phase 2: Interface

```
T5 → T6
```

---

## Task Breakdown

### T1: `listImportedTitles`

**What**: Pares distintos `(title, responsibleUserId)` das importadas ativas num intervalo.
**Where**: `src/infra/db/repos/occupation-repository.ts` (+ porta)
**Depends on**: None
**Reuses**: filtros de `listActiveInRange`
**Requirement**: MAT-01

**Done when**:

- [ ] Teste: exclui avulsas, canceladas e fora do intervalo; sem duplicatas
- [ ] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(reserva): catálogo de matérias importadas`

---

### T2: `bookings.subjects`

**What**: `{ mine, all }` para a data, sem repetição e em ordem pt-BR; visitante recusado.
**Where**: `src/application/bookings.ts`
**Depends on**: T1
**Reuses**: regra de semestre de `blocksFor`
**Requirement**: MAT-01, MAT-02

**Done when**:

- [ ] Testes: `all` sem itens de `mine`; sem aulas → `mine` vazio; data fora de semestre usa o mais recente; visitante `forbidden`
- [ ] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(reserva): matérias do docente e de todos`

---

### T3: `getSubjectsFn`

**What**: Ação e server fn com sessão obrigatória.
**Where**: `src/server/booking-actions.ts` (+ `src/server/booking-fns.ts`)
**Depends on**: T2
**Reuses**: padrão de `myBookings`
**Requirement**: MAT-01

**Done when**:

- [ ] Teste de ação: sem sessão recusa; data inválida; caminho feliz
- [ ] Gate check passes: `bun test src/server`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(reserva): server fn de matérias`

---

### T4: `text-match`

**What**: `normalizeText` e `matchSubjects` (filtro sem acento e caixa, `exact`).
**Where**: `src/domain/text-match.ts`
**Depends on**: T3
**Reuses**: nada
**Requirement**: MAT-02, MAT-04

**Done when**:

- [ ] Testes: acentos, caixa, espaços nas pontas, `exact` só com igualdade após normalizar
- [ ] Gate check passes: `bun test src/domain`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(reserva): busca de matérias sem acento`

---

### T5: `SubjectCombobox`

**What**: Campo pesquisável com grupos, "Usar “texto” como título", erro de carga vira entrada livre, alvos de 44 px e largura total no celular.
**Where**: `src/components/agenda/subject-combobox.tsx`
**Depends on**: None
**Reuses**: `Popover`, `Input`, `matchSubjects`
**Requirement**: MAT-01, MAT-02, MAT-03, MAT-04

**Done when**:

- [ ] Testes: grupos e ocultação de "Minhas", filtro, escolha, título livre, falha de carga
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(reserva): campo de matéria com busca`

---

### T6: Combobox no `BookingSheet`

**What**: Troca o input de `purpose` pelo combobox, rótulo "Matéria ou título", mensagem de vazio; ajusta testes existentes.
**Where**: `src/components/agenda/booking-sheet.tsx`
**Depends on**: T5
**Reuses**: validação atual de `purpose`
**Requirement**: MAT-01, MAT-05

**Done when**:

- [ ] Testes: reserva com matéria escolhida; com título livre; vazio bloqueia; longo mostra a mensagem atual
- [ ] Gate check passes: `bun run check`

**Tests**: unit
**Gate**: build

**Commit**: `feat(reserva): escolher a matéria na nova reserva`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 → T2 → T3 → T4
Phase 2:  T5 → T6
```

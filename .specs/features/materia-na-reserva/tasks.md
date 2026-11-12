# Matéria na reserva: tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/materia-na-reserva/design.md`
**Status**: Em execução

## Desvios (reconciliação com o código de 2026-11-05)

A spec foi escrita antes da página única `/`, da seção "Repetir" e da administração de espaços. Ajustes, sem mudar a ordem T1–T6:

- A habilidade `tlc-spec-driven` citada no protocolo não está disponível neste ambiente. As tarefas seguem o fluxo do repositório: spec, testes, um commit por tarefa e as lições de `.specs/LESSONS.md`.
- O campo continua depois de "Repetir" (onde estava "Finalidade"). A ordem entre "Repetir" e "Matéria ou título", e entre os dois grupos, se afirma com `compareDocumentPosition`.
- A lista é inline (`w-full`, `min-h-11`), não um Popover de largura fixa: o AC pede a lista logo abaixo do campo, na largura da folha. O desenho citava Popover.
- A recarga é por mudança de data, não só por mudança de semestre: o cliente não conhece os limites do semestre. O servidor continua escolhendo o semestre como `blocksFor`.
- O texto do campo já é o título (como a finalidade era). A opção "Usar “texto” como título" grava o texto aparado. O `maxLength` sai para a mensagem de 120 caracteres poder aparecer.
- MAT-06: o mesmo título segue na prévia e na confirmação da série. Não há campo de finalidade separado.
- Atalhos (Seta baixo, Seta cima, Enter, Esc) entram no AC 7–9 e no teste do combobox.
- "Minhas matérias" some também quando o filtro esvazia o grupo. A ausência é do elemento, não só do texto.

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

- [x] Teste: exclui avulsas, canceladas e fora do intervalo; sem duplicatas
- [x] Gate check passes: `bun test src/infra/db/flow/occupation-repository.test.ts`

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

- [x] Testes: `all` sem itens de `mine`; sem aulas → `mine` vazio; data fora de semestre usa o mais recente; visitante `forbidden`
- [x] Gate check passes: `bun test src/application/bookings.test.ts`

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

- [x] Teste de ação: sem sessão recusa; data inválida; caminho feliz (afirma a data enviada ao serviço)
- [x] Gate check passes: `bun test src/server/booking-actions.test.ts`

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

- [x] Testes: acentos, caixa, espaços nas pontas, `exact` só com igualdade após normalizar
- [x] Gate check passes: `bun test src/domain/text-match.test.ts`

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

- [x] Testes: grupos e ocultação de "Minhas" (elemento ausente), filtro, escolha, título livre, falha de carga (lista ausente), atalhos, ordem dos grupos, `min-h-11` e `w-full`, argumento enviado ao `loadFn`
- [x] Gate check passes: `bun test test/components/subject-combobox.test.tsx`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(reserva): campo de matéria com busca`

---

### T6: Combobox no `BookingSheet`

**What**: Troca o input de `purpose` pelo combobox, rótulo "Matéria ou título", mensagem de vazio; o mesmo título vai na série; ajusta testes existentes.
**Where**: `src/components/agenda/booking-sheet.tsx`
**Depends on**: T5
**Reuses**: validação atual de `purpose` (mensagem de tamanho) e a seção "Repetir"
**Requirement**: MAT-01, MAT-05, MAT-06

**Done when**:

- [x] Testes: reserva com matéria escolhida; com título livre; vazio bloqueia com "Informe a matéria ou o título"; longo mostra "A finalidade deve ter no máximo 120 caracteres."; a série recebe o mesmo título; "Matéria ou título" vem depois de "Repetir"
- [x] Gate check passes: `bun test test/components/booking-sheet.test.tsx test/components/booking-sheet-repeat.test.tsx test/components/rooms-view.test.tsx`

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

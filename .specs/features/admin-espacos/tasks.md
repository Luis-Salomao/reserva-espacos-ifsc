# Administração de espaços: tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/admin-espacos/design.md`
**Status**: In Progress

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md`/`CONTRIBUTING.md` (`bun run check`), `bunfig.toml` (cobertura de 90% em linhas e funções; `src/components/**`, `src/routes/**`, `src/server/admin.ts` e `src/server/spaces.ts` fora), `.dependency-cruiser.cjs` (aplicação não importa infra).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain | unit | Todos os ramos; 1:1 com os ACs de rótulo e agrupamento | `src/domain/*.test.ts` | `bun test src/domain` |
| Application service | unit | Todos os ramos; 1:1 com os ACs de validação e exclusão; edge cases | `src/application/*.test.ts` | `bun test src/application` |
| Repository / migração | integration | bun:sqlite real: leitura, gravação atômica, exclusão condicional, migração com dados antigos; D1 opcional com `RUN_D1_TESTS=1` | `src/infra/db/**/*.test.ts` | `bun test src/infra` |
| Server action | unit (banco em memória) | 401/403/400 e caminho feliz de cada ação tocada | `src/server/admin-actions.test.ts` | `bun test src/server` |
| Server fn wiring | none | - (build gate; fora da cobertura em `bunfig.toml`) | - | build gate only |
| Component | unit (happy-dom) | Render dos estados, interações e erros dos ACs de tela | `src/components/admin/admin-managers.test.tsx` | `bun test src/components/admin` |
| Route wiring | none | - (build gate + verificação manual) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefa com testes unitários | `bun test <pastas da tarefa>` |
| Full | Tarefa com repositório ou ação | `bun test` |
| Build | Fim de fase ou tarefa sem testes | `bun run check *> C:\Users\luiss\tcc\tmp\admin-check.log; $LASTEXITCODE` |

---

## Execution Plan

### Phase 1: Domínio e dados

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Aplicação e servidor

```
(T5) → T6 → T7 → T8 → T9
```

### Phase 3: Tela

```
(T9) → T10 → T11 → T12 → T13
```

---

## Task Breakdown

### T1: Catálogo de equipamentos

**What**: `EQUIPMENT`, `EquipmentKind`, `SpaceEquipment`, `isEquipmentKind`, `describeEquipment`; `Space.equipment` opcional.
**Where**: `src/domain/equipment.ts` (+ tipo em `space.ts`)
**Depends on**: None
**Reuses**: nada
**Requirement**: ESPACOS-02, ESPACOS-14

**Done when**:

- [ ] Testes: os 9 textos de rótulo (3 estados × 3 tipos), "1 computador", `known` falso só para não informado, `isEquipmentKind`
- [ ] Gate check passes: `bun test src/domain`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(espacos): catálogo de equipamentos no domínio`

---

### T2: Agrupamento por bloco e andar

**What**: `floorOf` e `groupSpaces` com ordem natural e "Outros espaços"/"Sem andar identificado" por último.
**Where**: `src/domain/space-groups.ts`
**Depends on**: T1
**Reuses**: `blockOf`
**Requirement**: ESPACOS-01

**Done when**:

- [ ] Testes: blocos em ordem com "Outros espaços" no fim; andares em ordem com "Sem andar identificado" no fim; `A-202` antes de `A-1000`; nome sem código
- [ ] Gate check passes: `bun test src/domain`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(espacos): agrupamento de espaços por bloco e andar`

---

### T3: Esquema e migração

**What**: Coluna `spaces.equipment_notes` e tabela `space_equipment` no esquema; migração `0009_*` gerada por `bun run db:generate`.
**Where**: `drizzle/0009_*.sql` (+ `schema.ts`, `meta/`)
**Depends on**: T2
**Reuses**: teste de migração de `auth-repositories.test.ts`
**Requirement**: ESPACOS-09

**Done when**:

- [ ] Teste: banco migrado até 0008 com um espaço; aplicar 0009 mantém nome e capacidade, `equipment_notes` nulo e nenhuma linha em `space_equipment`; apagar o espaço apaga os equipamentos (FK em cascata)
- [ ] Gate check passes: `bun test src/infra`

**Tests**: integration
**Gate**: full

**Commit**: `feat(espacos): tabela de equipamentos por espaço`

---

### T4: Repositório com equipamentos

**What**: `listWithEquipment`, `create` e `update` com `equipment` atômicos; porta `SpaceWrite`.
**Where**: `src/infra/db/repos/space-repository.ts` (+ porta em `ports.ts`, teste D1 opcional)
**Depends on**: T3
**Reuses**: `runAtomically`
**Requirement**: ESPACOS-09, ESPACOS-10, ESPACOS-14

**Done when**:

- [ ] Testes: `list()` mantém o formato; `listWithEquipment` traz itens e observações e ignora tipo fora do catálogo; `update` com equipamentos substitui o conjunto; sem equipamentos mantém; nome duplicado desfaz equipamentos e observações; inexistente devolve `null`
- [ ] Teste D1 (`RUN_D1_TESTS=1`) rodado uma vez à mão
- [ ] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(espacos): repositório grava e lê equipamentos`

---

### T5: Repositório exclui espaço sem uso

**What**: `remove(id)` condicional: `removed`, `in_use` ou `not_found`.
**Where**: `src/infra/db/repos/space-repository.ts`
**Depends on**: T4
**Reuses**: `runAtomically`
**Requirement**: ESPACOS-12

**Done when**:

- [ ] Testes: sem uso apaga espaço e equipamentos; com ocupação (ativa ou cancelada), vínculo de sala ou linha de importação devolve `in_use` e não apaga nada; inexistente `not_found`
- [ ] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(espacos): exclusão de espaço sem uso no repositório`

---

### T6: Serviço valida equipamentos e observações

**What**: `SpaceInput.equipment`, validação de presença, contagem, observações e tipo desconhecido; `listWithEquipment`.
**Where**: `src/application/spaces.ts`
**Depends on**: T5
**Reuses**: `parseCapacity`, `fail`
**Requirement**: ESPACOS-07, ESPACOS-08, ESPACOS-10

**Done when**:

- [ ] Testes 1:1 com P1 Equipamentos AC 4–8 e edge cases (" 12 ", vazio, observações só com espaços, quebra de linha aceita); sem `equipment` o repositório não recebe `equipment`
- [ ] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(espacos): validação de equipamentos e observações`

---

### T7: Serviço exclui espaço

**What**: `remove(id)` traduz `in_use` em 409 e `not_found` em 404 com as mensagens da spec.
**Where**: `src/application/spaces.ts`
**Depends on**: T6
**Reuses**: `fail`, `ok`
**Requirement**: ESPACOS-12

**Done when**:

- [ ] Testes: removido → `ok(null)`; `in_use` → `conflict` com a mensagem da spec; `not_found` → `not_found` "Espaço não encontrado."
- [ ] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(espacos): caso de uso de exclusão de espaço`

---

### T8: Ações administrativas de espaço

**What**: `createSpace`/`updateSpace` com `equipment` e `notes`; `listAdminSpaces` com equipamentos; `deleteSpace` e `deleteSpaceFn`.
**Where**: `src/server/admin-actions.ts` (+ `admin.ts`)
**Depends on**: T7
**Reuses**: `asAdmin`, `record`, `text`, `fromResult`
**Requirement**: ESPACOS-11, ESPACOS-12

**Done when**:

- [ ] Testes: 401/403 para `deleteSpace`; 400 para cada formato inválido do P1 Acesso AC 3; caminho feliz grava e lista equipamentos; exclusão 200/409/404
- [ ] Gate check passes: `bun test src/server`

**Tests**: unit
**Gate**: full

**Commit**: `feat(admin): ações de equipamentos e exclusão de espaço`

---

### T9: Agenda recebe equipamentos

**What**: `listSpaces` chama `listWithEquipment()`.
**Where**: `src/server/spaces.ts`
**Depends on**: T8
**Reuses**: `createSpaceRepository`
**Requirement**: ESPACOS-14

**Done when**:

- [ ] Gate check passes: `bun run check` (log em `C:\Users\luiss\tcc\tmp\admin-check.log`)

**Tests**: none
**Gate**: build

**Commit**: `feat(agenda): consulta de espaços traz equipamentos`

---

### T10: `SpaceCard`

**What**: Cartão com capacidade, rótulos de equipamento, observações, "Editar" e "Excluir" com confirmação e estados da exclusão.
**Where**: `src/components/admin/space-card.tsx`
**Depends on**: T9
**Reuses**: `Card`, `Tag`, `AlertDialog*`, `describeEquipment`
**Requirement**: ESPACOS-02, ESPACOS-13

**Done when**:

- [ ] Testes: textos de capacidade e rótulos; observações; confirmação sem chamada ao servidor; cancelar não chama; confirmar chama com o id; recusa aparece na confirmação; "Excluindo…"
- [ ] Gate check passes: `bun test src/components/admin`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(admin): cartão de espaço com equipamentos e exclusão`

---

### T11: `SpaceFormDialog`

**What**: Diálogo de criar/editar com nome, capacidade, projetor, computadores, som e observações; erros no campo, alerta geral, "Salvando…".
**Where**: `src/components/admin/space-form-dialog.tsx`
**Depends on**: T10
**Reuses**: `Dialog`, `ChoiceCard`, `FieldError`, `useFocusInvalidField`
**Requirement**: ESPACOS-05, ESPACOS-06, ESPACOS-08

**Done when**:

- [ ] Testes: valores iniciais do novo e do editar; envio com o formato do fio; erro de campo com foco e `aria-describedby`; erro geral; "Salvando…"; fechar descarta
- [ ] Gate check passes: `bun test src/components/admin`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(admin): diálogo de cadastro de espaço com equipamentos`

---

### T12: `SpacesManager`

**What**: Busca, contador, "Novo espaço", grupos por bloco e andar, vazio, sem resultado, anúncios, erro de carga com "Tentar de novo".
**Where**: `src/components/admin/spaces-manager.tsx`
**Depends on**: T11
**Reuses**: `groupSpaces`, `matchesRoomSearch`, `SpaceCard`, `SpaceFormDialog`
**Requirement**: ESPACOS-01, ESPACOS-03, ESPACOS-04, ESPACOS-05, ESPACOS-06

**Done when**:

- [ ] Testes: grupos na ordem; busca com "X de N espaços"; "Limpar busca"; vazio com "Cadastrar espaço"; "Espaço salvo." e "Espaço excluído."; erro de carga chama recarregar; teste antigo de capacidade continua passando com a abertura do diálogo
- [ ] Gate check passes: `bun test src/components/admin`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(admin): nova lista de espaços com busca e agrupamento`

---

### T13: Rota e verificação

**What**: Rota usa o erro com "Tentar de novo" e mostra carregamento; verificação manual em 1280 px e 360 px.
**Where**: `src/routes/admin.espacos.tsx`
**Depends on**: T12
**Reuses**: `SpacesLoadError`
**Requirement**: ESPACOS-04

**Done when**:

- [ ] Verificação manual com playwright em 1280 px e 360 px (lista, busca, diálogo, erro de campo, exclusão), sem rolagem horizontal
- [ ] Gate check passes: `bun run check` (log em `C:\Users\luiss\tcc\tmp\admin-check.log`)

**Tests**: none
**Gate**: build

**Commit**: `feat(admin): rota de espaços com erro recuperável`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9
Phase 3:  T10 → T11 → T12 → T13
```

## Pre-approval checks

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 módulo de domínio (+ 1 linha de tipo) | ✅ |
| T2 | 1 módulo de domínio | ✅ |
| T3 | esquema + migração gerada (inseparáveis) | ✅ |
| T4 | repositório (+ porta) | ⚠️ coeso |
| T5 | 1 método | ✅ |
| T6 | validação no serviço | ✅ |
| T7 | 1 método | ✅ |
| T8 | ações (+ ligação das server fns) | ⚠️ coeso |
| T9 | 1 linha | ✅ |
| T10–T12 | 1 componente cada | ✅ |
| T13 | 1 rota | ✅ |

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1, T2 | Domain | unit | unit | ✅ |
| T3, T4, T5 | Repository / migração | integration | integration | ✅ |
| T6, T7 | Application | unit | unit | ✅ |
| T8 | Server action | unit | unit | ✅ |
| T9 | Server fn wiring | none | none | ✅ |
| T10, T11, T12 | Component | unit | unit | ✅ |
| T13 | Route wiring | none | none | ✅ |

Diagrama e `Depends on` conferidos por `validate_tasks.py`. São 13 tarefas (mais de um lote de ~7); como este agente já é um subagente e não pode abrir outros, a execução é inline, em ordem.

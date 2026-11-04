# Todas as salas: tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/todas-as-salas/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `package.json` (`check`), `bunfig.toml` (cobertura de 90%, `src/components/**` fora).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain | unit | Todos os ramos; 1:1 com os ACs de filtro e janela; edge cases | `src/domain/*.test.ts` | `bun test src/domain` |
| Application service | unit | Todos os ramos; visitante sem nomes | `src/application/*.test.ts` | `bun test src/application` |
| Repository | integration | Consulta principal com bun:sqlite real | `src/infra/db/**/*.test.ts` | `bun test src/infra` |
| Server action | unit | Validação de data, caminho feliz | `src/server/*.test.ts` | `bun test src/server` |
| Route search | unit | Todos os parâmetros válidos e inválidos | `test/routes/*.test.ts` | `bun test test/routes` |
| Component | unit | Render, filtros, rascunho por sala, celular | `test/components/*.test.tsx` | `bun test test/components` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefa com testes unitários | `bun test <pastas da tarefa>` |
| Full | Tarefa com repositório | `bun test` |
| Build | Fim de fase | `bun run check` |

---

## Execution Plan

### Phase 1: Dados

```
T1 → T2 → T3 → T4
```

### Phase 2: Tela

```
T5 → T6 → T7 → T8 → T9 → T10
```

---

## Task Breakdown

### T1: `listActiveInRangeAll`

**What**: Ocupações ativas de todas as salas num intervalo, numa consulta.
**Where**: `src/infra/db/repos/occupation-repository.ts` (+ porta)
**Depends on**: None
**Reuses**: `listActiveInRange`
**Requirement**: SALAS-01

**Done when**:

- [x] Teste: traz várias salas, exclui canceladas e fora do intervalo, ordem `(spaceId, startsAt)`
- [x] Gate check passes: `bun test`

**Tests**: integration
**Gate**: full

**Commit**: `feat(agenda): consulta de ocupações de todas as salas`

---

### T2: `bookings.roomsDay`

**What**: Um `DayAgenda` por sala para a data, com `space` (nome, capacidade), numa consulta.
**Where**: `src/application/bookings.ts`
**Depends on**: T1
**Reuses**: `buildDay`, `toItem`, `peopleFor`
**Requirement**: SALAS-01, SALAS-03

**Done when**:

- [x] Testes: sala sem ocupação vem com o dia todo livre; visitante sem pessoas; data inválida falha; ordem natural de nomes
- [x] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): agenda do dia de todas as salas`

---

### T3: `getRoomsDayFn`

**What**: Ação e server fn para `roomsDay`, sessão opcional como na agenda atual.
**Where**: `src/server/booking-actions.ts` (+ `src/server/booking-fns.ts`)
**Depends on**: T2
**Reuses**: `getWeekAgenda`
**Requirement**: SALAS-01

**Done when**:

- [x] Teste de ação: entrada inválida e caminho feliz
- [x] Gate check passes: `bun test src/server`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): server fn de todas as salas`

---

### T4: `room-filter`

**What**: `blockOf`, `filterRooms`, `isFreeIn`, `defaultWindow` puros.
**Where**: `src/domain/room-filter.ts`
**Depends on**: T3
**Reuses**: `TimeRange` de `src/domain/availability.ts`
**Requirement**: SALAS-04, SALAS-05, SALAS-06, SALAS-07, SALAS-09

**Done when**:

- [x] Testes 1:1 com os ACs de filtro: blocos múltiplos e "Outros", capacidade com `hiddenNoCapacity`, busca sem acento, só livres, trecho passado conta como ocupado, janela padrão arredondada
- [x] Gate check passes: `bun test src/domain`

**Desvio**: `defaultWindow(now)` não recebe `date`: a janela é a mesma hora do dia em qualquer data escolhida, então o parâmetro ficaria sem uso. A janela começa no meio horário seguinte a agora (09:00 → 09:30, porque reservar exige início depois de agora) e não passa de 23:59. Entraram também `blocksOf` (chips da tela, com "Outros" por último), `windowIssue` (mensagem "O fim precisa ser depois do início") e `OTHER_BLOCK`. Blocos sem nenhuma sala são ignorados dentro de `filterRooms` (a rota só valida o formato). `isFreeIn` usa `DayAgenda.free`, então janela fora do expediente não é livre. `hiddenNoCapacity` conta só as salas sem capacidade que passariam nos outros filtros.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): regras de filtro das salas`

---

### T5: Rota `/salas` e validação da URL

**What**: Rota com `validateSearch` (data, visão, blocos, capacidade, busca, janela, só livres) e loader com `getRoomsDayFn`.
**Where**: `src/routes/salas.tsx`
**Depends on**: None
**Reuses**: `validateAgendaSearch`
**Requirement**: SALAS-03, SALAS-04

**Done when**:

- [x] Testes: data inválida vira hoje; capacidade fora de 1–999 ignorada; bloco inexistente ignorado
- [x] Gate check passes: `bun test test/routes`

**Desvio**: a carga do dia ficou em `loadSalas(data, session, fetchDay)`, exportada da rota, para testar "data inválida vira hoje" e a falha do servidor sem subir o servidor. A rota valida só o formato do bloco (letra ou "Outros"); o bloco sem nenhuma sala é ignorado por `filterRooms` (T4).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): rota de todas as salas`

---

### T6: Navegação para `/salas`

**What**: Item "Salas" no menu logado e link "Todas as salas" na barra da agenda (visitante também).
**Where**: `src/components/app-shell.tsx` (+ `src/components/agenda/agenda-view.tsx`)
**Depends on**: T5
**Reuses**: `NAV_ICONS`
**Requirement**: SALAS-02

**Done when**:

- [x] Teste: item aparece para docente; link aparece para visitante
- [x] Gate check passes: `bun test src/components test/components`

**Desvio**: o link "Todas as salas" é um `Link` do roteador; o teste antigo de 360 px que montava `AgendaView` sem roteador passou a usar `renderAgenda` (mesmas asserções). A opção "Ver todas as salas" dentro do seletor de sala fica para quando `room-selector.tsx` for commitado.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): atalhos para todas as salas`

---

### T7: `RoomsFilters`

**What**: Chips de bloco, capacidade, busca, janela, "Só livres", contador "X de 21"; no celular, botão "Filtros (n)".
**Where**: `src/components/rooms/rooms-filters.tsx`
**Depends on**: T6
**Reuses**: `Button`, `Input`, `Popover`
**Requirement**: SALAS-04, SALAS-08, SALAS-09

**Done when**:

- [x] Testes: cada controle chama `onChange` com o filtro certo; erro de janela; contador de filtros ativos
- [x] Gate check passes: `bun test test/components`

**Desvio**: no celular, a janela (Início e Fim) fica fora do botão "Filtros" para a pergunta "o que está livre das 14 às 16?" caber em poucas interações; o contador do botão conta blocos, capacidade, busca e "Só livres". Sem filtro ativo o botão mostra só "Filtros". O componente recebe `compact` de quem decide a largura (T10).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): filtros de salas`

---

### T8: `RoomsColumns`

**What**: Eixo fixo + `DayColumn` por sala, nome clicável para a agenda da sala, rascunho só na coluna da sala, rolagem horizontal interna.
**Where**: `src/components/rooms/rooms-columns.tsx`
**Depends on**: T7
**Reuses**: `DayColumn`, `HourAxis`, `makeScale`
**Requirement**: SALAS-01, SALAS-02, SALAS-03, SALAS-11

**Done when**:

- [ ] Testes: uma coluna por sala; link com `espaco` e `data`; rascunho aparece em uma coluna só
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): colunas de todas as salas`

---

### T9: `RoomsFreeList`

**What**: Lista das salas livres na janela, com bloco, capacidade e "Reservar" (escondido para quem não reserva).
**Where**: `src/components/rooms/rooms-free-list.tsx`
**Depends on**: T8
**Reuses**: `isFreeIn`
**Requirement**: SALAS-09, SALAS-12

**Done when**:

- [ ] Testes: só livres; "Reservar" chama com sala e janela; vazio mostra "Limpar filtros"
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): lista de salas livres`

---

### T10: `RoomsView` e página

**What**: Compõe filtros, visões (padrão "Livres" abaixo de 768 px), rascunho único, `BookingSheet` e atualização após reservar; liga na rota.
**Where**: `src/components/rooms/rooms-view.tsx` (+ `src/routes/salas.tsx`)
**Depends on**: T9
**Reuses**: `BookingSheet`, `router.invalidate`
**Requirement**: SALAS-07, SALAS-10, SALAS-11, SALAS-12

**Done when**:

- [ ] Testes: filtros mudam a URL; clicar no rascunho abre a reserva com sala, data e horário; visitante sem rascunho; erro com "Tentar de novo"
- [ ] Verificação manual em 360 px e 1280 px (playwright)
- [ ] Gate check passes: `bun run check`

**Tests**: unit
**Gate**: build

**Commit**: `feat(agenda): tela de todas as salas`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 → T2 → T3 → T4
Phase 2:  T5 → T6 → T7 → T8 → T9 → T10
```

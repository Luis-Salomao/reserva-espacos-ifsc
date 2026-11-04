# Visão geral: tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/visao-geral/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `package.json` (`check`), `bunfig.toml` (cobertura de 90%, `src/components/**` fora).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain | unit | Todos os ramos; 1:1 com os ACs de cor e de bloco; edge cases | `src/domain/*.test.ts` | `bun test src/domain` |
| Application service | unit | Todos os ramos; visitante sem nomes | `src/application/*.test.ts` | `bun test src/application` |
| Server action | unit | Validação de semana, caminho feliz | `src/server/*.test.ts` | `bun test src/server` |
| Route search/loader | unit | `visao=geral`, deps e argumento enviado ao servidor | `test/routes/*.test.ts` | `bun test test/routes` |
| Component | unit | Grade, legenda, cartão, filtros recolhidos, celular | `test/components/*.test.tsx` | `bun test test/components` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefa com testes unitários | `bun test <pastas da tarefa>` |
| Full | Tarefa que muda tipos compartilhados | `bun test` |
| Build | Fim de fase | `bun run check` |

---

## Execution Plan

### Phase 1: Dados

```
T1 → T2 → T3 → T4
```

### Phase 2: Tela

```
T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: Página única

```
T13 → T14 → T15 → T16 → T17
```

---

## Task Breakdown

### T1: Regras da grade (`domain/overview`)

**What**: `subjectOf`, `subjectTone`, `SUBJECT_PALETTE`, `RESERVA_TONE`, `contrastRatio`, `cellsFor` (com `partial` e `outside`) e `weekOf`.
**Where**: `src/domain/overview.ts`
**Depends on**: None
**Reuses**: `addDays`, `weekdayOf`; ideia de hash de `avatarTone`
**Requirement**: GERAL-01, GERAL-02, GERAL-04

**Done when**:

- [x] Testes: mesma matéria, mesmo índice; título sem " — " usa o título inteiro; toda cor da paleta e a de reserva com contraste ≥ 3:1 contra `#ffffff` (claro) e `#0e0e11` (escuro); ocupação que cruza dois blocos aparece nos dois; parcial marcada; duas ocupações no mesmo bloco; ocupação antes do primeiro bloco pinta os blocos que cruza; ocupação entre blocos vai para `outside`; `weekOf` de uma quarta devolve segunda a sexta
- [x] Gate check passes: `bun test src/domain`

**Desvio**: `cellsFor` devolve `{ cells, outside }` (o design listava `Cell[]` na interface e `outside` só nos riscos). `Cell` é genérico no item e no bloco, para o domínio não depender de `AgendaItem`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): regras da visão geral`

---

### T2: `bookings.roomsWeek`

**What**: Semana (segunda a sexta) de todas as salas, numa consulta, com os blocos de cada dia só dos semestres que cobrem o dia.
**Where**: `src/application/bookings.ts`
**Depends on**: T1
**Reuses**: `toItem`, `peopleFor`, `blocksFor`, `listActiveInRangeAll`
**Requirement**: GERAL-01, GERAL-03, GERAL-07

**Done when**:

- [x] Testes: `weekStart` que não é segunda falha; ocupações de sábado ficam de fora; dia fora de semestre vem sem blocos; visitante recebe `person: null`; logado recebe o responsável; ordem natural das salas; uma única consulta de ocupações
- [x] Gate check passes: `bun test src/application`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): semana de todas as salas`

---

### T3: `getRoomsWeek` e `getRoomsWeekFn`

**What**: Ação e server fn para `roomsWeek`, sessão opcional.
**Where**: `src/server/booking-actions.ts` (+ `src/server/booking-fns.ts`)
**Depends on**: T2
**Reuses**: `getRoomsDay`, `getRoomsDayFn`
**Requirement**: GERAL-03

**Done when**:

- [x] Testes de ação: semana inválida é 400; visitante sem nomes; logado com nomes
- [x] Gate check passes: `bun test src/server`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): server fn da semana de todas as salas`

---

### T4: Rota com `visao=geral`

**What**: `validateSalasSearch` aceita `geral`; `loaderDeps` vira `{ data, geral }`; o loader pede a semana (segunda da data) quando `geral`, numa chamada.
**Where**: `src/routes/salas.tsx` (+ `SalasSearch` em `src/components/rooms/rooms-view.tsx`)
**Depends on**: T3
**Reuses**: `loadSalas`
**Requirement**: GERAL-03

**Done when**:

- [x] Testes: `visao=geral` é mantida; trocar "Colunas"↔"Livres" não muda as deps, entrar na visão geral muda; o loader manda a `weekStart` certa a `getRoomsWeekFn` com e sem `data` na URL (afirmar o argumento, lição L-010); falha vira mensagem
- [x] Gate check passes: `bun run check`

**Desvio**: na visão geral o loader pede só a semana (`roomsDay` vem `null`), e a `RoomsView` só ganhou `"geral"` no tipo. Até a T9, `/salas?visao=geral` digitada na URL mostra o aviso "Não foi possível carregar as salas" com "Tentar de novo", sem nenhum botão de visão marcado; "Colunas" ou "Livres" voltam ao normal. Não há link para a visão geral antes da T9. O teste existente de `loaderDeps` foi reescrito para a nova regra `{ data, geral }`, como a tarefa pede.

**Tests**: unit
**Gate**: build

**Commit**: `feat(salas): rota carrega a semana na visão geral`

---

### T5: Filtros recolhidos

**What**: Busca de sala sempre visível; bloco, capacidade e "Só livres" no botão "Filtros · n" em qualquer largura; janela visível em "Livres", dentro de "Filtros" em "Colunas", ausente na visão geral (com "Só livres" também ausente).
**Where**: `src/components/rooms/rooms-filters.tsx`
**Depends on**: None
**Reuses**: `Popover`, `Button`, `Input`, `Switch`
**Requirement**: GERAL-08

**Done when**:

- [x] Testes: sem abrir "Filtros" só a busca aparece (e a janela em "Livres"); abrir mostra bloco, capacidade e "Só livres"; contagem "Filtros · 2" com dois filtros escondidos ativos; visão geral sem janela nem "Só livres"; cada controle ainda chama `onChange` com o filtro certo
- [x] Gate check passes: `bun test test/components`

**Desvio**: a prop `compact` de `RoomsFilters` virou `view`, porque o botão "Filtros" vale em qualquer largura; o rótulo passou de "Filtros (n)" para "Filtros · n" e conta só os filtros escondidos (a busca visível não conta; "Só livres" não conta na visão geral). Os testes de `RoomsFilters` e o teste "filtros mudam a URL e o resultado" de `RoomsView` passaram a abrir "Filtros" antes de usar bloco, capacidade, "Só livres" e a janela de "Colunas".

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): filtros recolhidos`

---

### T6: Grade da semana (`RoomsOverview` + `OverviewCell`)

**What**: Uma linha por sala, colunas por dia × bloco; quadradinho vazio com contorno, cheio com a cor da matéria, faixas quando há mais de uma ocupação, canto recortado quando parcial, reserva avulsa com a cor neutra; aviso de ocupações fora dos blocos; clique abre a agenda da sala no dia.
**Where**: `src/components/rooms/rooms-overview.tsx`, `src/components/rooms/overview-cell.tsx`
**Depends on**: T5
**Reuses**: `cellsFor`, `subjectTone`, `Link`
**Requirement**: GERAL-01, GERAL-02, GERAL-04, GERAL-06

**Done when**:

- [ ] Testes: 3 salas × 5 dias × 2 blocos geram 30 quadradinhos; ocupado tem a cor da matéria e vazio não; duas ocupações viram duas faixas; avulsa usa a cor de reserva; clique leva a `/` com `espaco` e `data`
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): grade da visão geral`

---

### T7: Legenda e destaque

**What**: Legenda com as matérias da semana (ordem alfabética) e "Reserva"; clique destaca uma matéria e esmaece as outras; segundo clique remove.
**Where**: `src/components/rooms/overview-legend.tsx` (+ `rooms-overview.tsx`)
**Depends on**: T6
**Reuses**: `subjectOf`, `subjectTone`
**Requirement**: GERAL-05

**Done when**:

- [ ] Testes: clicar numa matéria marca `aria-pressed` e esmaece os quadradinhos das outras; clicar de novo remove; a matéria destacada não esmaece
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): legenda e destaque por matéria`

---

### T8: Cartão de detalhes

**What**: Hover ou foco escala o quadradinho (≤ 150 ms; sem escala com `prefers-reduced-motion`) e mostra cartão com matéria, turma, sala, dia e horário real; avatar e nome só para logado.
**Where**: `src/components/rooms/overview-cell.tsx`
**Depends on**: T7
**Reuses**: `Avatar`
**Requirement**: GERAL-06, GERAL-07

**Done when**:

- [ ] Testes: foco abre o cartão com matéria, turma, sala, dia e horário; logado vê nome e avatar; visitante não vê nome, iniciais nem nenhum `[data-slot="avatar"]` (asserção booleana, lição L-012); classe de transição com duração ≤ 150 ms e `motion-reduce` sem escala
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): cartão de detalhes na visão geral`

---

### T9: Visão geral na página

**What**: Terceira opção "Visão geral" no seletor de visão; setas e título de semana na visão geral; aviso "Esta semana não tem blocos de horário" com atalho para "Colunas"; "Nenhuma sala com esses filtros"; celular com abas de segunda a sexta e toque abrindo o cartão; alvos ≥ 32 px.
**Where**: `src/components/rooms/rooms-view.tsx` (+ `src/routes/salas.tsx`)
**Depends on**: T8
**Reuses**: `useCompact`, `filterRooms`, `Popover`
**Requirement**: GERAL-01, GERAL-03, GERAL-08, GERAL-09

**Done when**:

- [ ] Testes: escolher "Visão geral" muda a URL; setas trocam a semana (±7 dias); semana sem blocos mostra o aviso e o atalho; celular mostra abas e um dia por vez; toque abre o cartão em vez de navegar
- [ ] Verificação manual (playwright) em 1280 × 800 sem rolagem vertical com 21 salas e em 360 px
- [ ] Gate check passes: `bun run check`

**Tests**: unit
**Gate**: build

**Commit**: `feat(salas): visão geral na tela de salas`

---

### T10: Reservar pelo quadradinho

**What**: Quadradinho livre de bloco não terminado abre a `BookingSheet` com sala, dia e horário do bloco (sala editável); visitante vê o `GateDialog`; bloco terminado não reage; reserva confirmada recarrega a semana.
**Where**: `src/components/rooms/overview-cell.tsx` (+ `rooms-overview.tsx`, `rooms-view.tsx`)
**Depends on**: T9
**Reuses**: `BookingSheet`, `GateDialog`, `book()` de `RoomsView`
**Requirement**: GERAL-10

**Done when**:

- [ ] Testes: clique em livre futuro chama a reserva com `{ spaceId, date, start, end }` do bloco; visitante abre o convite; bloco passado não chama nada; ocupado não abre reserva
- [ ] Gate check passes: `bun test test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): reservar pelo quadradinho da visão geral`

---

### T11: Livres primeiro na visão "Livres"

**What**: Função pura que ordena as salas em livres e ocupadas na janela, com o motivo (título e horário de cada ocupação que cruza a janela; "Horário já passou" quando for o caso); `RoomsFreeList` mostra as livres e, abaixo do título "Ocupadas", as ocupadas com o motivo.
**Where**: `src/domain/room-filter.ts` (+ `src/components/rooms/rooms-free-list.tsx`)
**Depends on**: T10
**Reuses**: `isFreeIn`, `DayAgenda.occupations`
**Requirement**: GERAL-12

**Done when**:

- [ ] Testes de domínio: ordem livres → ocupadas; motivo com título e horário de cada ocupação que cruza; trecho passado vira "Horário já passou"; motivo nunca leva nome de pessoa
- [ ] Testes de componente: título "Ocupadas" separa as listas; contador continua "X de N salas" contando só as livres
- [ ] Gate check passes: `bun test src/domain test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): livres primeiro e ocupadas com o motivo`

---

### T12: Escolha de sala na reserva por disponibilidade

**What**: `BookingSheet` aceita uma fonte de disponibilidade do dia (`getRoomsDayFn`); a escolha de sala mostra o grupo "Livres" e depois "Ocupadas" (desabilitadas, com o motivo), recalculado ao trocar data ou horário; sem fonte, lista simples como hoje.
**Where**: `src/components/agenda/booking-sheet.tsx`
**Depends on**: T11
**Reuses**: função de T11, `getRoomsDayFn`
**Requirement**: GERAL-12

**Done when**:

- [ ] Testes: com disponibilidade, livres antes das ocupadas e ocupada desabilitada com o motivo; trocar o horário reordena; sem fonte, lista igual à atual; falha da fonte mantém a lista simples
- [ ] Gate check passes: `bun run check`

**Tests**: unit
**Gate**: build

**Commit**: `feat(reserva): escolha de sala com livres primeiro`

---

### T13: Rota `/` com todas as visualizações

**What**: `validateAgendaSearch` aceita `visao` (`sala` padrão, `colunas`, `livres`, `geral`) e os filtros de salas; o loader chama a fonte certa (semana da sala, dia de todas as salas ou semana de todas as salas) numa chamada; `loadSalas` é reaproveitado.
**Where**: `src/routes/index.tsx`
**Depends on**: None
**Reuses**: `loadSalas`, `validateSalasSearch`, `getWeekAgendaFn`, `getRoomsDayFn`, `getRoomsWeekFn`
**Requirement**: GERAL-11

**Done when**:

- [ ] Testes: sem `visao` vale "Sala"; cada visualização manda o argumento certo à sua server fn (afirmar o argumento, lição L-010); trocar "Colunas"↔"Livres" não muda as deps; filtros inválidos descartados
- [ ] Gate check passes: `bun test test/routes src/routes`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): página única carrega todas as visualizações`

---

### T14: Seletor de visualização na página

**What**: Componente `ViewSwitcher` ("Sala", "Colunas", "Livres", "Visão geral") nos cabeçalhos de `AgendaView` e `RoomsView`; a página `/` mostra a visualização da URL mantendo data e sala; nome da sala e quadradinho ocupado abrem "Sala"; "Ver todas as salas" troca para "Colunas"; sai o item "Salas" do menu e o link "Todas as salas".
**Where**: `src/components/view-switcher.tsx` (+ `src/routes/index.tsx`, `agenda-view.tsx`, `rooms-view.tsx`, `app-shell.tsx`)
**Depends on**: T13
**Reuses**: botões de visão de `RoomsView`
**Requirement**: GERAL-11

**Done when**:

- [ ] Testes: trocar de visualização atualiza `visao` mantendo `data` e `espaco`; menu sem "Salas"; agenda sem "Todas as salas"; "Ver todas as salas" leva a "Colunas"; nome da sala leva a "Sala" com `espaco` e `data`
- [ ] Gate check passes: `bun test test/components src/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): seletor de visualização na página única`

---

### T15: `/salas` redireciona

**What**: A rota `/salas` vira redirecionamento para `/` com os mesmos parâmetros e `visao=colunas` quando ausente.
**Where**: `src/routes/salas.tsx`
**Depends on**: T14
**Reuses**: `redirect`
**Requirement**: GERAL-11

**Done when**:

- [ ] Testes: `/salas?data=D` redireciona para `/` com `data=D` e `visao=colunas`; `visao` existente é mantida; filtros mantidos
- [ ] Verificação manual (playwright) da página única em 1280 × 800 e 360 px
- [ ] Gate check passes: `bun run check`

**Tests**: unit
**Gate**: build

**Commit**: `feat(agenda): salas redireciona para a página única`

---

### T16: Filtro por andar

**What**: `floorOf(name)` (primeiro dígito do código letra + três dígitos; `null` sem código), `floorsOf`, filtro `floors` em `filterRooms`, parâmetro `andar` na URL e chips de andar dentro de "Filtros".
**Where**: `src/domain/room-filter.ts` (+ `rooms-filters.tsx`, `src/routes/index.tsx`)
**Depends on**: T15
**Reuses**: `blockOf`, regex de andar de `room-selector.tsx`
**Requirement**: GERAL-14

**Done when**:

- [ ] Testes de domínio: `A-202` → 2, `Lab. A102` → 1, `Auditório` → `null`; filtro por um e por vários andares
- [ ] Testes: `andar` inválido descartado na URL; chips de andar mudam o filtro e entram na contagem "Filtros · n"
- [ ] Gate check passes: `bun test src/domain test/routes test/components`

**Tests**: unit
**Gate**: quick

**Commit**: `feat(salas): filtro por andar`

---

### T17: Selecionar horário na visão geral

**What**: Arrastar sobre quadradinhos de um dia seleciona o trecho (destacado em todas as salas); clique em livre seleciona o bloco e sugere a sala da linha (substitui a abertura direta da reserva da T10); painel com dia e horário, livres primeiro e ocupadas com o motivo, filtros de bloco e andar, início e fim ajustáveis; escolher uma livre abre a reserva preenchida (visitante: convite); trecho terminado sem reserva; no celular, toque seleciona um bloco.
**Where**: `src/components/rooms/overview-selection.tsx` (+ `rooms-overview.tsx`, `overview-cell.tsx`)
**Depends on**: T16
**Reuses**: `availabilityIn` (T11), `BookingSheet`, `GateDialog`, `filterRooms`
**Requirement**: GERAL-13

**Done when**:

- [ ] Testes: arrastar de um bloco a outro no mesmo dia seleciona do início do primeiro ao fim do último; clique em livre seleciona o bloco com a sala sugerida; painel lista livres antes das ocupadas com o motivo; filtro por bloco e andar no painel; escolher livre chama a reserva com sala, dia e horário; visitante abre o convite; trecho passado sem botão de reservar
- [ ] Verificação manual (playwright) em 1280 × 800 e 360 px
- [ ] Gate check passes: `bun run check`

**Tests**: unit
**Gate**: build

**Commit**: `feat(salas): selecionar horário e ver salas livres na visão geral`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 → T2 → T3 → T4
Phase 2:  T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12
Phase 3:  T13 → T14 → T15 → T16 → T17
```

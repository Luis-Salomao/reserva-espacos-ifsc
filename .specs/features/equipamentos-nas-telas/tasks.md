# Equipamentos nas telas

## Desvios

- A skill `tlc-spec-driven` não está neste ambiente. As tarefas seguem o fluxo do repositório: spec, teste, um commit por tarefa.
- Observações só para logados é premissa não confirmada (spec).
- Rolagem horizontal em 360 px não é medida pelo happy-dom (L-005); fica para a revisão manual.

### T1: marcas e o que o visitante pode ver

**Where**: `src/domain/equipment.ts`, `src/components/equipment-marks.tsx`
**Done when**:

- [x] `equipmentForViewer` zera as observações de quem não está logado
- [x] Teste do componente: três rótulos, "não informado", observações ausentes sem `showNotes`

**Commit**: `feat(salas): marcas de equipamento`

### T2: dados na agenda e na lista de espaços

**Where**: `src/application/bookings.ts`, `src/server/spaces.ts`
**Done when**:

- [x] `roomsDay` e `roomsWeek` leem `listWithEquipment` e o visitante não recebe as observações
- [x] `listSpaces` aplica a mesma regra

**Commit**: `feat(salas): equipamentos na consulta da agenda`

### T3: telas

**Where**: seletor, agenda, colunas, livres, visão geral, formulário
**Done when**:

- [x] Cada tela lista os equipamentos; o formulário acompanha a sala
- [x] Visitante não vê o parágrafo de observações

**Commit**: `feat(salas): equipamentos nas telas da agenda`

### T4: filtro (P2)

**Where**: `src/domain/room-filter.ts`, `rooms-filters.tsx`, `rooms-view.tsx`, `src/routes/salas.tsx`
**Done when**:

- [x] "Com projetor" e "Mínimo de N computadores" filtram e vão para a URL
- [x] Não entram nas `loaderDeps`

**Commit**: `feat(salas): filtro por projetor e computadores`

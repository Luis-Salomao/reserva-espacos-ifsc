# Visão geral: validação

**Date**: 2026-11-04
**Spec**: `docs/specs/features/visao-geral/spec.md`
**Diff range**: `9bf1fc1..2ad56af` (branch `feat/visao-geral`, 20 commits, 34 arquivos)
**Verifier**: subagente independente (autor ≠ verificador); evidência rederivada do código e dos testes, sem usar o relatório do autor

**Verdict**: FAIL

Motivo: 5 de 36 mutantes sobreviveram (arrasto entre dias, ordem livres/ocupadas no painel, Escape no painel e no cartão, trecho em andamento) e a spec ficou contraditória depois da T17 (GERAL-10 AC1/AC3 contra GERAL-13 AC2). O código passa no gate e nos navegadores; as lacunas são de teste e de spec.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T4 (dados) | ✅ Done | `roomsWeek`, ação, server fn e loader conferidos |
| T5–T9 (tela) | ✅ Done | - |
| T10 | ⚠️ Done, mas substituída | A T17 trocou a reserva direta pelo painel; os ACs de GERAL-10 não foram reescritos na spec |
| T11–T12 | ✅ Done | - |
| T13–T16 | ✅ Done | - |
| T17 | ⚠️ Partial (teste) | Comportamento correto no navegador; M20, M21, M27 e M30 sobreviveram |

---

## Spec-Anchored Acceptance Criteria

Caminhos relativos à raiz da worktree. `RO` = `test/components/rooms-overview.test.tsx`, `RV` = `test/components/rooms-view.test.tsx`, `OV` = `src/domain/overview.test.ts`, `RF` = `src/domain/room-filter.test.ts`.

### GERAL-01 — Grade (AC 1, 3, 6)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 linha por sala, coluna por bloco, seg–sex | 3 salas × 5 dias × 2 blocos = 30 | `RO:154` - `expect(document.querySelectorAll("[data-cell]").length).toBe(30)` e 10 por sala; `RV:480` - `toBe(3 * 5 * 2)`; `OV:115` - uma célula por bloco | ✅ PASS (⚠️ o AC ainda cita `/salas?visao=geral`; hoje vale pelo redirecionamento, `test/routes/salas.test.ts:275`) |
| AC3 livre vazio só com contorno | sem cor, com borda | `RO:170` - `stripesOf(free)).toEqual([])`, `toContain("border")` | ✅ PASS |
| AC6 sem rolagem vertical 1280×800, 21 salas | `scrollHeight` = 800 | Navegador (abaixo): `scrollHeight` 800, 21 salas × 35 quadradinhos, também com o painel aberto | ✅ PASS (manual) |

### GERAL-02 — Grade (AC 2, 4)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC2 cor da matéria | cor de `SUBJECT_PALETTE[subjectTone(matéria)]` | `RO:161` - `stripesOf(monday)).toEqual([toneOf("Cálculo I")])` | ✅ PASS |
| AC4 faixas por ocupação | 2 ocupações → 2 faixas | `RO:179` - `toEqual([toneOf("Cálculo I"), toneOf("Química")])`; `OV:146` | ✅ PASS |

### GERAL-03 — Grade (AC 5, 7)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC5 setas: semana ±7, URL, uma chamada | `data` ±7 dias; uma chamada a `getRoomsWeekFn` com a segunda | `RV:489` - `toMatchObject({ data: "2030-11-19" })` / `"2030-11-05"`; `test/routes/index.test.ts:209` - `calls.rooms).toEqual([{ data: { weekStart: "2026-11-09" } }])`, `calls.day/week` vazios (L-010) | ✅ PASS |
| AC7 semana sem blocos | texto exato + atalho "Colunas" | `RV:498` - `getByText("Esta semana não tem blocos de horário")`, clique leva a `visao: "colunas"` | ✅ PASS |

### GERAL-04 — Cor (AC 1, 2, 5)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 mesma matéria, mesma cor | índice igual entre turmas e dias | `OV:43` - `subjectTone(...)).toBe(tone)`; `RO:161` (outro dia) | ✅ PASS |
| AC2 contraste ≥ 3:1 claro e escuro | contra `--bg` `#ffffff`/`#0e0e11` (`src/styles/tokens.css:4,26`) | `OV:99` - `contrastRatio(tone.light, LIGHT_BG)).toBeGreaterThanOrEqual(3)` e `dark`; fórmula em `OV:75`. Recalculado pelo verificador: mínimo 4,70 (claro) e 6,46 (escuro); contra `--surface` 4,54 e 6,16 | ✅ PASS |
| AC5 reserva avulsa neutra | `RESERVA_TONE` | `RO:184` - `toEqual([RESERVA_TONE])`; `OV:106` distinta das matérias | ✅ PASS |

### GERAL-05 — Destaque (AC 3, 4)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC3 clicar esmaece as outras | `aria-pressed` true; outras com `opacity-20` | `RO:212` - `dimmedOf(...)).toEqual([false, true])` etc. | ✅ PASS |
| AC4 segundo clique remove | nenhuma esmaecida | `RO:225` - `aria-pressed` "false", `dimmedOf(...)).toEqual([false])` | ✅ PASS |

### GERAL-06 — Detalhe (AC 1, 4, 5)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 hover/foco: escala ≤ 150 ms + cartão com matéria, turma, sala, dia, horário real | texto do cartão e duração ≤ 150 | `RO:245` - `getByText("A-202 · terça 10/11 · 08:30–09:50")`, `"Turma 2B"`; `RO:258` hover; `RO:284` - `Number(duration)).toBeLessThanOrEqual(150)`, `scale-160` só com foco | ✅ PASS |
| AC4 movimento reduzido sem escala | `motion-reduce:scale-100`, `motion-reduce:transition-none` | `RO:284` - `arrayContaining(["scale-160", "motion-reduce:scale-100"])` | ✅ PASS |
| AC5 clique no ocupado abre "Sala" da sala no dia | `/?espaco=a202&data=…` (sem `visao` = "Sala") | `RO:195` - `getAttribute("href")).toBe("/?espaco=a202&data=2026-11-10")` | ✅ PASS |

### GERAL-07 — Pessoa no cartão (AC 2, 3)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC2 logado vê avatar e nome | nome + `[data-slot='avatar']` | `RO:267` - `getByText("Ana Souza")`, `querySelector("[data-slot='avatar']") === null).toBe(false)` | ✅ PASS |
| AC3 visitante sem nome, iniciais, avatar | ausência do elemento (L-012) | `RO:274` - `querySelector("[data-slot='avatar']") === null).toBe(true)`, sem "Ana Souza" nem "AS" | ✅ PASS |
| Privacidade no servidor (`roomsWeek`) | visitante recebe `person: null`, nenhum nome/código/id | `src/application/bookings.test.ts:941` - `toEqual([null, null])`, JSON sem ids/nomes/códigos; `src/server/booking-actions.test.ts:189` - `[... "MAT1", "2026-11-12", null]`, JSON sem `docA.id`/"Pessoa"/"DOCA" | ✅ PASS |

### GERAL-08 — Filtros recolhidos (AC 1–4)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 só data, busca (e janela em "Livres") | demais ausentes | `test/components/rooms-filters.test.tsx:43` e `:52` - ausências afirmadas no elemento | ✅ PASS |
| AC2 "Filtros" mostra bloco, capacidade e "Só livres" | os três dentro do diálogo | `rooms-filters.test.tsx:62`; na visão geral `:82` afirma que "Só livres" **não** aparece | ⚠️ Spec-precision gap: a spec não exclui "Só livres" da visão geral; só o design decidiu |
| AC3 contagem "Filtros · 2" | rótulo exato | `rooms-filters.test.tsx:72` - `getByRole("button", { name: "Filtros · 2" })`; `:77`, `:138` | ✅ PASS |
| AC4 mesma regra em "Colunas" e "Livres" | idem | `rooms-filters.test.tsx:43,52,62`; `RV:206` | ✅ PASS |

### GERAL-09 — Celular (AC 1–3)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 < 768 px: um dia, abas seg–sex | 5 abas, só o dia da aba | `RV:527` - abas `["Seg 11", …, "Sex 15"]`, `cellsOn(DATE).length).toBe(6)` e 0 no outro dia | ✅ PASS |
| AC2 toque abre o cartão sem navegar | tooltip, URL igual | `RV:546` - sem `href`, `pathname` "/" e `search` `{ visao: "geral" }` | ✅ PASS |
| AC3 alvo ≥ 32 px | `size-8` | `RV:559` - `toContain("size-8")`; navegador: 32 × 32 px | ✅ PASS |

### GERAL-10 — Reservar pelo quadradinho (AC 1–5)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 clique no livre **abre a reserva** preenchida | reserva aberta direto | `RO:300` afirma o contrário: `onBook).toHaveBeenCalledTimes(0)` e abre o painel (GERAL-13 AC2). A reserva preenchida só sai do painel: `RV:566` - sala `b104`, data, `10:10`, `12:00` | ⚠️ Spec contraditória: GERAL-10 AC1 × GERAL-13 AC2 |
| AC2 sala editável | `select` habilitado e troca vale no envio | `RV:566` - `sala.disabled).toBe(false)`, envio com `spaceId: "lab"` | ✅ PASS |
| AC3 visitante: convite sem reserva | `GateDialog`, sem "Nova reserva" | `RV:608` - `findByText("Entre para reservar")`, diálogo ausente (via painel, não pelo clique no quadradinho) | ⚠️ mesma contradição |
| AC4 bloco terminado não abre reserva | sem botão "Reservar" | `RO:421` - `getByText("Esse horário já terminou")`, `queryByRole("button", { name: /^Reservar/ }) === null` | ✅ PASS |
| AC5 confirmar recarrega a semana | `router.invalidate` | `RV:566` - `await waitFor(() => expect(loads.count).toBeGreaterThan(before))` | ✅ PASS ("pintar o bloco" não é observável em unidade) |

### GERAL-11 — Página única (AC 1–6)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 quatro visualizações em `/`, seletor atualiza `visao` | "Sala", "Colunas", "Livres", "Visão geral" | `RV:268` - rótulos e `aria-pressed`; `test/routes/index.test.ts:31` | ✅ PASS |
| AC2 sem `visao` vale "Sala" | fonte `sala` | `test/routes/index.test.ts:82` - `toEqual({ …, fonte: "sala" })`; `:162` pede `getWeekAgendaFn` com `{ spaceId: "b104", weekStart: "2026-11-09" }`; navegador: `/` em 360 e 1280 px com "Sala" marcada | ✅ PASS |
| AC3 troca mantém data e sala | `{ visao, data, espaco }` | `RV:268`; `test/components/agenda-view.test.tsx:646` | ✅ PASS |
| AC4 `/salas` → `/`, parâmetros mantidos, "Colunas" padrão | `{ data, visao: "colunas" }` | `test/routes/salas.test.ts:268`, `:275`, `:281`; navegador: `/salas?data=2026-11-04&bloco=A` → `/?data=…&bloco=["A"]&visao=colunas` | ✅ PASS (`espaco` não é mantido; ver lacuna 8) |
| AC5 sem "Salas" no menu nem "Todas as salas"; "Ver todas as salas" → "Colunas" | ausência no elemento (L-012) | `src/components/app-shell.test.tsx:75` - `querySelector("a[href='/salas']") === null`; `agenda-view.test.tsx:618` - `querySelector("a[href*='salas']") === null`; `:671` - `visao: "colunas"` | ✅ PASS |
| AC6 nome da sala em "Colunas"/"Livres" abre "Sala" no dia | `/?espaco=…&data=…` | `test/components/rooms-columns.test.tsx:113`; `RV:291` | ✅ PASS |

### GERAL-12 — Livres primeiro (AC 1–5)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 livres, depois título "Ocupadas" | ordem no DOM | `test/components/rooms-free-list.test.tsx:109` - `compareDocumentPosition` lista livre → título → ocupadas; `RF:281` | ✅ PASS |
| AC2 motivo: título e horário; "Horário já passou" | "Cálculo I, 14:00–15:40" | `RF:287`, `RF:301`, `RF:323` - `toBe("Cálculo I, 14:00–15:40")`, `"Horário já passou"`; `rooms-free-list.test.tsx:126` | ✅ PASS |
| AC3 reserva: livres e ocupadas, recalcula com data/horário | `optgroup` "Livres"/"Ocupadas" | `test/components/booking-sheet.test.tsx:464`, `:490` (reordena sem nova busca; nova data busca de novo); `RV:381` | ✅ PASS |
| AC4 impedir sala ocupada | `disabled` + envio barrado | `booking-sheet.test.tsx:464` - `disabled: true`; `:587` - `createFn).not.toHaveBeenCalled()` | ✅ PASS |
| AC5 visitante sem nomes no motivo | sem nome/código | `RF:287` - sem "Ana Souza" nem "person"; `rooms-free-list.test.tsx:120`; `booking-sheet.test.tsx:529`; `RO:361` | ✅ PASS |

### GERAL-13 — Selecionar horário (AC 1–7)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 arrastar no mesmo dia: início do 1º ao fim do último, destaque em todas as salas | `08:00–12:00`, 6 quadradinhos | `RO:320` - `panelTitle()).toBe("terça 10/11 · 08:00–12:00")`, `selectedCells()` nas 3 salas; `OV:228`; navegador: arrasto real 13:30–17:30, 42 quadradinhos (2 × 21) | ❌ GAP parcial: "mesmo dia" não discrimina (M20 sobreviveu; `RO:341` termina com um clique que refaz a seleção) |
| AC2 clique no livre seleciona o bloco e sugere a sala | painel do bloco; sugerida primeiro | `RO:300` - título, `selectedCells()`, primeira livre "B-104" com "Sugerida" | ✅ PASS |
| AC3 painel: livres primeiro, depois ocupadas com o motivo | ordem e motivo | `RO:352` - nomes por lista e `"Física — 2B, 08:30–09:50"` | ❌ GAP: a ordem entre as listas não é afirmada (M30 sobreviveu) |
| AC4 filtrar por bloco e andar; ajustar início e fim | listas filtradas, trecho novo | `RO:370` - "Bloco B" → `["B-104"]`, "Andar 2" → `["A-202"]`; `RO:383` - `"terça 10/11 · 09:00–12:00"` | ✅ PASS |
| AC5 escolher livre abre reserva; visitante vê convite | `onBook({ spaceId, date, start, end })` | `RO:399` - `toHaveBeenCalledWith({ spaceId: "lab", date: TUE, start: "08:00", end: "12:00" })`; `RV:608` | ✅ PASS |
| AC6 trecho terminado sem reserva | sem botão | `RO:421`; M29 (passado vira livre) morto em `RF:212` | ✅ PASS (⚠️ trecho em andamento não especificado; M27 sobreviveu) |
| AC7 < 768 px: toque seleciona um bloco, painel ajusta | sem arrasto; fim ajustável | `RO:459` - painel ausente após toque-arrasto; `"segunda 09/11 · 08:00–12:00"` após ajuste; navegador 360 px | ✅ PASS |

### GERAL-14 — Filtro por andar (AC 1–3)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 andar = 1º dígito de letra + 3 dígitos | `A-202` → 2, `Auditório` → `null` | `RF:75` - `toBe(2)`, `toBe(1)`, `toBeNull()` (inclui `A-1000`) | ✅ PASS |
| AC2 só salas dos andares, em todas as visualizações e no painel | filtro aplicado | `RF:94`, `RF:98`, `RF:106`; `RV:226` (Colunas, "1 de 3 salas"); `RV:239` (visão geral); `RO:370` (painel). "Livres" usa o mesmo `filterRooms` que "Colunas" (`src/components/rooms/rooms-view.tsx:194`) | ✅ PASS |
| AC3 `andar` na URL | `andar: [2]`; inválidos descartados | `RV:226` - `toMatchObject({ andar: [2] })`; `test/routes/index.test.ts:63` | ✅ PASS |

**Status**: ❌ Gaps present (GERAL-13 AC1 e AC3) · ⚠️ Spec-precision gaps flagged (GERAL-10 AC1/AC3, GERAL-08 AC2, GERAL-13 AC6 em andamento, GERAL-01 AC1 URL)

---

## Edge Cases

- [x] Ocupação antes do primeiro bloco ou depois do último pinta os blocos que cruza: `OV:156`, `OV:165`; horário real no cartão: `RO:245` (`08:30–09:50` num bloco 08:00–09:50).
- [x] Matéria não extraível usa o título inteiro: `OV:33`, `OV:37`.
- [x] Filtros escondem todas as salas: "Nenhuma sala com esses filtros" e "Limpar filtros": `RV:509` (visão geral), `RV:437`, `RV:246`.
- [x] Ocupação fora de todos os blocos (risco do design): `OV:179`, `RO:474`.

---

## Discrimination Sensor

Worktree temporária `git worktree add C:\Users\luiss\wt-verify-vg HEAD --detach`, `bun install`, uma mutação por vez, só os testes relevantes, saída em arquivo e timeout de 240 s; `git status --porcelain` da temporária conferido vazio depois de cada mutação. Linha de base dos 13 arquivos relevantes: 311 pass, 0 fail.

| # | File:line | Description | Killed? |
| - | --------- | ----------- | ------- |
| M01 | `src/domain/overview.ts:67` | `cellsFor`: encostar conta como cruzar (`<`→`<=`, `>`→`>=`) | ✅ Killed (`OV:172` e 2 outros) |
| M02 | `src/domain/overview.ts:71` | `partial`: `\|\|` → `&&` | ✅ Killed (4 em `OV`, `RO:189`) |
| M03 | `src/domain/overview.ts:79` | `weekOf` começa na terça | ✅ Killed (`OV:195`, `salas.test.ts:186`, `index.test.ts:209`) |
| M04 | `src/domain/overview.ts:39` | `subjectTone` com só 2 cores | ✅ Killed (`OV:49`) |
| M05 | `src/domain/overview.ts:87` | `spanOf` termina no fim do primeiro bloco | ✅ Killed (`OV:228`, `RO:320`, `RO:399`) |
| M06 | `src/domain/overview.ts:111` | `roomsOnDay` não filtra pelo dia | ✅ Killed (`OV:264`, `RO:370`) |
| M07 | `src/domain/room-filter.ts:110` | `availabilityIn` sem o motivo `past` | ✅ Killed (`RF:301`, `rooms-free-list.test.tsx:126`) |
| M08 | `src/domain/room-filter.ts:120` | `busyReasonText` com outro formato | ✅ Killed (`RF:323`, `RO:352`, `booking-sheet.test.tsx:464`) |
| M09 | `src/domain/room-filter.ts:144` | filtro de andar: sala sem código vira andar 1 | ✅ Killed (`RF:98`, `RV:239`) |
| M10 | `src/domain/room-filter.ts:36` | `floorOf` usa o segundo dígito | ✅ Killed (`RF:75`, `RV:226`, `RO:370`) |
| M11 | `src/application/bookings.ts:377,386` | `roomsWeek` entrega pessoas ao visitante | ✅ Killed (`bookings.test.ts:941`, `booking-actions.test.ts:189`) |
| M12 | `src/application/bookings.ts:374` | `roomsWeek` consulta até domingo (inclui sábado) | ✅ Killed (`bookings.test.ts:892`, `:973`) |
| M13 | `src/routes/index.tsx:38` | `validateAgendaSearch` descarta `visao=sala` | ✅ Killed (`index.test.ts:31`) |
| M14 | `src/routes/index.tsx:29` | `sourceOf`: "Livres" carrega a semana | ✅ Killed (`index.test.ts:87`) |
| M15 | `src/routes/salas.tsx:124` | loader manda a data, não a segunda, a `getRoomsWeekFn` | ✅ Killed (`index.test.ts:209`, `salas.test.ts:186,200`) |
| M16 | `src/routes/salas.tsx:143` | `/salas` sem `visao` vai para "livres" | ✅ Killed (`salas.test.ts:268,296`) |
| M17 | `src/routes/salas.tsx:143` | `/salas` descarta os parâmetros | ✅ Killed (`salas.test.ts:268,275,281,296`) |
| M18 | `src/components/view-switcher.tsx:31` | "Sala" troca para "colunas" | ✅ Killed (`RV:268`) |
| M19 | `src/components/view-switcher.tsx:30` | `aria-pressed` sempre em "Sala" | ✅ Killed (`RV:196,268,310,471`) |
| M20 | `src/components/rooms/rooms-overview.tsx:132` | arrasto passa para outro dia | ❌ Survived |
| M21 | `src/components/rooms/rooms-overview.tsx:96` | Escape não fecha a seleção | ❌ Survived |
| M22 | `src/components/rooms/overview-cell.tsx:201` | Escape não fecha o cartão | ❌ Survived |
| M23 | `src/components/rooms/rooms-overview.tsx:126` | arrasto também no toque/celular | ✅ Killed (`RO:459`) |
| M24 | `src/components/rooms/overview-cell.tsx:202` | Espaço no ocupado não seleciona | ✅ Killed (`RO:442`) |
| M25 | `src/components/rooms/overview-selection.tsx:81` | sala sugerida não vem primeiro | ✅ Killed (`RO:300`, `RO:433`) |
| M26 | `src/components/rooms/overview-selection.tsx:79` | painel ignora filtros de bloco e andar | ✅ Killed (`RO:370`) |
| M27 | `src/components/rooms/overview-selection.tsx:78` | "terminou" usa o início (trecho em andamento vira terminado) | ❌ Survived |
| M28 | `src/components/rooms/overview-selection.tsx:78` | painel nunca reconhece trecho terminado | ✅ Killed (`RO:421`) |
| M29 | `src/domain/room-filter.ts:77` | trecho passado conta como livre (reserva no passado) | ✅ Killed (`RF:212`, `RF:301`, `rooms-free-list.test.tsx:126`) |
| M30 | `src/components/rooms/overview-selection.tsx:164` | painel desenha "Ocupadas" antes de "Livres" | ❌ Survived |
| M31 | `src/components/agenda/booking-sheet.tsx` (optgroup "Ocupadas") | ocupada não fica desabilitada | ✅ Killed (`booking-sheet.test.tsx:464,490`, `RV:381`) |
| M32 | `src/components/agenda/booking-sheet.tsx` (`validateClient`) | envio com sala ocupada não é barrado | ✅ Killed (`booking-sheet.test.tsx:587`) |
| M33 | `src/components/agenda/booking-sheet.tsx` (`select` da sala) | sala travada quando vem do painel | ✅ Killed (`RV:566`) |
| M34 | `src/components/rooms/overview-cell.tsx:128` | visitante vê a pessoa no cartão | ✅ Killed (`RO:274`) |
| M35 | `src/components/app-shell.tsx:60` | volta o item "Salas" no menu | ✅ Killed (`app-shell.test.tsx:66,75` e menu do celular) |
| M36 | `src/components/agenda/agenda-view.tsx:63` | "Ver todas as salas" leva a "Livres" | ✅ Killed (`agenda-view.test.tsx:671`) |

Todos os mortos falharam nas asserções esperadas (conferido pelo nome dos testes que caíram), não por erro de sintaxe.

**Sensor depth**: expandido (36 mutações manuais; privacidade e reserva no passado tratadas como críticas)
**Result**: 31/36 killed - FAIL ❌

---

## Interactive UAT Results

Não houve UAT com o usuário. Verificação no navegador feita pelo verificador (playwright-cli, servidor `vite dev` na worktree temporária, porta 3317, banco SQLite temporário criado com as migrações e dados fictícios: 21 salas, semestre de exemplo com 7 blocos, 654 aulas; visitante com `PUBLIC_READ=true`; banco apagado ao final).

| # | Test | Result | Details |
| - | ---- | ------ | ------- |
| 1 | 1280 × 800, `/?visao=geral&data=2026-11-04` | ✅ Pass | `scrollHeight` 800, `scrollWidth` 1280: sem rolagem vertical nem horizontal; 21 salas × 35 = 735 quadradinhos |
| 2 | Arrasto real com o mouse (quinta, T12 → T34) | ✅ Pass | painel "quinta 05/11 · 13:30–17:30", 42 quadradinhos destacados (2 blocos × 21 salas), 2 livres antes de 19 ocupadas com o motivo, sem nomes; `scrollHeight` 800 com o painel |
| 3 | Escape com o painel aberto | ✅ Pass | painel fecha, legenda volta, 0 selecionados |
| 4 | Hover num ocupado (visitante) | ✅ Pass | cartão "Cálculo I · Turma T1 · A-101 · segunda 02/11 · 07:30–09:20", sem avatar nem nome |
| 5 | `/salas?data=2026-11-04&bloco=A` | ✅ Pass | `/?data=2026-11-04&bloco=["A"]&visao=colunas`, "Colunas" marcada, sem link para `/salas` |
| 6 | 360 × 740 em `/` | ✅ Pass | "Sala" marcada, sem rolagem horizontal |
| 7 | 360 × 740 na visão geral | ✅ Pass | abas "Seg 02"–"Sex 06" com quarta aberta, quadradinhos 32 × 32 px, grade sem rolagem horizontal; toque num livre selecionou o bloco nas 21 salas |
| 8 | Console | ✅ Pass | 0 erros; 1 aviso pré-existente do TanStack Router sobre `minhas-reservas.tsx` |

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (`PlaceChips`/`WindowFields` extraídos para reuso no painel) |
| No scope creep | ✅ (Escape e "Sugerida" vêm do design/tarefas) |
| Matches patterns | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ GERAL-10 AC1/AC3 afirmam o comportamento da T17, contrário ao texto do AC |
| Per-layer Coverage Expectation met | ⚠️ componentes: arrasto entre dias, ordem do painel e Escape sem teste discriminante |
| Every test maps to a spec requirement | ⚠️ Escape e Espaço (`RO:442`) não têm AC na spec; vêm do desvio da T17 |
| Documented guidelines followed: `package.json` (`check`), `bunfig.toml` (cobertura 90%, `src/components/**` fora) | ✅ |

---

## Gate Check

- **Gate command**: `bun run check` (saída em `C:\Users\luiss\tcc\tmp\verify-vg.log`, fora do repositório)
- **Result**: exit 0. Biome sem problemas (315 arquivos), `tsc` sem erros, knip limpo, depcruise sem violações, **1390 pass, 2 skip, 0 fail** (1392 testes, 103 arquivos), cobertura de linhas 99,76% (limite 90%), betterleaks "no leaks found"
- **Test count before feature** (`9bf1fc1`, medido na worktree temporária): 1260 (1258 pass, 2 skip)
- **Test count after feature**: 1392
- **Delta**: +132
- **Skipped tests**: "arquivo real de data/real" e "reservas no D1 local", pré-existentes e dependentes de ambiente
- **Failures**: nenhuma
- Testes reescritos (T5, T10→T17, T11, T14, T15) mudaram de comportamento esperado conforme as tarefas; não houve asserção enfraquecida sem justificativa.

---

## Fix Plans

### Fix 1: arrasto entre dias sem teste discriminante (Major)

- **Root cause**: `RO:341` faz o arrasto de terça para quarta e, antes de afirmar, clica no quadradinho inicial, o que refaz a seleção de um bloco; com M20 (arrasto atravessa dias) o resultado final é o mesmo.
- **Fix task**: em `RO:341`, afirmar `panelTitle()` e `selectedCells()` logo após o `pointerUp`, sem o clique (esperado: nenhum painel ou só terça, nunca o bloco M34 de quarta convertido em índice de terça).
- **Priority**: Major (GERAL-13 AC1)

### Fix 2: ordem livres → ocupadas no painel não afirmada (Major)

- **Root cause**: `RO:352` lê cada lista pelo rótulo; a posição das listas no DOM não é conferida.
- **Fix task**: afirmar com `compareDocumentPosition` que "Salas livres no horário" vem antes do título "Ocupadas" e de "Salas ocupadas no horário", como em `rooms-free-list.test.tsx:109`.
- **Priority**: Major (GERAL-13 AC3)

### Fix 3: spec contraditória depois da T17 (Major, só spec)

- **Root cause**: a T17 trocou a reserva direta pelo painel, mas GERAL-10 AC1 e AC3 continuam dizendo que o clique no quadradinho livre abre a reserva ou o convite.
- **Fix task**: reescrever GERAL-10 AC1/AC3 para "o clique seleciona o bloco (GERAL-13 AC2) e 'Reservar' no painel abre a reserva preenchida / o convite"; em GERAL-08 AC2 registrar que a visão geral não tem janela nem "Só livres"; em GERAL-01 AC1 trocar `/salas?visao=geral` por `/?visao=geral`.
- **Priority**: Major

### Fix 4: Escape sem teste (Minor)

- **Root cause**: o Escape que fecha a seleção (`rooms-overview.tsx:96`) e o cartão (`overview-cell.tsx:201`) não tem teste nem AC.
- **Fix task**: acrescentar o comportamento à spec (GERAL-13 e GERAL-06) e dois testes: `fireEvent.keyDown(document, { key: "Escape" })` fecha o painel e devolve a legenda; Escape no ocupado focado remove o `tooltip`.
- **Priority**: Minor

### Fix 5: trecho em andamento no painel (Minor)

- **Root cause**: a spec só define o trecho terminado; o em andamento (lista tudo como ocupado com "Horário já passou") não tem AC nem teste (M27).
- **Fix task**: definir na spec o comportamento do trecho em andamento e testar com `now` entre o início e o fim do bloco: nenhuma livre, motivo "Horário já passou", sem "Esse horário já terminou".
- **Priority**: Minor

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| GERAL-01 | Done | ✅ Verified |
| GERAL-02 | Done | ✅ Verified |
| GERAL-03 | Done | ✅ Verified |
| GERAL-04 | Done | ✅ Verified |
| GERAL-05 | Done | ✅ Verified |
| GERAL-06 | Done | ✅ Verified |
| GERAL-07 | Done | ✅ Verified |
| GERAL-08 | Done | ❌ Needs Fix (spec: "Só livres" na visão geral) |
| GERAL-09 | Done | ✅ Verified |
| GERAL-10 | Done | ❌ Needs Fix (spec contraditória com GERAL-13) |
| GERAL-11 | Done | ✅ Verified |
| GERAL-12 | Done | ✅ Verified |
| GERAL-13 | Done | ❌ Needs Fix (M20, M30; M21, M27) |
| GERAL-14 | Done | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready (lacunas de teste e de spec; o comportamento observado no navegador está correto)

**Spec-anchored check**: 46 de 51 linhas com o valor da spec afirmado; 2 com teste não discriminante (GERAL-13 AC1, AC3); 3 spec-precision gaps (GERAL-10 AC1 e AC3, GERAL-08 AC2) e 2 notas de precisão em linhas aprovadas (GERAL-13 AC6 em andamento, GERAL-01 AC1 URL)
**Sensor**: 31/36 mutations killed
**Gate**: 1390 passed, 0 failed, 2 skipped

**What works**: grade, cores e contraste, destaque, cartão sem pessoas para o visitante (no servidor e na tela), página única com "Sala" padrão, redirecionamento de `/salas`, menu sem "Salas", "Ver todas as salas" → "Colunas", livres primeiro com o motivo, filtro por andar, painel de seleção com filtros, reserva sem trecho passado, sala editável na reserva; L-010 (loader afirma o argumento) e L-012 (ausência afirmada no elemento) aplicadas.

**Issues found** (ranqueadas):
1. Arrasto entre dias sem teste discriminante (M20) - GERAL-13 AC1 - `test/components/rooms-overview.test.tsx:341`
2. Ordem livres → ocupadas no painel não afirmada (M30) - GERAL-13 AC3 - `test/components/rooms-overview.test.tsx:352`
3. Spec contraditória: GERAL-10 AC1/AC3 × GERAL-13 AC2 - `docs/specs/features/visao-geral/spec.md:146,148`
4. "Só livres" fora da visão geral decidido só no design - GERAL-08 AC2 - `docs/specs/features/visao-geral/spec.md:114`
5. Escape (painel e cartão) sem teste nem AC (M21, M22) - `src/components/rooms/rooms-overview.tsx:96`, `src/components/rooms/overview-cell.tsx:201`
6. Trecho em andamento sem AC nem teste (M27) - GERAL-13 AC6 - `src/components/rooms/overview-selection.tsx:78`
7. GERAL-01 AC1 ainda cita `/salas?visao=geral` - `docs/specs/features/visao-geral/spec.md:57`
8. `/salas?espaco=…` perde `espaco` no redirecionamento (`validateSalasSearch` não conhece o parâmetro); a spec diz "mantendo os parâmetros" - `src/routes/salas.tsx:143` (baixa: `/salas` nunca usou `espaco`)

**Next steps**: implementar os Fixes 1–5 (testes e spec; nenhum código de produção precisa mudar) e redespachar o verificador.

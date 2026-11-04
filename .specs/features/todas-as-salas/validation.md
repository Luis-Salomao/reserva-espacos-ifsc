# Todas as salas: validação

## Validation: todas-as-salas - FAIL ❌

**Result**: FAIL ❌ (3 mutantes sobreviventes; 1 AC sem evidência)

**Date**: 2026-11-04
**Spec**: `.specs/features/todas-as-salas/spec.md`
**Diff range**: `6181b01..ccaf569` (branch `feat/todas-as-salas`, 10 commits, 28 arquivos)
**Verifier**: subagente independente (autor ≠ verificador); cobertura re-derivada do zero, sem usar o relatório do autor.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `listActiveInRangeAll` | ✅ Done | `src/infra/db/flow/occupation-repository.test.ts:133`, `:164` |
| T2 `bookings.roomsDay` | ✅ Done | `src/application/bookings.test.ts:662` (6 testes) |
| T3 `getRoomsDayFn` | ✅ Done | `src/server/booking-actions.test.ts:124` (3 testes) |
| T4 `room-filter` | ✅ Done | `src/domain/room-filter.test.ts` (20 testes); desvio de `defaultWindow(now)` registrado |
| T5 Rota `/salas` | ⚠️ Partial | validação de URL coberta; `loaderDeps` (só `data` vai ao servidor) sem teste (M13 sobreviveu) |
| T6 Navegação | ⚠️ Partial | item "Salas" e link "Todas as salas" cobertos; opção "Ver todas as salas" no seletor de sala adiada (desvio registrado) |
| T7 `RoomsFilters` | ✅ Done | `test/components/rooms-filters.test.tsx` (11 testes) |
| T8 `RoomsColumns` | ⚠️ Partial | eixo e nomes fixos (`sticky`) sem asserção (M26, M27 sobreviveram) |
| T9 `RoomsFreeList` | ✅ Done | `test/components/rooms-free-list.test.tsx` (4 testes) |
| T10 `RoomsView` | ✅ Done | `test/components/rooms-view.test.tsx` (16 testes); verificação manual em 360/1280 px declarada, sem artefato no repositório |

---

## Spec-Anchored Acceptance Criteria

### P1: Ver todas as salas lado a lado num dia

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| Colunas 1: abrir `/salas?data=` → uma coluna por sala, ordem natural | `A-202` antes de `A-1000`; ocupações do dia em cada sala | `src/application/bookings.test.ts:676` - `expect(rooms.map(r => r.space.name)).toEqual(["A-202","A-1000","ADM 2","B-104","LAB 1"])`; `src/application/bookings.test.ts:695` - `expect(room("B-104")?.occupations…).toEqual([["MAT1","08:00","09:50"]])`; `test/components/rooms-columns.test.tsx:102` - links `toEqual(["A-202","B-104","LAB 1"])` e `Cálculo I` só na coluna `a202` (`:108-109`); `src/infra/db/flow/occupation-repository.test.ts:157-161` - por sala e início, sem canceladas nem outro dia | ✅ PASS |
| Colunas 2: trocar o dia → uma única chamada ao servidor | 1 chamada por dia, uma consulta de ocupações | `src/application/bookings.test.ts:793` - `expect(calls).toEqual({ all: 1, one: 0 })`; `test/routes/salas.test.ts:102` - `expect(calls).toEqual(["2026-11-03"])`; `test/components/rooms-view.test.tsx:196` - `search toMatchObject({ data: "2030-11-13" })` | ✅ PASS |
| Colunas 3: clicar no nome → agenda da sala no mesmo dia | `/?espaco=ID&data=AAAA-MM-DD` | `test/components/rooms-columns.test.tsx:113` - `getAttribute("href")).toBe(\`/?espaco=b104&data=${DATE}\`)` | ✅ PASS |
| Colunas 4: < 768 px, "Colunas" rola na horizontal dentro da grade, eixo e nomes fixos, sem rolagem da página | rolagem interna; eixo de horas e nomes `sticky`; página sem rolagem horizontal | `test/components/rooms-columns.test.tsx:157-159` - `className toContain("overflow-auto")`, `gridTemplateColumns toBe("52px repeat(3, minmax(140px, 1fr))")`. Nada afirma eixo/nomes fixos nem a ausência de rolagem da página; M26 e M27 sobreviveram | ❌ GAP (teste fraco) |
| Colunas 5: nome do responsável só para logado | logado: `{ name, code }`; visitante: `person: null`, sem nome/iniciais/id | `src/application/bookings.test.ts:765` - `visitor…person).toEqual([null, null])` e `:767-769` - JSON `not.toContain` ids, `"Pessoa"`, `"DOCA"`, `"DOCB"`; `src/server/booking-actions.test.ts:146` - `["LAB 1", [["MAT1", null]]]` + `:149-150` `not.toContain`; logado `src/application/bookings.test.ts:756` e `src/server/booking-actions.test.ts:155` - `person toEqual({ name: "Pessoa doca", code: "DOCA" })` | ✅ PASS |
| Colunas 6: data inválida na URL → hoje | data descartada; dia de hoje no fuso | `test/routes/salas.test.ts:56` - `validateSalasSearch({ data }) toEqual({})` para `"2026-02-30"`, `"10/11/2026"`, `""`, número, `null`; `test/routes/salas.test.ts:103` - `selectedDate toBe("2026-11-03")` | ✅ PASS |

### P1: Filtrar salas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Filtros 1: um ou mais blocos | só salas desses blocos | `src/domain/room-filter.test.ts:75` - bloco A `toEqual(["A-202","A-1000","Lab. A102"])`; `:80` - `["B","Outros"]` → `["B-104","Auditório","ADM 2"]`; `test/components/rooms-view.test.tsx:171-175` - `bloco: ["B"]` na URL, só a coluna `b104` | ✅ PASS |
| Filtros 2: capacidade mínima N | só capacidade cadastrada ≥ N | `src/domain/room-filter.test.ts:96` - N=25 → `["A-202","B-104","Auditório"]` (inclui o limite 25) | ✅ PASS |
| Filtros 3: aviso das salas sem capacidade | "X salas sem capacidade cadastrada ficaram de fora" | `src/domain/room-filter.test.ts:97` - `hiddenNoCapacity toBe(2)`; `:107` - conta só as que passariam nos outros filtros; `test/components/rooms-filters.test.tsx:96` - `"18 salas sem capacidade cadastrada ficaram de fora"`; `test/components/rooms-view.test.tsx:305` - singular `"1 sala sem capacidade cadastrada ficou de fora"` | ✅ PASS (⚠️ singular não está na spec) |
| Filtros 4: busca sem caixa nem acento | nome contém o texto | `src/domain/room-filter.test.ts:111-116` - `"auditorio"`, `"AUDITÓ"` → `["Auditório"]`; `" lab "` → `["Lab. A102"]`; `"xyz"` → `[]` | ✅ PASS |
| Filtros 5: "Só livres" | sem ocupação que cruze a janela | `src/domain/room-filter.test.ts:120` - 14:00–16:00 → `["A-202","Lab. A102","Auditório","ADM 2"]`; `:131` - 12:00–14:00 mantém todas; `:135` - bloco A + só livres | ✅ PASS |
| Filtros 6: filtro na URL + "X de 21 salas" | URL reflete; contador | `test/components/rooms-view.test.tsx:171-172` - `bloco: ["B"]` e `"1 de 3 salas"`; `:177-182` - `livres: true`, `ini`/`fim`; `test/components/rooms-filters.test.tsx:95` - `"3 de 21 salas"` | ✅ PASS (⚠️ spec fixa "21") |
| Filtros 7: nenhuma sala passa | "Nenhuma sala com esses filtros" + "Limpar filtros" | `test/components/rooms-view.test.tsx:296-299` - texto, clique, `search toEqual({})`; `test/components/rooms-free-list.test.tsx:94-96` | ✅ PASS |
| Filtros 8: < 768 px, botão "Filtros" com contador | "Filtros (n)" | `test/components/rooms-filters.test.tsx:111` - `getByRole("button", { name: "Filtros (3)" })`; `:119` - sem filtro, `"Filtros"`; `test/components/rooms-view.test.tsx:206` | ✅ PASS |

### P1: Listar salas livres num horário

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Livres 1: lista das salas livres com nome, bloco e capacidade | só inteiramente livres; nome, bloco, capacidade | `test/components/rooms-free-list.test.tsx:60-68` - `["A-202","Auditório"]`, `"Bloco A"`, `"40 lugares"`, `"Outros espaços"`, `"Capacidade não cadastrada"` | ✅ PASS |
| Livres 2: janela muda → recalcula sem nova chamada ao servidor | nenhuma chamada nova enquanto o dia for o mesmo | nenhuma evidência. `src/routes/salas.tsx:119` (`loaderDeps: ({ search: { data } }) => ({ data })`) não é exercitado por nenhum teste; trocar para `({ search }) => search` (M13) mantém todos os testes verdes. O harness de `test/components/rooms-view.test.tsx:91` usa uma rota raiz própria, sem `loaderDeps` | ❌ GAP (sem evidência) |
| Livres 3: trecho passado de hoje indisponível | início ≤ agora conta como ocupado | `src/domain/room-filter.test.ts:169-172` - 08:00 e 09:00 com agora 09:00 → `false`; 09:30 → `true`; dia passado → `false` | ✅ PASS |
| Livres 4: fim ≤ início | "O fim precisa ser depois do início" e mantém a lista | `src/domain/room-filter.test.ts:178-184`; `test/components/rooms-view.test.tsx:290-291` - `alert textContent toBe("O fim precisa ser depois do início")` e `freeNames() toEqual(["B-104","LAB 1"])` | ✅ PASS |
| Livres 5: < 768 px abre em "Livres" sem visão na URL | visão "Livres" | `test/components/rooms-view.test.tsx:202-205` - `aria-pressed "true"` em "Livres", `["B-104","LAB 1"]`; `:213` - `visao=colunas` prevalece | ✅ PASS |

### P2: Reservar a partir de todas as salas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Reservar 1: arrastar numa coluna cria rascunho naquela sala; mover, redimensionar, Esc | rascunho na sala; mesmo comportamento da agenda | `test/components/rooms-columns.test.tsx:126` - `aria-label toBe("Rascunho 14:00–15:30. Abrir para reservar")` só em `b104`; `test/components/rooms-view.test.tsx:233` - Esc → `toHaveLength(0)`; mover/redimensionar pelo componente reutilizado: `test/components/draft-booking.test.tsx:121`, `:131` | ✅ PASS |
| Reservar 2: clicar no rascunho → "Nova reserva" com sala, data e horário | sala, data, início, fim do rascunho | `test/components/rooms-view.test.tsx:222-225` - `Sala "b104"`, `Data DATE`, `Início "14:00"`, `Fim "15:30"`; `test/components/rooms-columns.test.tsx:140` | ✅ PASS |
| Reservar 3: "Reservar" na lista → "Nova reserva" com sala, data e janela | sala, data, janela | `test/components/rooms-view.test.tsx:252-254` - `Sala "lab"`, `Início "14:00"`, `Fim "16:00"`; `:261` - `createFn data toMatchObject({ spaceId: "lab", date: DATE, start: "14:00", end: "16:00" })`; `test/components/rooms-free-list.test.tsx:74` | ✅ PASS |
| Reservar 4: reserva criada → atualiza sem recarregar | dados recarregados pelo roteador | `test/components/rooms-view.test.tsx:267` - `expect(loads.count).toBeGreaterThan(before)` | ✅ PASS |
| Reservar 5: visitante ou sem papel → sem rascunho e sem "Reservar" | escondidos | `test/components/rooms-view.test.tsx:274`, `:282`; `test/components/rooms-free-list.test.tsx:85`; `test/components/rooms-columns.test.tsx:151`; `test/routes/salas.test.ts:119` - visitante `canBook toBe(false)` | ✅ PASS |
| Reservar 6: no máximo um rascunho na tela | 1 rascunho | `test/components/rooms-columns.test.tsx:130-132` - após desenhar em `lab`, `drafts() toHaveLength(1)` e nenhum em `b104` | ✅ PASS |

**Status**: ❌ Gaps present (Colunas 4 e Livres 2); ⚠️ spec-precision gaps flagged (ver abaixo).

### Privacidade (Success Criteria 3)

Visitante nunca recebe nome nem iniciais: `toItem` zera `person` quando `viewer === null` (`src/application/bookings.ts:173`) e `peopleFor(null)` devolve o mapa vazio (`src/application/bookings.ts:218`). Coberto no serviço (`src/application/bookings.test.ts:765-769`) e na ação HTTP (`src/server/booking-actions.test.ts:146-150`). O mutante M7, que vaza pessoas para o visitante, morreu nos dois.

---

## Discrimination Sensor

Executado numa worktree temporária (`C:\Users\luiss\wt-verify-salas`, `HEAD` destacado), uma mutação por vez, só os testes relevantes. Baseline nessa worktree: 119 testes, 0 falhas.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M1 | `src/domain/room-filter.ts:89` | `capacity >= minCapacity` → `>` | ✅ Killed (`room-filter.test.ts` capacidade N) |
| M2 | `src/domain/room-filter.ts:59` | início `<= now` → `< now` (trecho passado) | ✅ Killed (`isFreeIn` trecho passado) |
| M3 | `src/domain/room-filter.ts:45` | remove a retirada de acentos | ✅ Killed (busca sem acento) |
| M4 | `src/domain/room-filter.ts:78` | não ignora bloco inexistente | ✅ Killed (bloco inexistente) |
| M5 | `src/domain/room-filter.ts:83` | "só livres" sempre verdadeiro | ✅ Killed (só livres; bloco A + só livres) |
| M6 | `src/application/bookings.ts:328` | ordem natural → comparação lexical | ✅ Killed (ordem natural) |
| M7 | `src/application/bookings.ts:315`, `:322` | visitante tratado como logado (vaza pessoas) | ✅ Killed (serviço e ação HTTP) |
| M8 | `src/application/bookings.ts:318` | todo semestre "cobre" o dia | ✅ Killed (dia fora de semestre) |
| M9 | `src/application/bookings.ts:330` | toda sala recebe todas as ocupações | ✅ Killed (4 testes) |
| M10 | `src/routes/salas.tsx:26` | capacidade aceita 1000 | ✅ Killed (`salas.test.ts` 1–999) |
| M11 | `src/routes/salas.tsx:45` | aceita data com formato válido mas inexistente | ✅ Killed (data inválida) |
| M12 | `src/routes/salas.tsx:19` | aceita qualquer texto como bloco | ✅ Killed (bloco inexistente) |
| M13 | `src/routes/salas.tsx:119` | `loaderDeps` passa a depender de toda a URL (janela e filtros recarregam do servidor) | ❌ Survived → fix task 1 |
| M14 | `src/components/rooms/rooms-columns.tsx:88` | rascunho em todas as colunas | ✅ Killed (4 testes) |
| M15 | `src/components/rooms/rooms-columns.tsx:91` | rascunho gravado na primeira sala | ✅ Killed (3 testes) |
| M16 | `src/components/rooms/rooms-columns.tsx:63` | link sem `data` | ✅ Killed (link da agenda) |
| M17 | `src/components/rooms/rooms-free-list.tsx:26` | lista sem filtrar por janela livre | ✅ Killed (6 testes) |
| M18 | `src/components/rooms/rooms-free-list.tsx:56` | "Reservar" visível sem permissão | ✅ Killed (lista e visitante) |
| M19 | `src/components/rooms/rooms-free-list.tsx:66` | "Reservar" envia fim do trecho livre em vez da janela | ✅ Killed (lista e view) |
| M20 | `src/components/rooms/rooms-view.tsx:125` | celular não abre em "Livres" | ✅ Killed (celular) |
| M21 | `src/components/rooms/rooms-view.tsx:134` | janela inválida não mantém a lista anterior | ✅ Killed (fim antes do início) |
| M22 | `src/components/rooms/rooms-view.tsx:160` | Esc não descarta | ✅ Killed (Esc) |
| M23 | `src/components/rooms/rooms-view.tsx:90` | "Só livres" não vai para a URL | ✅ Killed (filtros na URL) |
| M24 | `src/components/rooms/rooms-view.tsx:167` | visitante abre a reserva em vez do aviso de login | ✅ Killed (visitante) |
| M25 | `src/components/rooms/rooms-view.tsx:147` | contador usa o total em vez das filtradas | ✅ Killed (2 testes) |
| M26 | `src/components/rooms/rooms-columns.tsx:59` | cabeçalho com nomes deixa de ser `sticky` | ❌ Survived → fix task 2 |
| M27 | `src/components/rooms/rooms-columns.tsx:71` | eixo de horas deixa de ser `sticky` | ❌ Survived → fix task 2 |

**Sensor depth**: expandido (27 mutantes manuais cobrindo domínio, serviço, rota, colunas, lista e view).
**Result**: 24/27 killed - FAIL ❌

Isolamento: `git status --porcelain` da worktree verificada vazio antes e depois; worktree temporária removida (`git worktree list` sem ela).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ⚠️ `onOpenOccupation` em `src/components/rooms/rooms-columns.tsx:21` nunca é passado por `RoomsView` (clicar numa ocupação está fora da spec) |
| Surgical changes | ✅ `test/booking-env.ts` só extrai `bookingDeps` para os testes; `agenda-view.test.tsx` passou a usar `renderAgenda` por causa do novo `Link` |
| No scope creep | ✅ |
| Matches patterns | ✅ segue `validateAgendaSearch`, `asReader`, `DayColumn` |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ 2 ACs com gap (Colunas 4, Livres 2) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ⚠️ domínio 1:1 e 100% de cobertura; rota sem teste de `loaderDeps` |
| Every test maps to a spec requirement - no unclaimed tests | ✅ testes de `PUBLIC_READ=false` (`src/server/booking-actions.test.ts:162`, `test/routes/salas.test.ts:164`) mapeiam a premissa "Visitante: mesma regra da agenda atual" |
| Documented guidelines followed: `package.json` (`check`), `bunfig.toml` (cobertura 90%) | ✅ |

---

## Edge Cases

- [x] Sem salas cadastradas: "Nenhuma sala cadastrada" e atalho só para admin - `test/components/rooms-view.test.tsx:322-325`, `:331`; serviço devolve `rooms: []` em `src/application/bookings.test.ts:824-827`
- [x] Falha do servidor: mantém filtros, "Não foi possível carregar as salas" e "Tentar de novo" - `test/components/rooms-view.test.tsx:314-317` (`search toEqual({ bloco: ["A"] })`, `onRetry` 1 vez); `test/routes/salas.test.ts:130-141`
- [x] Dia fora de semestre: avulsas sem grade de blocos - `src/application/bookings.test.ts:806-809` (`blocks toEqual([])`, `["Recesso"]`)
- [x] Bloco inexistente na URL ignorado - `test/routes/salas.test.ts:70-76` (formato); `src/domain/room-filter.test.ts:88-91` (sem sala)
- [x] Capacidade fora de 1–999 ou não inteira ignorada - `test/routes/salas.test.ts:61-66`

---

## Spec-precision gaps

1. Filtros 6 fixa "X de 21 salas"; o total real é dinâmico (a implementação mostra "X de N"). A spec também não diz o que X conta na visão "Livres" (a implementação conta as salas livres na janela).
2. Filtros 3 só define a forma plural; a implementação tem a forma singular "1 sala … ficou de fora".
3. Colunas 4 e Success Criteria 2 ("sem rolagem horizontal da página em 360 px") não dizem como verificar. O happy-dom não mede rolagem, e o repositório não tem teste e2e; a verificação manual com Playwright citada em T10 não deixou artefato.
4. A premissa "Janela padrão: arredondado para 30 min" é ambígua; a implementação começa no meio horário seguinte a agora (09:00 → 09:30), desvio registrado em T4 e coberto em `src/domain/room-filter.test.ts:194-196`.
5. A premissa "opção 'Ver todas as salas' no seletor de sala" não foi entregue (desvio de T6, aguarda `room-selector.tsx`). Premissa ainda não confirmada.

---

## Gate Check

- **Gate command**: `bun run check` (lint, typecheck, knip, depcruise, `bun test --coverage`, betterleaks)
- **Result**: exit 0; 1159 passed, 0 failed, 2 skipped
- **Test count before feature**: ≈1081 (1161 − 80 testes adicionados no diff, 0 removidos)
- **Test count after feature**: 1161
- **Delta**: +80
- **Skipped tests**: `arquivo real de data/real > nenhum XML em data/real` e `reservas no D1 local > criar, conflito, corrida, cancelar e série por posse`, ambos anteriores à feature e dependentes de dados locais
- **Coverage**: `src/domain/room-filter.ts`, `src/application/bookings.ts`, `src/infra/db/repos/occupation-repository.ts`, `src/server/booking-actions.ts` em 100% de linhas e funções
- **Failures**: nenhuma

---

## Fix Plans

### Fix 1: Livres 2 sem evidência (M13 sobreviveu)

- **Root cause**: o único mecanismo que impede nova chamada ao mudar janela/filtros é `loaderDeps` em `src/routes/salas.tsx:119`, e nenhum teste o exercita.
- **Fix task**: em `test/routes/salas.test.ts`, afirmar que `Route.options.loaderDeps({ search: { data: "2026-11-10", ini: "14:00", fim: "16:00", bloco: ["A"], cap: 20, q: "lab", livres: true, visao: "livres" } })` é exatamente `{ data: "2026-11-10" }`, ou montar a rota real num roteador de memória e contar chamadas de `getRoomsDayFn` ao trocar `ini`/`fim` (0) e `data` (1).
- **Priority**: Major

### Fix 2: Colunas 4 com teste fraco (M26, M27 sobreviveram)

- **Root cause**: `test/components/rooms-columns.test.tsx:154` só afirma `overflow-auto` e o template da grade; eixo e cabeçalho fixos não são verificados.
- **Fix task**: afirmar `sticky` + `top-0` no cabeçalho de cada sala e `sticky` + `left-0` no contêiner do eixo; para "sem rolagem da página", adicionar um teste e2e com Playwright em 360 px (`document.documentElement.scrollWidth <= innerWidth`) ou registrar na spec que a verificação é manual.
- **Priority**: Minor

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| SALAS-01 | Implemented | ✅ Verified |
| SALAS-02 | Implemented | ✅ Verified |
| SALAS-03 | Implemented | ❌ Needs Fix (AC 4) |
| SALAS-04 | Implemented | ✅ Verified |
| SALAS-05 | Implemented | ✅ Verified |
| SALAS-06 | Implemented | ✅ Verified |
| SALAS-07 | Implemented | ✅ Verified |
| SALAS-08 | Implemented | ✅ Verified |
| SALAS-09 | Implemented | ❌ Needs Fix (AC 2) |
| SALAS-10 | Implemented | ✅ Verified |
| SALAS-11 | Implemented | ✅ Verified |
| SALAS-12 | Implemented | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 23/25 ACs com o resultado da spec; 2 gaps (Colunas 4, Livres 2); 5 spec-precision gaps
**Sensor**: 24/27 mutations killed
**Gate**: 1159 passed, 0 failed, 2 skipped (pré-existentes)

**What works**: filtros puros com 100% de cobertura e testes 1:1, privacidade do visitante no serviço e na ação, ordem natural, consulta única, validação da URL, rascunho único por sala, lista de livres, reserva e recarga.

**Issues found**: Fix 1 (testar `loaderDeps`) e Fix 2 (testar `sticky` e a rolagem da página).

**Next steps**: rotear Fix 1 e Fix 2 para um implementador e re-verificar (iteração 1 de 3).

# Todas as salas: validação

## Validation: todas-as-salas - FAIL ❌

**Result**: FAIL ❌ (rodada 2 de 3: 1 defeito de produção em Colunas AC4 achado no navegador; 2 mutantes novos sobreviveram)

**Date**: 2026-11-04
**Spec**: `.specs/features/todas-as-salas/spec.md`
**Diff range**: `6181b01..ec25b7a` (branch `feat/todas-as-salas`, 12 commits; correção da rodada 1 em `ec25b7a`)
**Verifier**: subagente independente (autor ≠ verificador); cobertura re-derivada do zero, sem confiar no relatório da rodada 1.

---

## Lacunas da rodada 1

| # | Lacuna | Situação | Evidência |
| - | ------ | -------- | --------- |
| 1 | Livres AC2 sem teste; M13 sobreviveu | ✅ Fechada | `test/routes/salas.test.ts:156-176` - `expect(deps(changed)).toEqual({ data: "2026-11-10" })`, `toEqual(deps(base))`, `deps({ data: "2026-11-11" })).not.toEqual(deps(base))`. M13 e a variante N2 (só `ini` nas deps) morreram. O teste prova "sem nova chamada" porque, no TanStack Router 1.171.39, uma navegação que só muda a busca recarrega apenas se o id da rota (que inclui o hash das deps) mudar: `node_modules/@tanstack/router-core/src/load-client.ts:816-827` (`match.cause === 'enter'` ou candidato com outro `id`) e `:2014` (`forceStaleReload = sameHref`, falso quando a busca muda) |
| 2 | Colunas AC4: nomes e eixo fixos sem asserção; M26, M27 sobreviveram | ⚠️ Parcial | `test/components/rooms-columns.test.tsx:162-177` afirma `sticky top-0` nos cabeçalhos, `sticky left-0` no eixo e no canto; M26 e M27 morreram. Mas no navegador o eixo não fica fixo (ver Colunas 4) |
| 3 | Imprecisões da spec | ✅ Fechada | `spec.md:31` janela padrão com exemplos (13:07 → 13:30–14:30; 13:30 → 14:00–15:00); `spec.md:71` singular; `spec.md:74` "X de N salas" e o que X conta na visão "Livres" |
| 4 | `onOpenOccupation` sem uso | ✅ Fechada | removido de `src/components/rooms/rooms-columns.tsx` (nenhuma ocorrência em `src/components/rooms`) |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `listActiveInRangeAll` | ✅ Done | N7 (sem filtro de status) morreu em `src/infra/db/flow/occupation-repository.test.ts` |
| T2 `bookings.roomsDay` | ✅ Done | N8 (intervalo de 2 dias) morreu |
| T3 `getRoomsDayFn` | ✅ Done | - |
| T4 `room-filter` | ✅ Done | N3, N6 morreram |
| T5 Rota `/salas` | ⚠️ Partial | `loaderDeps` coberto; o `loader` pode ignorar `deps.data` sem teste falhar (N1 sobreviveu) |
| T6 Navegação | ⚠️ Partial | opção "Ver todas as salas" no seletor de sala segue adiada (desvio registrado) |
| T7 `RoomsFilters` | ✅ Done | N4, N9 morreram |
| T8 `RoomsColumns` | ❌ Defeito | eixo de horas sai da tela após ~274 px de rolagem horizontal em 360 px |
| T9 `RoomsFreeList` | ✅ Done | - |
| T10 `RoomsView` | ⚠️ Partial | contador da visão "Livres" sem teste (N5 sobreviveu) |

---

## Spec-Anchored Acceptance Criteria

### P1: Ver todas as salas lado a lado num dia

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Colunas 1: abrir `/salas?data=` → uma coluna por sala, ordem natural, ocupações daquele dia | `A-202` antes de `A-1000`; ocupações do dia da URL | `src/application/bookings.test.ts:676-682` - nomes em ordem natural com `"A-1000"` depois de `"A-202"`; `:728` - `["MAT1","08:00","09:50"]` só na sala certa; `test/components/rooms-columns.test.tsx:100-109` - links `["A-202","B-104","LAB 1"]`, `Cálculo I` só em `a202`; `test/routes/salas.test.ts:110-117` - `loadSalas("2026-11-10", …)` → `selectedDate toBe("2026-11-10")`. Nenhum teste liga o `loader` da rota (`src/routes/salas.tsx:120-121`) a `loadSalas`: N1 (`loadSalas(undefined, …)`, sempre hoje) sobreviveu | ⚠️ PASS com teste fraco (N1) |
| Colunas 2: trocar o dia → uma única chamada | 1 chamada, 1 consulta | `src/application/bookings.test.ts:793` - `expect(calls).toEqual({ all: 1, one: 0 })`; `test/routes/salas.test.ts:102` - `calls toEqual(["2026-11-03"])`; `test/routes/salas.test.ts:174` - outra data muda as deps; `test/components/rooms-view.test.tsx:193-196` - "Próximo dia" → `search toMatchObject({ data: "2030-11-13" })`. A mesma lacuna de N1 vale aqui: a data nova pode não chegar ao servidor | ⚠️ PASS com teste fraco (N1) |
| Colunas 3: nome da coluna → agenda da sala no mesmo dia | `/?espaco=ID&data=AAAA-MM-DD` | `test/components/rooms-columns.test.tsx:111-116` - `href toBe(\`/?espaco=b104&data=${DATE}\`)` | ✅ PASS |
| Colunas 4: < 768 px, "Colunas" rola dentro da grade, eixo de horas e nomes fixos, sem rolagem da página | grade rola; eixo e nomes ficam visíveis em qualquer rolagem; página sem rolagem horizontal | Teste: `test/components/rooms-columns.test.tsx:154-160` (`overflow-auto`, colunas de 140 px) e `:162-177` (classes `sticky`). Navegador (dev server de `ec25b7a`, 360×740, `/salas?visao=colunas`, 21 salas): `document.documentElement.scrollWidth` = 360 (página não rola, ✅); cabeçalho a 0,8 px do topo da grade após `scrollTop = 300` (✅); eixo de horas e canto a 1 px da borda até `scrollLeft` 251, mas a −25 px em 300, −683 px em 958 e −2315 px em 2590 (❌). Causa: a grade interna `div.grid` (`src/components/rooms/rooms-columns.tsx:47-52`) mede 326 px para 2992 px de conteúdo, e o `sticky left-0` (`:69`) não sai do bloco que o contém | ❌ GAP (defeito de produção; o teste de classes não detecta) |
| Colunas 5: responsável só para logado | visitante: `person: null`, sem nome/iniciais/id | `src/application/bookings.test.ts:765` - `toEqual([null, null])`; `src/server/booking-actions.test.ts:149-150` - `not.toContain(s.docA.id)`, `not.toContain("Pessoa")`; logado `src/application/bookings.test.ts:757` e `src/server/booking-actions.test.ts:156` - `{ name: "Pessoa doca", code: "DOCA" }` | ✅ PASS |
| Colunas 6: data inválida → hoje | data descartada; hoje no fuso | `test/routes/salas.test.ts:55-56` - `"2026-02-30"`, `"10/11/2026"`, `""`, número, `null` → `toEqual({})`; `:102-103` - sem data, `selectedDate toBe("2026-11-03")` | ✅ PASS |

### P1: Filtrar salas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Filtros 1: um ou mais blocos | só salas desses blocos | `src/domain/room-filter.test.ts:75`, `:80`; `test/components/rooms-view.test.tsx:170-174` - `bloco: ["B"]`, só `b104` | ✅ PASS |
| Filtros 2: capacidade mínima N | capacidade ≥ N | `src/domain/room-filter.test.ts:96` (limite 25 incluído) | ✅ PASS |
| Filtros 3: aviso das salas sem capacidade (plural e singular) | "X salas … ficaram de fora"; X = 1: "1 sala … ficou de fora" | `test/components/rooms-filters.test.tsx:96` - `"18 salas sem capacidade cadastrada ficaram de fora"`; `test/components/rooms-view.test.tsx:305` - `"1 sala sem capacidade cadastrada ficou de fora"`; `src/domain/room-filter.test.ts:97`, `:107`. N4 morreu | ✅ PASS |
| Filtros 4: busca sem caixa nem acento | nome contém o texto | `src/domain/room-filter.test.ts:111-116` | ✅ PASS |
| Filtros 5: "Só livres" | sem ocupação que cruze a janela | `src/domain/room-filter.test.ts:120`, `:131`, `:135`. N3 morreu | ✅ PASS |
| Filtros 6: filtro na URL + "X de N salas"; na visão "Livres", X = só as livres na janela | URL reflete; X e N certos em cada visão | Colunas: `test/components/rooms-view.test.tsx:165` - `"3 de 3 salas"`, `:172` - `"1 de 3 salas"`, `:304`; `test/components/rooms-filters.test.tsx:95` - `"3 de 21 salas"`; URL `test/components/rooms-view.test.tsx:171`, `:177-182`. Visão "Livres": nenhum teste afirma o contador; N5 (contar as filtradas em vez das livres, `src/components/rooms/rooms-view.tsx:144-147`) sobreviveu | ❌ GAP (parte "Livres" sem evidência) |
| Filtros 7: nenhuma sala passa | "Nenhuma sala com esses filtros" + "Limpar filtros" | `test/components/rooms-view.test.tsx:294-299` - texto, clique, `search toEqual({})` | ✅ PASS |
| Filtros 8: < 768 px, botão "Filtros" com contador | "Filtros (n)" | `test/components/rooms-filters.test.tsx:111` - `name: "Filtros (3)"`. N9 morreu | ✅ PASS |

### P1: Listar salas livres num horário

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Livres 1: salas livres com nome, bloco e capacidade | só inteiramente livres | `test/components/rooms-free-list.test.tsx:60-68`; `test/components/rooms-view.test.tsx:205` - `["B-104","LAB 1"]` | ✅ PASS |
| Livres 2: janela muda → recalcula sem nova chamada, no mesmo dia | 0 chamadas novas | `test/routes/salas.test.ts:156-176` (deps só com `data`) + semântica do roteador citada acima; a lista é derivada da URL a cada render (`src/components/rooms/rooms-view.tsx:130-147`), coberta por `test/components/rooms-view.test.tsx:201-205`, `:285-291`. M13 e N2 morreram | ✅ PASS |
| Livres 3: trecho passado de hoje indisponível | início ≤ agora conta como ocupado | `src/domain/room-filter.test.ts:169-172` | ✅ PASS |
| Livres 4: fim ≤ início | mensagem e lista anterior | `test/components/rooms-view.test.tsx:290-291` | ✅ PASS |
| Livres 5: < 768 px abre em "Livres" | visão "Livres" | `test/components/rooms-view.test.tsx:202-205`, `:213` | ✅ PASS |

### P2: Reservar a partir de todas as salas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Reservar 1: rascunho na coluna | rascunho só naquela sala | `test/components/rooms-columns.test.tsx:118-133`; Esc `test/components/rooms-view.test.tsx:228-234` | ✅ PASS |
| Reservar 2: clicar no rascunho → "Nova reserva" | sala, data, início, fim | `test/components/rooms-view.test.tsx:222-225` | ✅ PASS |
| Reservar 3: "Reservar" na lista | sala, data, janela | `test/components/rooms-view.test.tsx:252-254`, `:261-266` | ✅ PASS |
| Reservar 4: atualiza sem recarregar | dados recarregados pelo roteador | `test/components/rooms-view.test.tsx:267` - `loads.count toBeGreaterThan(before)` | ✅ PASS |
| Reservar 5: visitante sem rascunho nem "Reservar" | escondidos | `test/components/rooms-view.test.tsx:274`, `:282`; `test/routes/salas.test.ts:119`. N10 morreu | ✅ PASS |
| Reservar 6: um rascunho por vez | 1 rascunho | `test/components/rooms-columns.test.tsx:130-132` | ✅ PASS |

**Status**: ❌ Gaps present (Colunas 4 defeito; Filtros 6 sem evidência na visão "Livres"); testes fracos em Colunas 1 e 2 (N1).

---

## Discrimination Sensor

Worktree temporária `C:\Users\luiss\wt-verify-salas2` (`HEAD` destacado em `ec25b7a`, `bun install`), uma mutação por vez, restaurando o arquivo depois de cada uma; só os testes relevantes. Linha de base na temporária: 134 testes, 0 falhas. Logs fora do repositório (`C:\Users\luiss\tcc\tmp\verify-salas2-sensor.log`).

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M13 | `src/routes/salas.tsx:119` | `loaderDeps` passa a depender de toda a URL | ✅ Killed (`Route.loaderDeps`) |
| M26 | `src/components/rooms/rooms-columns.tsx:57` | cabeçalho com nomes perde `sticky` | ✅ Killed (nomes e eixo fixos) |
| M27 | `src/components/rooms/rooms-columns.tsx:69` | eixo de horas perde `sticky` | ✅ Killed (nomes e eixo fixos) |
| N1 | `src/routes/salas.tsx:121` | `loader` ignora `deps.data` (sempre hoje) | ❌ Survived → Fix 2 |
| N2 | `src/routes/salas.tsx:119` | deps incluem `ini` (mudar a janela recarrega) | ✅ Killed (`Route.loaderDeps`) |
| N3 | `src/domain/room-filter.ts:60` | janela que termina no fim do trecho livre deixa de ser livre (`<=` → `<`) | ✅ Killed (2 testes) |
| N4 | `src/components/rooms/rooms-filters.tsx:221` | singular trocado (`=== 1` → `=== 0`) | ✅ Killed (aviso de capacidade) |
| N5 | `src/components/rooms/rooms-view.tsx:146` | contador da visão "Livres" conta as filtradas, não as livres | ❌ Survived → Fix 3 |
| N6 | `src/domain/room-filter.ts:106` | janela padrão com `Math.ceil` (13:30 → 13:30 em vez de 14:00) | ✅ Killed (2 testes) |
| N7 | `src/infra/db/repos/occupation-repository.ts:80` | consulta de todas as salas sem filtro de status (traz canceladas) | ✅ Killed (repositório) |
| N8 | `src/application/bookings.ts:313` | intervalo da consulta cobre 2 dias | ✅ Killed (`roomsDay`) |
| N9 | `src/components/rooms/rooms-filters.tsx:51` | contador "Filtros (n)" ignora "Só livres" | ✅ Killed (celular) |
| N10 | `src/components/rooms/rooms-view.tsx:279` | `canDraft={true}` (visitante desenha rascunho) | ✅ Killed (visitante) |

**Sensor depth**: expandido (13 mutantes: os 3 sobreviventes da rodada 1 e 10 novos em rota, domínio, filtros, view, repositório e serviço).
**Result**: 11/13 killed - FAIL ❌

Isolamento: `git -C C:\Users\luiss\wt-todas-as-salas status --porcelain` vazio antes e depois; temporária limpa antes da remoção, removida com `git worktree remove --force` e ausente de `git worktree list`.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ prop sem uso removida |
| Surgical changes | ✅ `ec25b7a` só mexe em testes, spec, `rooms-columns.tsx` (prop) e `biome.json` (ignora `.specs/lessons.json`, gerado por script) |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ❌ Colunas 4 (defeito), Filtros 6 na visão "Livres" (sem evidência) |
| Per-layer Coverage Expectation met | ⚠️ rota: `loaderDeps` coberto, ligação `loader` → `loadSalas` não |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `package.json` (`check`), `bunfig.toml` (cobertura 90%) | ✅ |

---

## Edge Cases

- [x] Sem salas cadastradas - `test/components/rooms-view.test.tsx:322-325`, `:331`
- [x] Falha do servidor - `test/components/rooms-view.test.tsx:308-318`; `test/routes/salas.test.ts:123-142`
- [x] Dia fora de semestre - `src/application/bookings.test.ts:806`
- [x] Bloco inexistente na URL - `test/routes/salas.test.ts:70-76`
- [x] Capacidade fora de 1–999 - `test/routes/salas.test.ts:61-66`

---

## Spec-precision gaps

1. Colunas 4 e Success Criteria 2 ainda não dizem como verificar rolagem e elementos fixos. O happy-dom não mede layout, e foi justamente aí que o defeito do eixo passou pelos testes. Nesta rodada a verificação foi feita no navegador (medidas acima), sem artefato automatizado no repositório.
2. A janela padrão perto do fim do dia não está na spec: `src/domain/room-filter.test.ts:200-201` fixa 22:40 → 23:00–23:59 e 23:45 → 23:00–23:59, o que contradiz "depois de agora" e "dura 1 h" (`spec.md:31`). Menor.
3. A premissa "opção 'Ver todas as salas' no seletor de sala" (`spec.md:28`) segue não entregue (desvio de T6) e não confirmada.

---

## Gate Check

- **Gate command**: `bun run check` (lint, typecheck, knip, depcruise, `bun test --coverage`, betterleaks); log em `C:\Users\luiss\tcc\tmp\verify-salas2.log`
- **Result**: exit 0; 1161 passed, 0 failed, 2 skipped (1163 testes em 92 arquivos); betterleaks sem vazamentos
- **Feature tests**: 180 passed, 0 failed em 11 arquivos do diff
- **Test count before feature**: ≈1081
- **Test count after feature**: 1163
- **Delta**: +82 (+2 nesta correção)
- **Skipped tests**: `arquivo real de data/real > nenhum XML em data/real` e `reservas no D1 local > …`, anteriores à feature e dependentes de dados locais
- **Failures**: nenhuma

---

## Fix Plans

### Fix 1: eixo de horas não fica fixo ao rolar a grade (Colunas 4)

- **Root cause**: a grade interna (`src/components/rooms/rooms-columns.tsx:47-52`, `className="grid"`) tem a largura da caixa rolável (326 px em 360 px de tela), não a do conteúdo (2992 px). Um elemento `sticky` não sai do bloco que o contém, então o eixo (`:69`) e o canto (`:53`) acompanham a rolagem depois de ~274 px. Na tela larga acontece o mesmo assim que 21 colunas passam da largura da caixa.
- **Fix task**: fazer a grade interna ter a largura do conteúdo e pelo menos a da caixa (por exemplo `w-max min-w-full`), sem reintroduzir rolagem da página. Teste: afirmar essa classe na grade interna em `test/components/rooms-columns.test.tsx` e registrar uma verificação no navegador em 360 px e 1280 px: depois de `grid.scrollLeft = grid.scrollWidth`, a borda esquerda do eixo fica a ≤ 1 px da borda da grade e `document.documentElement.scrollWidth === innerWidth`.
- **Priority**: Major

### Fix 2: `loader` da rota sem teste (N1)

- **Root cause**: `test/routes/salas.test.ts:156-176` chama só `loaderDeps`; o `loader` (`src/routes/salas.tsx:120-121`) pode passar `undefined` a `loadSalas` e mostrar sempre hoje sem que nada falhe.
- **Fix task**: em `test/routes/salas.test.ts`, substituir `getRoomsDayFn` com `mock.module("#/server/booking-fns", …)` antes de importar a rota, chamar `Route.options.loader({ deps: { data: "2026-11-10" }, context: { session } })` e afirmar que a chamada recebeu `{ data: { date: "2026-11-10" } }` e que `selectedDate` é `"2026-11-10"`.
- **Priority**: Minor

### Fix 3: contador da visão "Livres" sem teste (N5)

- **Root cause**: nenhum teste olha "X de N salas" com `visao=livres`; a regra entrou na spec em `ec25b7a` (`spec.md:74`).
- **Fix task**: em `test/components/rooms-view.test.tsx`, com `/?visao=livres&ini=14:00&fim=16:00` (A-202 ocupada 14:00–15:00), afirmar `"2 de 3 salas"`; trocar para "Colunas" e afirmar `"3 de 3 salas"`.
- **Priority**: Minor

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| SALAS-01 | Verified | ❌ Needs Fix (AC 1, 2: N1) |
| SALAS-02 | Verified | ✅ Verified |
| SALAS-03 | Needs Fix (AC 4) | ❌ Needs Fix (AC 4: eixo não fica fixo) |
| SALAS-04 | Verified | ❌ Needs Fix (AC 6: contador em "Livres", N5) |
| SALAS-05 | Verified | ✅ Verified |
| SALAS-06 | Verified | ✅ Verified |
| SALAS-07 | Verified | ✅ Verified |
| SALAS-08 | Verified | ✅ Verified |
| SALAS-09 | Needs Fix (AC 2) | ✅ Verified |
| SALAS-10 | Verified | ✅ Verified |
| SALAS-11 | Verified | ✅ Verified |
| SALAS-12 | Verified | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 23/25 ACs com o resultado da spec; 2 gaps (Colunas 4, Filtros 6 na visão "Livres"); testes fracos em Colunas 1 e 2; 3 spec-precision gaps
**Sensor**: 11/13 mutations killed
**Gate**: 1161 passed, 0 failed, 2 skipped (pré-existentes)

**What works**: lacunas 1, 3 e 4 da rodada 1 fechadas; Livres AC2 agora provado; nomes fixos no topo e página sem rolagem horizontal em 360 px conferidos no navegador; filtros, privacidade, consulta única, reserva e recarga seguem cobertos.

**Issues found**: Fix 1 (eixo fixo, produção), Fix 2 (teste do `loader`), Fix 3 (teste do contador em "Livres").

**Next steps**: rotear Fix 1–3 para um implementador e re-verificar (iteração 2 de 3 concluída; resta 1 antes de escalar ao usuário).

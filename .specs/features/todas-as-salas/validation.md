# Todas as salas: validação

## Validation: todas-as-salas - FAIL ❌

**Result**: FAIL ❌ (rodada 3 de 3: os três gaps da rodada 2 fecharam e o eixo fica fixo no navegador; um mutante novo do `loader` sobreviveu à suíte inteira. Só falta teste, o código de produção está certo. Escalar ao usuário.)

**Date**: 2026-11-04
**Spec**: `.specs/features/todas-as-salas/spec.md`
**Diff range**: `6181b01..a26bec0` (branch `feat/todas-as-salas`, 14 commits; correção da rodada 2 em `a26bec0`)
**Verifier**: subagente independente (autor ≠ verificador); evidência re-derivada do zero, medidas novas no navegador e sensor próprio.

---

## Lacunas da rodada 2

| # | Lacuna | Situação | Evidência |
| - | ------ | -------- | --------- |
| 1 | MAJOR: em 360 px, o eixo de horas e o canto saíam da tela ao rolar a grade na horizontal | ✅ Fechada | `src/components/rooms/rooms-columns.tsx:48` - `className="grid w-max min-w-full"`; teste `test/components/rooms-columns.test.tsx:161-163` - `className.split(" ")` contém `["w-max", "min-w-full"]` (mutante W morreu). Navegador: tabela em "Medidas no navegador" (eixo, canto e nomes a 1 px da borda em qualquer rolagem, nas duas larguras) |
| 2 | N1: `loader` com `loadSalas(undefined, …)` sobrevivia | ✅ Fechada (N1) / ⚠️ fix incompleto | `test/routes/salas.test.ts:178-189` - `loader({ deps: { data: "2030-01-15" }, … })` → `expect(data.selectedDate).toBe("2030-01-15")`; N1 morreu. A rodada 2 pediu também afirmar o argumento enviado a `getRoomsDayFn`, o que não entrou: V1 e V1b sobreviveram (ver Sensor) |
| 3 | N5: contador da visão "Livres" contava as salas filtradas | ✅ Fechada | `test/components/rooms-view.test.tsx:186-190` - `/?visao=livres&ini=14:00&fim=16:00` → `getByText("2 de 3 salas")` e `freeNames()` `["B-104","LAB 1"]`; N5 morreu |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `listActiveInRangeAll` | ✅ Done | - |
| T2 `bookings.roomsDay` | ✅ Done | - |
| T3 `getRoomsDayFn` | ✅ Done | - |
| T4 `room-filter` | ✅ Done | V4, V6 morreram |
| T5 Rota `/salas` | ⚠️ Partial | `loader` coberto só pelo valor devolvido (`selectedDate`); o argumento enviado ao servidor não é afirmado (V1, V1b sobreviveram) |
| T6 Navegação | ✅ Done | opção "Ver todas as salas" no seletor de sala adiada para o merge (desvio registrado; não é AC) |
| T7 `RoomsFilters` | ✅ Done | - |
| T8 `RoomsColumns` | ✅ Done | eixo e nomes fixos medidos no navegador; W e V5 morreram |
| T9 `RoomsFreeList` | ✅ Done | - |
| T10 `RoomsView` | ✅ Done | N5, V2, V3 morreram |

---

## Medidas no navegador (Colunas AC4)

Dev server da worktree (porta 3200, código de `a26bec0`), `playwright-cli -s=verif3`, `http://localhost:3200/salas?visao=colunas` sem `data` (carregou as 21 salas de hoje). Para cada `scrollLeft`, `scrollTop = 300` e duas animações de quadro antes de medir. Distâncias em px até a borda da caixa `[data-testid=rooms-columns]` (1 px = borda da caixa).

| Viewport | Caixa (cliente / conteúdo) | Grade interna | `scrollLeft` medidos | Eixo → esquerda da caixa | Canto → esquerda / topo | Nomes → topo da caixa | `documentElement.scrollWidth` |
| -------- | -------------------------- | ------------- | -------------------- | ------------------------ | ----------------------- | --------------------- | ----------------------------- |
| 360×760 | 326 / 3772 | 3772 | 0, 300, 958, 1723, 3446 (máx.) | 1 em todos | 1 / 1 em todos | 1 em todos | 360 em todos |
| 1280×800 | 1230 / 3772 | 3772 | 0, 300, 958, 1271, 2542 (máx.) | 1 em todos | 1 / 1 em todos | 1 em todos | 1280 em todos |

Na rodada 2 a grade interna media 326 px e o eixo ia a −2315 px em `scrollLeft` 2590. Agora a grade interna tem a largura do conteúdo. Em 360 px, com rolagem máxima e `scrollTop` 300, `document.elementFromPoint` 20 px à direita da borda cai dentro do eixo de horas e 150 px à direita, na altura do cabeçalho, cai no nome da última sala ("Lab. A107"), ou seja, os dois ficam por cima das colunas. Sessão fechada; prints e pastas `.playwright-cli` criadas foram apagadas.

---

## Spec-Anchored Acceptance Criteria

### P1: Ver todas as salas lado a lado num dia

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Colunas 1: abrir `/salas?data=` → uma coluna por sala, ordem natural, ocupações daquele dia | `A-202` antes de `A-1000`; ocupações do dia da URL | `src/application/bookings.test.ts:676-682` - nomes `["A-202","A-1000","ADM 2","B-104","LAB 1"]`; `:691` - `room.date toBe("2026-11-10")`; `:727-729` - `["MAT1","08:00","09:50"]` só em B-104 (QUI1 de outro dia fora); `test/components/rooms-columns.test.tsx:102-108` - links `["A-202","B-104","LAB 1"]`, `Cálculo I` só em `a202`; `test/routes/salas.test.ts:187` - `loader` com `deps.data` → `selectedDate toBe("2030-01-15")`. O dia que o `loader` pede ao servidor não é afirmado: V1 (data fixa) e V1b (`deps.data` no lugar de `date`) sobreviveram a `bun test` inteiro. Produção correta: `src/routes/salas.tsx:121` repassa `date`, e o navegador carregou as 21 salas sem `data` na URL | ⚠️ PASS com teste fraco (V1, V1b) |
| Colunas 2: trocar o dia → uma única chamada | 1 chamada, 1 consulta | `src/application/bookings.test.ts:793` - `calls toEqual({ all: 1, one: 0 })`; `test/routes/salas.test.ts:102` - `calls toEqual(["2026-11-03"])`; `:174` - outra data muda as deps; `test/components/rooms-view.test.tsx:202` - "Próximo dia" → `search toMatchObject({ data: "2030-11-13" })`. Mesma lacuna de V1: nada prova que a data nova chega ao servidor | ⚠️ PASS com teste fraco (V1, V1b) |
| Colunas 3: nome da coluna → agenda da sala no mesmo dia | `/?espaco=ID&data=AAAA-MM-DD` | `test/components/rooms-columns.test.tsx:113-115` - `href toBe(\`/?espaco=b104&data=${DATE}\`)`; V5 morreu | ✅ PASS |
| Colunas 4: < 768 px, "Colunas" rola dentro da grade, eixo de horas e nomes fixos, sem rolagem da página | grade rola; eixo e nomes visíveis em qualquer rolagem; página sem rolagem horizontal | `test/components/rooms-columns.test.tsx:157-163` - `overflow-auto`, `"52px repeat(3, minmax(140px, 1fr))"`, grade interna com `w-max` e `min-w-full`; `:166-181` - `sticky top-0` nos nomes, `sticky left-0` no eixo, `sticky top-0 left-0` no canto. Navegador: tabela acima (eixo, canto e nomes a 1 px; `scrollWidth` = largura da viewport); `test/components/rooms-view.test.tsx:216-220` - no celular `visao=colunas` mostra as colunas | ✅ PASS (layout provado no navegador; o teste automatizado é um proxy por classes) |
| Colunas 5: responsável só para logado | visitante: `person: null`, sem nome/iniciais/id | `src/application/bookings.test.ts:765` - `toEqual([null, null])`; `src/server/booking-actions.test.ts:149-150` - `not.toContain(s.docA.id)`, `not.toContain("Pessoa")`; logado `src/application/bookings.test.ts:757` e `src/server/booking-actions.test.ts:156` - `"Pessoa doca"` | ✅ PASS |
| Colunas 6: data inválida → hoje | data descartada; hoje no fuso | `test/routes/salas.test.ts:55-57` - `"2026-02-30"`, `"10/11/2026"`, `""`, número, `null` → `toEqual({})`; `:102-103` - sem data, `selectedDate toBe("2026-11-03")` | ✅ PASS |

### P1: Filtrar salas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Filtros 1: um ou mais blocos | só salas desses blocos | `src/domain/room-filter.test.ts:75`, `:80` (B + Outros); `test/components/rooms-view.test.tsx:170-174` - `bloco: ["B"]`, só `b104`; V4 morreu | ✅ PASS |
| Filtros 2: capacidade mínima N | capacidade ≥ N | `src/domain/room-filter.test.ts:96` | ✅ PASS |
| Filtros 3: aviso das salas sem capacidade | plural e singular | `test/components/rooms-filters.test.tsx:96`; `test/components/rooms-view.test.tsx:311` - `"1 sala sem capacidade cadastrada ficou de fora"` | ✅ PASS |
| Filtros 4: busca sem caixa nem acento | nome contém o texto | `src/domain/room-filter.test.ts:111-116` | ✅ PASS |
| Filtros 5: "Só livres" | sem ocupação que cruze a janela | `src/domain/room-filter.test.ts:120`, `:131`, `:135` | ✅ PASS |
| Filtros 6: filtro na URL + "X de N salas"; na visão "Livres", X = só as livres | URL reflete; X e N certos em cada visão | Colunas: `test/components/rooms-view.test.tsx:165` - `"3 de 3 salas"`, `:172` - `"1 de 3 salas"`, `:310`; Livres: `:188` - `"2 de 3 salas"` com A-202 ocupada 14:00–15:00; `test/components/rooms-filters.test.tsx:95` - `"3 de 21 salas"`; URL `test/components/rooms-view.test.tsx:171`, `:177-182`. N5 e V2 morreram | ✅ PASS |
| Filtros 7: nenhuma sala passa | "Nenhuma sala com esses filtros" + "Limpar filtros" | `test/components/rooms-view.test.tsx:302-304` - texto, clique, `search toEqual({})` | ✅ PASS |
| Filtros 8: < 768 px, botão "Filtros" com contador | "Filtros (n)" | `test/components/rooms-filters.test.tsx:111` | ✅ PASS |

### P1: Listar salas livres num horário

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Livres 1: salas livres com nome, bloco e capacidade | só inteiramente livres | `test/components/rooms-free-list.test.tsx:60-68`; `test/components/rooms-view.test.tsx:189`, `:211` | ✅ PASS |
| Livres 2: janela muda → recalcula sem nova chamada | 0 chamadas novas | `test/routes/salas.test.ts:172-174` (deps só com `data`) | ✅ PASS |
| Livres 3: trecho passado de hoje indisponível | início ≤ agora conta como ocupado | `src/domain/room-filter.test.ts:169-170` (início igual a agora = ocupado); V6 morreu | ✅ PASS |
| Livres 4: fim ≤ início | mensagem e lista anterior | `test/components/rooms-view.test.tsx:296-297` | ✅ PASS |
| Livres 5: < 768 px abre em "Livres" | visão "Livres" | `test/components/rooms-view.test.tsx:208-213`; V3 morreu | ✅ PASS |

### P2: Reservar a partir de todas as salas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| Reservar 1: rascunho na coluna | rascunho só naquela sala | `test/components/rooms-columns.test.tsx:120-132`; Esc `test/components/rooms-view.test.tsx:237-239` | ✅ PASS |
| Reservar 2: clicar no rascunho → "Nova reserva" | sala, data, início, fim | `test/components/rooms-view.test.tsx:228-231` | ✅ PASS |
| Reservar 3: "Reservar" na lista | sala, data, janela | `test/components/rooms-view.test.tsx:258-260`, `:267-272` | ✅ PASS |
| Reservar 4: atualiza sem recarregar | dados recarregados pelo roteador | `test/components/rooms-view.test.tsx:273` | ✅ PASS |
| Reservar 5: visitante sem rascunho nem "Reservar" | escondidos | `test/components/rooms-view.test.tsx:280`, `:288`; `test/routes/salas.test.ts:118-119` | ✅ PASS |
| Reservar 6: um rascunho por vez | 1 rascunho | `test/components/rooms-columns.test.tsx:130-132` | ✅ PASS |

**Status**: ⚠️ Todos os ACs com resultado da spec; Colunas 1 e 2 com teste fraco na ligação `loader` → servidor (V1, V1b).

---

## Discrimination Sensor

Worktree temporária `C:\Users\luiss\wt-verify-salas3` (`HEAD` destacado em `a26bec0`, `bun install`), uma mutação por vez, arquivo restaurado com `git checkout` na temporária depois de cada uma. Linha de base: 71 testes relevantes, 0 falhas. Log: `C:\Users\luiss\tcc\tmp\verify-salas3-sensor.log`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| N1 | `src/routes/salas.tsx:121` | `loadSalas(undefined, …)` (sempre hoje) | ✅ Killed (`Route.loader`) |
| N5 | `src/components/rooms/rooms-view.tsx:146` | contador de "Livres" conta as filtradas | ✅ Killed (contador em "Livres") |
| W | `src/components/rooms/rooms-columns.tsx:48` | grade interna sem `w-max min-w-full` | ✅ Killed (rolagem dentro da grade) |
| V1 | `src/routes/salas.tsx:121` | `loader` pede ao servidor uma data fixa (`"2026-01-01"`) em vez de `date` | ❌ Survived (testes relevantes e `bun test` inteiro: 1163 pass) → Fix 1 |
| V1b | `src/routes/salas.tsx:121` | `loader` manda `deps.data` em vez de `date`: sem `data` na URL o servidor recebe `undefined`, responde 400 (`src/server/booking-actions.ts:97`) e `/salas` mostra "Não foi possível carregar as salas" | ❌ Survived (`bun test` inteiro: 1163 pass) → Fix 1 |
| V2 | `src/components/rooms/rooms-view.tsx:147` | contador de "Colunas" conta todas as salas, não as filtradas | ✅ Killed (2 testes) |
| V3 | `src/components/rooms/rooms-view.tsx:125` | visão padrão invertida (celular "Colunas", computador "Livres") | ✅ Killed (7 testes) |
| V4 | `src/domain/room-filter.ts:81` | bloco "Outros" deixa de casar (`blockOf ?? ""` no lugar de `groupOf`) | ✅ Killed (blocos) |
| V5 | `src/components/rooms/rooms-columns.tsx:61` | link do nome sem `data` | ✅ Killed (agenda no mesmo dia) |
| V6 | `src/domain/room-filter.ts:59` | início igual a agora passa a contar como livre (`<=` → `<`) | ✅ Killed (trecho passado) |

**Sensor depth**: expandido (3 reaplicados da rodada 2 + 7 novos em rota, view, colunas e domínio).
**Result**: 8/10 killed - FAIL ❌

Isolamento: `git -C C:\Users\luiss\wt-todas-as-salas status --porcelain` vazio antes e depois; temporária limpa antes da remoção, saí do diretório, `git worktree remove --force` (a pasta presa foi apagada em seguida), ausente de `git worktree list`.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `a26bec0` muda uma classe em produção |
| Surgical changes | ✅ `a26bec0`: `rooms-columns.tsx` (1 linha) e três arquivos de teste |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ⚠️ Colunas 1 e 2: o teste do `loader` afirma o valor devolvido, não o pedido ao servidor |
| Per-layer Coverage Expectation met | ⚠️ rota: `loader` sem afirmação do argumento de `getRoomsDayFn` |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `package.json` (`check`), `bunfig.toml` (cobertura 90%) | ✅ |

---

## Edge Cases

- [x] Sem salas cadastradas - `test/components/rooms-view.test.tsx:328`, `:336`
- [x] Falha do servidor - `test/components/rooms-view.test.tsx:320-323`; `test/routes/salas.test.ts:130-141`
- [x] Dia fora de semestre - `src/application/bookings.test.ts:796-806`
- [x] Bloco inexistente na URL - `test/routes/salas.test.ts:70-76`; `src/domain/room-filter.test.ts:88-91`
- [x] Capacidade fora de 1–999 - `test/routes/salas.test.ts:61-66`

---

## Observações (não bloqueiam)

1. Colunas 4 e Success Criteria 2 seguem sem dizer como verificar rolagem e elementos fixos. O happy-dom não mede layout; o teste prova as classes (W morreu) e o efeito foi medido no navegador nesta rodada, sem artefato automatizado no repositório. Em 360 px foi medida só a visão "Colunas", que é a que mudou.
2. Janela padrão perto da meia-noite fora da spec: `src/domain/room-filter.test.ts:200-201` fixa 22:40 → 23:00–23:59 e 23:45 → 23:00–23:59, o que contradiz "depois de agora" e "dura 1 h" (`spec.md:31`). Imprecisão de spec, menor.
3. A opção "Ver todas as salas" no seletor de sala (`spec.md:28`) foi adiada para o merge por estar em arquivo editado por outra pessoa; não é AC da spec.

---

## Gate Check

- **Gate command**: `bun run check` (lint, typecheck, knip, depcruise, `bun test --coverage`, betterleaks); log em `C:\Users\luiss\tcc\tmp\verify-salas3.log`
- **Result**: exit 0; 1163 passed, 0 failed, 2 skipped (1165 testes em 92 arquivos); betterleaks sem vazamentos
- **Feature tests**: 182 passed, 0 failed em 11 arquivos do diff
- **Test count before feature**: ≈1081
- **Test count after feature**: 1165
- **Delta**: +84 (+2 nesta correção)
- **Skipped tests**: `arquivo real de data/real > nenhum XML em data/real` e `reservas no D1 local > …`, anteriores à feature e dependentes de dados locais
- **Failures**: nenhuma

---

## Fix Plans

### Fix 1: teste do `loader` não prova o dia pedido ao servidor (V1, V1b)

- **Root cause**: `test/routes/salas.test.ts:178-189` chama o `loader` com o `getRoomsDayFn` real, que falha fora do servidor; `loadSalas` engole o erro e devolve `selectedDate` a partir de `deps.data`. O teste só olha `selectedDate`, então qualquer data enviada ao servidor passa, inclusive `undefined` quando a URL não tem data (a entrada padrão de `/salas`).
- **Fix task**: em `test/routes/salas.test.ts`, substituir `#/server/booking-fns` com `mock.module` antes de importar a rota (import dinâmico), com um `getRoomsDayFn` que registra a entrada e responde `{ ok: true, data: day(input.data.date) }`. Afirmar: com `deps: { data: "2030-01-15" }`, chamadas `toEqual([{ data: { date: "2030-01-15" } }])` e `roomsDay` não nulo; com `deps: {}`, uma chamada cuja `date` é igual a `selectedDate` e casa `/^\d{4}-\d{2}-\d{2}$/`. Done when: V1 e V1b morrem.
- **Priority**: Minor (só teste; produção correta em `src/routes/salas.tsx:121`)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| SALAS-01 | Needs Fix (AC 1, 2: N1) | ❌ Needs Fix (AC 1, 2: teste do `loader` não afirma o pedido ao servidor; V1, V1b) |
| SALAS-02 | Verified | ✅ Verified |
| SALAS-03 | Needs Fix (AC 4) | ✅ Verified |
| SALAS-04 | Needs Fix (AC 6) | ✅ Verified |
| SALAS-05 | Verified | ✅ Verified |
| SALAS-06 | Verified | ✅ Verified |
| SALAS-07 | Verified | ✅ Verified |
| SALAS-08 | Verified | ✅ Verified |
| SALAS-09 | Verified | ✅ Verified |
| SALAS-10 | Verified | ✅ Verified |
| SALAS-11 | Verified | ✅ Verified |
| SALAS-12 | Verified | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready (falta só teste)

**Spec-anchored check**: 25/25 ACs com o resultado da spec; Colunas 1 e 2 com teste fraco (V1, V1b); 2 imprecisões de spec como observação
**Sensor**: 8/10 mutations killed
**Gate**: 1163 passed, 0 failed, 2 skipped (pré-existentes)

**What works**: eixo de horas, canto e nomes fixos em 360 px e 1280 px depois de qualquer rolagem, sem rolagem horizontal da página; N1, N5 e W mortos; SALAS-03 e SALAS-04 verificados; filtros, contadores nas duas visões, privacidade, consulta única, reserva e recarga cobertos.

**Issues found**: Fix 1 (afirmar o dia que o `loader` pede ao servidor).

**Next steps**: rodada 3 de 3 concluída com um gap Minor só de teste; escalar ao usuário para decidir entre aplicar Fix 1 e re-verificar ou aceitar o risco.

## Correção após a rodada 3 (orquestrador, sem nova rodada independente)

- Fix 1 aplicado em `test/routes/salas.test.ts`: novo teste "pede ao servidor o dia da URL ou, sem data, o de hoje" observa `getRoomsDayFn` com `spyOn` e afirma o argumento com e sem `data` na URL.
- Mutantes V1 (data fixa) e V1b (`deps.data` cru) reaplicados um por vez na worktree: ambos morrem (1 fail cada); arquivo restaurado com `git checkout`.
- `bun run check`: exit 0, 1164 pass, 2 skip, 0 fail.
- Esta seção não é uma quarta verificação independente; registra a correção do único gap apontado.
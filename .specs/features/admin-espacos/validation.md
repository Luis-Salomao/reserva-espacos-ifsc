# Administração de espaços: validação

## Validation: admin-espacos - PASS

**Date**: 2026-11-04 (rodada 2 de até 3)
**Spec**: `.specs/features/admin-espacos/spec.md`
**Diff range**: `9bf1fc1..a88e041` (branch `feat/admin-espacos`); correções da rodada 1 em `b150a56..a88e041`
**Verifier**: subagente independente (autor ≠ verificador). Cobertura re-derivada da spec, do diff e dos testes; o relatório da rodada 1 e a seção "Correções" de `tasks.md` serviram só como lista de pontos a reconferir, não como evidência.

Veredito: **PASS**. Os 44 critérios (ACs e edge cases) têm teste com asserção no resultado definido pela spec. As 7 lacunas da rodada 1 estão fechadas e conferidas por mutante (M10, M16, M24, M25 agora morrem; mensagens 401/403, campos independentes e 360 px conferidos). Gate verde. Sobram 4 mutantes vivos: 2 equivalentes quanto à spec, 1 de ligação de rota que a matriz deixa para conferência manual (conferida no navegador nesta rodada) e 1 Minor (exclusão sem teste de atomicidade), que fica como recomendação.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 a T13 | ✅ Done | Commits `65d8eb4`..`7ace526` |
| Correções da rodada 1 | ✅ Done | `3c5ee92` (atomicidade), `9ebed0b` (campos independentes, porta `EquipmentWrite`, `update` parcial que relê), `db6603a` (401/403), `bc59847` (ordem natural), `2b6066c` (regravar e recarga), `9812b65` (360 px), `a88e041` (docs) |

---

## Spec-Anchored Acceptance Criteria

Caminhos relativos à raiz da worktree. "AMT" = `src/components/admin/admin-managers.test.tsx`; "REPO" = `src/infra/db/repos/space-repository.test.ts`; "SVC" = `src/application/spaces.test.ts`; "ACT" = `src/server/admin-actions.test.ts`.

### P1: Ver os espaços organizados

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 grupos por bloco/andar, "Outros espaços" e "Sem andar identificado" por último, ordem natural no mesmo andar | `A-201 Lab 2` antes de `A-201 Lab 10`; `Sala 2` antes de `Sala 10` | `src/domain/space-groups.test.ts:32` `toEqual(["Bloco A","Bloco B","Outros espaços"])`; `:41` andares com "Sem andar identificado" no fim; `:63`-`:81` `toEqual` com `["A-201 Lab 2","A-201 Lab 10"]` em "Andar 2" e `["Sala 2","Sala 10"]` em "Sem andar identificado"; AMT:361 e AMT:372 na tela | ✅ (M10 morto) |
| AC2 "N lugares" / "Capacidade não informada" | Texto exato | AMT:483 `getByText("40 lugares")`; AMT:493 `getByText("Capacidade não informada")` | ✅ |
| AC3 um rótulo por equipamento, 3 estados × 3 tipos, "1 computador" | 9 textos + singular | `src/domain/equipment.test.ts:5`-`:22` (`describeEquipment` `toEqual({ text, known })`); AMT:487 `toEqual(["Projetor","1 computador","Sem aparelho de som"])`; AMT:497 os três "não informado" | ✅ |
| AC4 observações no cartão | Texto das observações | AMT:488 `toBe("Observações: Lousa digital\nTV")`; AMT:502 nenhuma quando ausentes | ✅ |
| AC5 busca por `matchesRoomSearch` e "X de N espaços" | Filtro + contador | AMT:385 `getByText("1 de 5 espaços")`, AMT:386 `names()` `["A-202"]` | ✅ |
| AC6 "Nenhum espaço encontrado." + "Limpar busca" | Mensagem e volta à lista completa | AMT:388-392 (mensagem, "0 de 5", busca vazia, 5 nomes) | ✅ |
| AC7 "Nenhum espaço cadastrado." + "Cadastrar espaço" | Abre "Novo espaço" | AMT:397-400 | ✅ |
| AC8 erro de carga com "Tentar de novo" que refaz a carga | Mensagem e nova carga | AMT:439-441 (componente: mensagem e `retries === 1`). Rota real (matriz: route wiring = none): conferido pelo verificador no navegador, com a carga quebrada no banco temporário: alerta "Não foi possível carregar os espaços." e, depois de restaurar o banco, "Tentar de novo" disparou nova chamada a `listAdminSpacesFn` e mostrou "5 de 5 espaços" | ✅ (componente + navegador; mutante N18 vivo, ver sensor) |
| AC9 360 px sem rolagem horizontal, inclusive com texto longo sem espaço | `scrollWidth === 360` com observação de 120 caracteres sem espaço; teste de componente afirma as classes | AMT:515 `wrap-anywhere` nas observações, AMT:517 no nome, AMT:518 `min-w-0` no item, AMT:521 no título da confirmação (N07, N08, N08b, N16 mortos). Navegador (Chrome, 360×780 móvel, banco temporário com observação de 120 `x`, observação "Link: " + 120 `x` e nome de 90 caracteres sem espaço): lista 360/360; diálogo "Editar espaço" desse espaço 360/360 (diálogo 0–360, observações com 120 caracteres carregadas); confirmação "Excluir …?" 360/360 (título de 99 caracteres com 278 px). 1280 px: 1265/1265 | ✅ |

### P1: Cadastrar e editar espaço num diálogo

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 "Novo espaço" vazio, presença em "Não informado" | Valores iniciais | AMT:621-633 (nome, capacidade, computadores e observações `""`; `checked` `["Não informado"]` em Projetor e Aparelho de som; foco no nome) | ✅ |
| AC2 "Editar espaço" preenchido | Dados gravados | AMT:638-650 ("A-202", "40", Projetor "Sim", som "Não informado", "0", "Lousa digital") | ✅ |
| AC3 grava, fecha, recarrega e anuncia "Espaço salvo." em `role="status"` | Quatro efeitos | AMT:411 `status.textContent === "Espaço salvo."`; AMT:412 `loads === 2`; AMT:413 lista com o nome novo "A-203"; AMT:414 diálogo fechado; AMT:415 chamada `update` com o id | ✅ (M25 morto) |
| AC4 recusa de campo: mantém o digitado, mensagem abaixo, `aria-invalid`, `aria-describedby`, foco | Estado do campo; depois corrigir e salvar | AMT:719-725 (computadores: foco, `aria-invalid="true"`, `aria-describedby` contém o id da mensagem, "1000" e "Lab" mantidos); AMT:727-735 (botão "Salvar" habilitado, corrige para 10, "Salvos: 1", envios `["1000","10"]`); AMT:750-751 (projetor); AMT:452-454 (capacidade) | ✅ (M24 morto) |
| AC5 falha sem campo: alerta no topo, diálogo aberto | Mensagem do servidor | AMT:759-762 `toBe("Sem permissão para esta ação.")`, diálogo presente | ✅ |
| AC6 "Salvando…" com botão desabilitado | Texto e `disabled` | AMT:690-691 | ✅ |
| AC7 fechar/cancelar descarta | Próxima abertura com dados gravados | AMT:765-779 (Cancelar e "Fechar"; nome volta a "A-202"; nenhuma chamada) | ✅ |
| AC8 regras de nome e capacidade | Aparado, 1–80, sem controle, único sem caixa; inteiro 1–2000 | SVC:70, SVC:86, SVC:127, SVC:131, SVC:140, SVC:202; ACT:450-456 (409 e 400 com `field`) | ✅ |

### P1: Registrar equipamentos por espaço

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 estados e limites | Presença sim/não/não informado; 0–999; ≤ 500 | SVC:262-275, SVC:278-285, SVC:288-297 | ✅ |
| AC2 uma linha por equipamento informado, nenhuma para não informado | Linhas em `space_equipment` | REPO:102 `countEquipment() === 1` com `{ som: 0 }`; REPO:72 `items: {}` sem equipamentos (N14, "0 não vira linha", morto) | ✅ |
| AC3 migração mantém espaços e lê tudo como não informado | Nome/capacidade intactos, notas nulas, nenhuma linha | REPO:306-314 (0000–0008 com 2 espaços, depois 0009); `src/infra/db/flow/space-d1.test.ts:17` (D1 local, rodado pelo verificador com `RUN_D1_TESTS=1`: 1 pass) | ✅ |
| AC4 computadores fora de 0–999 | Mensagem exata em `computadores`, sem gravar | SVC:300-315 `toEqual({ ok:false, kind:"validation", message, field:"computadores" })` para 6 valores e `rows.size === 0`; ACT:517-526 (400 com `field`) | ✅ |
| AC5 presença inválida | "Escolha sim, não ou não informado." no campo | SVC:317-331 (5 casos, `field: kind`, nada gravado) | ✅ |
| AC6 observações > 500 após aparar | Mensagem exata em `notes` | SVC:333-341 (500 ok; 501 com espaços recusado) | ✅ (sem `rows.size` nesse caso; ver lacuna 4) |
| AC7 controle além de `\n`/`\t` | "As observações contêm caracteres inválidos." | SVC:343-355 | ✅ |
| AC8 tipo fora do catálogo | "Tipo de equipamento desconhecido.", sem gravar | SVC:357-364; ACT:528-530 | ✅ |
| AC9 gravação atômica substituindo o conjunto | Tudo ou nada | Substituição: REPO:90-103. Atomicidade com falha numa instrução posterior (gatilho que aborta só a 2ª linha de equipamento): REPO:167-174 (criar: nenhum espaço nem equipamento) e REPO:176-194 (editar: nome, capacidade, observações e equipamentos antigos). D1: `space-d1.test.ts:17` | ✅ (M16 morto) |
| AC10 `equipment` e `notes` independentes na edição | Ausente mantém, presente substitui; sem os dois mantém os dois | Ação: ACT:550-556 (sem os dois: `{ projetor:1, computadores:15 }` e "Lousa digital" mantidos), ACT:558-573 (só `notes`: equipamentos mantidos, resposta e banco), ACT:575-585 (só `equipment`: observações mantidas). Serviço: SVC:395-411 (`writes` só com o que veio), SVC:366-373. Repositório: REPO:105-111, REPO:113-132 (resposta relida e `countEquipment() === 1`). Diálogo sempre envia os dois: AMT:671-679, AMT:692-701 | ✅ (N01–N06, N10, N12, N19 mortos; M19 equivalente) |

### P1: Só admin altera espaços

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 sem sessão → 401 "É preciso entrar." | Status e mensagem | ACT:173-176 `toEqual({ ok:false, status:401, message:"É preciso entrar." })` para as 4 ações de espaço (ACT:158-169), sem cookie e com token inexistente | ✅ (N09 morto) |
| AC2 sem papel `admin` → 403 "Sem permissão para esta ação." sem gravar | Status, mensagem, nada gravado | ACT:179-185 `toEqual({ ok:false, status:403, message:"Sem permissão para esta ação." })` para `horarios` e `docente`; `spaces.list()` vazio | ✅ (ver lacuna 5) |
| AC3 corpo inválido → 400 "Requisição inválida." sem gravar | Mensagem exata | ACT:591-610 (7 corpos em criar e editar; nada gravado); ACT:611-617 (exclusão sem `id` texto) | ✅ |

### P2: Excluir espaço sem uso

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 "Excluir" abre "Excluir {nome}?" sem chamar | Título, botões, zero chamadas | AMT:534-538 | ✅ |
| AC2 cancelar fecha sem chamar | Zero chamadas | AMT:536-538 | ✅ |
| AC3 sem uso: apaga espaço e equipamentos, recarrega, anuncia "Espaço excluído." | Linhas apagadas; recarga; anúncio | REPO:228-232 (0 espaços, 0 equipamentos); ACT:637-640; AMT:423 anúncio, AMT:424 `loads === 2`, AMT:425 lista sem "B-101", AMT:426 "4 de 4 espaços" | ✅ (M25 morto) |
| AC4 em uso → 409 com a mensagem, nada apagado | Status, mensagem, contagens | REPO:234-274 (ocupação ativa/cancelada, vínculo XML, linha de importação: `in_use`, 1 espaço, 1 equipamento); ACT:641-645 `toEqual` com a mensagem exata | ✅ |
| AC5 inexistente → 404 "Espaço não encontrado." | Status e mensagem | ACT:646-650; SVC:457 | ✅ |
| AC6 recusa dentro da confirmação, sem fechá-la | Alerta no `alertdialog` | AMT:563-566; reabrir sem alerta antigo AMT:569-571 | ✅ |
| AC7 "Excluindo…" com botão desabilitado | Texto e `disabled` | AMT:546-547 | ✅ |

### P2: Equipamentos na consulta da agenda

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 `listSpaces` devolve `id`, `name`, `capacity` e `equipment` | Formato | REPO:71-74 `toEqual` exato de `listWithEquipment()`; a ligação `src/server/spaces.ts:16` só tem gate de build (matriz: none) | ✅ |
| AC2 `equipment` opcional em `Space` | Código antigo compila | `tsc --noEmit` no gate (saída 0); `Space` sem `equipment` em AMT:324-328 | ✅ |
| AC3 `list()` só `id`, `name`, `capacity` | Chaves exatas | REPO:80 `Object.keys(first)` `toEqual(["id","name","capacity"])` | ✅ |

### Edge cases

- [x] " 12 " grava 12: SVC:262-275; ACT:481-484.
- [x] Computadores vazio ou só espaços = não informado: SVC:278-285.
- [x] Observações só com espaços = `null`: SVC:278-282.
- [x] Nome sem código em "Outros espaços" > "Sem andar identificado": `src/domain/space-groups.test.ts:53`-`:61`.
- [x] Excluir espaço já excluído → "Espaço não encontrado." na confirmação: ACT:646-650 (servidor); a confirmação mostra a mensagem de qualquer recusa (AMT:563-566).
- [x] Falha no meio da gravação desfaz nome, capacidade e observações: REPO:176-194 (M16 morto).
- [x] Linha com tipo fora do catálogo ignorada: REPO:83-88.

**Status**: ✅ All ACs covered (44/44), sem imprecisão da spec nesta rodada.

---

## Discrimination Sensor

Worktree temporária `C:\Users\luiss\wt-verify-admin2` (`git worktree add … HEAD --detach`, `bun install --frozen-lockfile --ignore-scripts`). Linha de base dos 7 arquivos relevantes: 203 pass, 0 fail. Uma mutação por vez por troca exata de texto, só os testes da camada, timeout de 240 s, restauração do conteúdo original conferida com `git diff --quiet` a cada mutante. Ao fim: worktree removida (pasta apagada) e `git status --porcelain` da worktree verificada vazio antes e depois.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M10 | `src/domain/space-groups.ts:42` | nomes do andar em ordem lexical | ✅ Killed (1 fail) |
| M16 | `src/infra/db/repos/space-repository.ts:79`, `:98` | `create`/`update` em sequência, sem `runAtomically` | ✅ Killed (2 fail) |
| M19 | `src/server/admin-actions.ts:115` | sem o retorno antecipado: pedido sem `equipment` nem `notes` vira `equipment: {}` | ⚪ Equivalente (136 pass; raciocínio abaixo) |
| M24 | `src/components/admin/space-form-dialog.tsx:106` | sem `setPending(false)` | ✅ Killed (1 fail) |
| M25 | `src/components/admin/spaces-manager.tsx:35` | sem `router.invalidate()` | ✅ Killed (2 fail) |
| N01 | `src/infra/db/repos/space-repository.ts:107` | `update` sempre substitui equipamentos (ausente apaga) | ✅ Killed (3 fail) |
| N02 | `src/infra/db/repos/space-repository.ts:104` | `update` sempre grava `notes ?? null` | ✅ Killed (2 fail) |
| N03 | `src/application/spaces.ts:109` | serviço repassa `items` ausente como `{}` | ✅ Killed (3 fail) |
| N04 | `src/application/spaces.ts:114` | serviço repassa `notes` ausente como `null` | ✅ Killed (2 fail) |
| N05 | `src/server/admin-actions.ts:126` | ação repassa `notes` ausente como `null` | ✅ Killed (1 fail) |
| N06 | `src/server/admin-actions.ts:118` | ação repassa `equipment` ausente como `{}` | ✅ Killed (3 fail) |
| N07 | `src/components/admin/space-card.tsx:71` | observações com `break-words` em vez de `wrap-anywhere` | ✅ Killed |
| N08 | `src/components/admin/space-card.tsx:48` | item da grade sem `min-w-0` | ✅ Killed |
| N08b | `src/components/admin/space-card.tsx:51` | nome sem `wrap-anywhere` | ✅ Killed |
| N09 | `src/server/admin-actions.ts:78` | mensagens de 401 e 403 trocadas | ✅ Killed (22 fail) |
| N10 | `src/infra/db/repos/space-repository.ts:114` | `update` não relê o espaço (monta o retorno do pedido) | ✅ Killed (3 fail) |
| N11 | `src/infra/db/repos/space-repository.ts:96` | `update` com equipamentos não confere existência | ✅ Killed (1 fail) |
| N12 | `src/components/admin/space-form-dialog.tsx:102` | diálogo deixa de enviar `notes` | ✅ Killed (2 fail) |
| N13 | `src/infra/db/repos/space-repository.ts:80` | `create` com equipamentos ignora observações | ✅ Killed (6 fail) |
| N14 | `src/infra/db/repos/space-repository.ts:12` | quantidade 0 ("não tem") não vira linha | ✅ Killed (3 fail) |
| N15 | `src/server/admin-actions.ts:228` | `listAdminSpaces` usa `list()` | ✅ Killed (2 fail) |
| N16 | `src/components/admin/space-card.tsx:94` | título da confirmação sem `wrap-anywhere` | ✅ Killed |
| N17 | `src/infra/db/repos/space-repository.ts:121` | `remove` em sequência, sem `runAtomically` | ❌ Survived (136 pass) → lacuna 1 (Minor) |
| N18 | `src/routes/admin.espacos.tsx:48` | "Tentar de novo" da rota sem `router.invalidate()` | ❌ Survived (39 pass) → matriz: route wiring = none; ligação conferida no navegador (AC8) |
| N19 | `src/infra/db/repos/space-repository.ts:90` | `update` sem `equipment` zera as observações | ✅ Killed (2 fail) |
| N20 | `src/components/admin/spaces-manager.tsx:35`-`:36` | anuncia antes de a recarga terminar | ⚪ Equivalente quanto à spec (39 pass): o AC3 lista os efeitos, não a ordem; o estado final é o mesmo |

**M19 (confirmado equivalente).** Sem a linha 115, um pedido sem `equipment` nem `notes` chega ao serviço como `equipment: {}`; `parseEquipment({})` devolve `{}` e o repositório segue pelo ramo com equipamentos com `items` e `notes` ausentes. Em `update`, esse ramo confere a existência (inexistente continua `null` → 404) e executa só o `UPDATE` de nome e capacidade (sem `equipmentNotes`, sem apagar nem inserir equipamentos); nome duplicado continua estourando na mesma instrução e virando 409. Em `create`, grava `equipment_notes = null` (o mesmo valor padrão) e nenhuma linha de equipamento. O estado gravado é idêntico em todos os casos; a única diferença é a resposta passar a trazer `equipment` (relido no `update`; `{ items: {}, notes: null }` no `create`, que é a verdade gravada). A spec não define o formato da resposta de criar/editar (ESPACOS-14 fala de `listSpaces`); só o design ("Retorno de create/update: inclui `equipment` só quando o pedido trouxe equipamentos") o faz. Logo, equivalente quanto à spec.

**Sensor depth**: P0 (integridade de dados e autorização) - 26 mutações manuais, 21 novas, focadas no código das correções (porta `EquipmentWrite`, `update` parcial, relida, ação e serviço com campo ausente, classes de quebra, 401/403).
**Result**: 22 killed, 2 equivalentes, 2 sobreviventes não bloqueantes (N17 Minor; N18 coberto por conferência manual prevista na matriz) - PASS

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (desvios registrados em `tasks.md`) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`asAdmin`, `runAtomically`, `runAdminAction`, `FieldError`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met | ✅ (repositório com falha posterior em `create`/`update`; `remove` sem esse teste, lacuna 1) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `AGENTS.md`, `bunfig.toml` (cobertura 90%), `.dependency-cruiser.cjs` | ✅ (`spaces.ts`, `space-repository.ts`, `admin-actions.ts`, `equipment.ts`, `space-groups.ts` com 100% de linhas e funções) |

---

## Gate Check

- **Gate command**: `bun run check` na worktree verificada (log em `C:\Users\luiss\tcc\tmp\verify-admin2.log`)
- **Result**: 1355 passed, 0 failed, 3 skipped; biome (313 arquivos), `tsc --noEmit`, knip, depcruise (0 violações) e betterleaks ("no leaks found") limpos; saída 0
- **Test count before feature** (`9bf1fc1`, rodada 1): 1258 pass + 2 skip = 1260
- **Test count after feature**: 1355 pass + 3 skip = 1358 (rodada 1: 1351)
- **Delta**: +98 desde a base; +7 desde a rodada 1; nenhum teste removido. Asserção alterada: o teste da ação que esperava `items: {}` ao editar só com `notes` passou a esperar os equipamentos mantidos (ACT:486-491), o que segue a decisão nova do AC10
- **Skipped tests**: os 2 que já existiam e `src/infra/db/flow/space-d1.test.ts:17` (só com `RUN_D1_TESTS=1`; rodado pelo verificador: 1 pass)
- **Failures**: nenhuma

---

## Lacunas ranqueadas (nenhuma bloqueia)

1. **Minor - exclusão sem teste de atomicidade** (`src/infra/db/repos/space-repository.ts:121`, mutante N17). A porta promete "apaga o espaço e seus equipamentos numa unidade atômica" e o design fala em "mesmo lote", mas nenhum teste força falha na segunda exclusão. Nenhum AC é violado em execução sequencial, porque as duas instruções têm a mesma condição `NOT EXISTS`; a diferença só aparece com escrita concorrente entre elas ou falha da segunda instrução. Fix sugerido: em REPO, gatilho `BEFORE DELETE ON spaces … RAISE(ABORT)` e afirmar que `remove` rejeita e que o equipamento continua lá.
2. **Minor - README desatualizado**: `README.md:107` diz "Espaços não têm exclusão nesta etapa.", e a feature criou a exclusão de espaço sem uso.
3. **Minor (observação) - corrida entre a checagem de existência e a gravação em `update`** (`src/infra/db/repos/space-repository.ts:95`-`:113`): se o espaço for excluído entre o `SELECT` e o lote, a inserção de equipamentos falha na FK e a resposta vira erro genérico em vez de 404. Fica dentro da premissa "última gravação vence / um admin por vez".
4. **Minor - observações com 501 caracteres sem afirmar "sem gravar"** (SVC:333-341); os outros casos de recusa conferem `rows.size === 0`.
5. **Minor - "sem gravar" em 401/403 só é afirmado para criar**: ACT:184 confere `spaces.list()` vazio, mas `updateSpace`/`deleteSpace` usam o id inexistente `"x"`; o Independent Test da spec ("o espaço fica como estava") não roda sobre um espaço existente. O status 403 já discrimina a autorização (N09 e M17 da rodada 1 morrem).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| ESPACOS-01 | Needs Fix | ✅ Verified (M10 morto) |
| ESPACOS-02 | Verified | ✅ Verified |
| ESPACOS-03 | Verified | ✅ Verified |
| ESPACOS-04 | Needs Fix | ✅ Verified (360 px no navegador com texto longo; "Tentar de novo" da rota no navegador) |
| ESPACOS-05 | Verified | ✅ Verified |
| ESPACOS-06 | Needs Fix | ✅ Verified (M24, M25 mortos) |
| ESPACOS-07 | Verified | ✅ Verified |
| ESPACOS-08 | Verified | ✅ Verified |
| ESPACOS-09 | Verified | ✅ Verified |
| ESPACOS-10 | Needs Fix | ✅ Verified (M16 morto; campos independentes com N01–N06, N10, N19 mortos) |
| ESPACOS-11 | Needs Fix | ✅ Verified (mensagens exatas; N09 morto) |
| ESPACOS-12 | Needs Fix | ✅ Verified (recarga afirmada; lacuna 1 como recomendação) |
| ESPACOS-13 | Verified | ✅ Verified |
| ESPACOS-14 | Verified | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 44/44 critérios com asserção no resultado da spec; 0 imprecisões
**Sensor**: 22/26 mortos, 2 equivalentes (M19, N20), 2 sobreviventes não bloqueantes (N17, N18)
**Gate**: 1355 passed, 0 failed, 3 skipped

**What works**: campos independentes na edição em todas as camadas (ação, serviço, repositório que relê), atomicidade de criar e editar com falha numa instrução posterior (bun:sqlite e D1 local), mensagens exatas de 401/403/400, ordem natural no mesmo andar, regravar depois de erro, recarga da lista depois de salvar e excluir, 360 px e 1280 px sem rolagem com texto longo sem espaço, "Tentar de novo" na rota real.

**Next steps**: lacunas 1 a 5 como recomendações (sem nova rodada obrigatória).

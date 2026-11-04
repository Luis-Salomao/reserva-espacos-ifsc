# Administração de espaços: validação

## Validation: admin-espacos - FAIL

**Date**: 2026-11-04
**Spec**: `.specs/features/admin-espacos/spec.md`
**Diff range**: `9bf1fc1..7ace526` (branch `feat/admin-espacos`; 13 commits de código, T1 a T13)
**Verifier**: subagente independente (autor ≠ verificador). Cobertura re-derivada da spec e do diff, sem usar o relatório do autor como evidência.

Veredito: **FAIL**. O gate passa e 24 de 29 mutantes morrem, mas 5 mutantes sobrevivem em comportamentos que a spec define (atomicidade, manutenção dos equipamentos na ação, regravação depois de erro, recarga da lista, ordem natural), e a lista transborda em 360 px quando as observações têm um trecho longo sem espaço.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Catálogo de equipamentos | ✅ Done | `65d8eb4` |
| T2 Agrupamento | ⚠️ Done com lacuna | `81e52b4`; ordem natural dentro do andar sem teste que discrimine (M10) |
| T3 Esquema e migração | ✅ Done | `e3c8f0d`; migração conferida por teste e por mutante (M28) |
| T4 Repositório com equipamentos | ⚠️ Done com lacuna | `1ef1d44`; atomicidade sem teste de falha numa instrução posterior (M16) |
| T5 Repositório exclui | ✅ Done | `dbd764a` |
| T6 Validação | ✅ Done | `8ff19c8` |
| T7 Caso de uso de exclusão | ✅ Done | `66fd579` |
| T8 Ações | ⚠️ Done com lacuna | `17cb22d`; "sem equipamentos nem observações mantém" sem teste na ação (M19) |
| T9 Agenda | ✅ Done | `e662fa0`; só gate de build (matriz: none) |
| T10 SpaceCard | ✅ Done | `0930723` |
| T11 SpaceFormDialog | ⚠️ Done com lacuna | `86ed8fb`; regravar depois de erro sem teste (M24) |
| T12 SpacesManager | ⚠️ Done com lacuna | `adf4025`; recarga da lista sem teste (M25) |
| T13 Rota | ⚠️ Done com lacuna | `7ace526`; 360 px conferido no navegador pelo verificador, com transbordo em dado extremo |

---

## Spec-Anchored Acceptance Criteria

Caminhos relativos à raiz da worktree. "AMT" = `src/components/admin/admin-managers.test.tsx`.

### P1: Ver os espaços organizados

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 agrupar por bloco e andar, "Outros espaços"/"Sem andar identificado" por último, ordem natural | Ordem dos blocos, dos andares e dos nomes; `A-202` antes de `A-1000` | `src/domain/space-groups.test.ts:31` `toEqual(["Bloco A","Bloco B","Outros espaços"])`; `:39` andares `["Andar 1","Andar 2","Sem andar identificado"]`; `:53`; AMT:346 `names()` `toEqual(["A-105","A-110","A-202","B-101","Auditório"])` | ❌ GAP: o teste de ordem natural (`space-groups.test.ts:63`) passa por acaso, porque `A-1000` não tem código de 3 dígitos e cai em outro andar; trocar o `collator` numérico por ordem lexical (M10) sobrevive. A spec também usa um exemplo que não exercita a regra (⚠️ imprecisão da spec) |
| AC2 capacidade "N lugares" / "Capacidade não informada" | Texto exato | AMT:462 `getByText("40 lugares")`; AMT:472 `getByText("Capacidade não informada")` | ✅ |
| AC3 um rótulo por equipamento, 3 estados × 3 tipos, "1 computador" | 9 textos + singular | `src/domain/equipment.test.ts:17` `toEqual({ text, known })` para os 10 casos; AMT:466 `toEqual(["Projetor","1 computador","Sem aparelho de som"])`; AMT:476 os três "não informado" | ✅ |
| AC4 observações no cartão | Texto das observações | AMT:467 `toBe("Observações: Lousa digital\nTV")`; AMT:481 ausência quando `null` | ✅ |
| AC5 busca por `matchesRoomSearch` e "X de N espaços" | Filtro + contador com total dinâmico | AMT:372 `getByText("1 de 5 espaços")`, AMT:373 `names()` `["A-202"]` | ✅ |
| AC6 "Nenhum espaço encontrado." + "Limpar busca" | Mensagem e volta à lista completa | AMT:375-379 mensagem, `value === ""`, `names()` com 5 | ✅ |
| AC7 "Nenhum espaço cadastrado." + "Cadastrar espaço" abre o diálogo | Mensagem e diálogo "Novo espaço" | AMT:384-387 | ✅ |
| AC8 erro de carga com "Tentar de novo" | Mensagem e nova carga | AMT:418-420 `retries === 1` (componente `SpacesLoadError`); a ligação `router.invalidate` em `src/routes/admin.espacos.tsx` só tem gate de build (matriz: route wiring = none) | ✅ (componente) |
| AC9 360 px sem rolagem horizontal | `scrollWidth === clientWidth` em 360 px, lista e diálogo | Sem teste automatizado (happy-dom não mede layout). Medição do verificador no navegador (Chrome, 360×780 móvel, dados semeados): lista 360/360, diálogo de edição 360/360, confirmação 360/360; 1280 px 1265/1265. **Com observação de 120 caracteres sem espaço, a página foi a 957 px** (`<ul class="grid gap-3 md:grid-cols-2">` em `src/components/admin/spaces-manager.tsx:89`; `break-words` em `src/components/admin/space-card.tsx:71` não reduz a largura mínima do item de grade) | ❌ GAP (dado extremo) + ⚠️ sem evidência automatizada |

### P1: Cadastrar e editar espaço num diálogo

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 "Novo espaço" vazio, presença em "Não informado" | Valores iniciais | AMT:577 `value === ""` em nome, capacidade, computadores, observações; `checked(...)` `["Não informado"]` em Projetor e Aparelho de som; foco no nome | ✅ |
| AC2 "Editar espaço" preenchido | Dados gravados | AMT:596 nome "A-202", capacidade "40", Projetor "Sim", som "Não informado", computadores "0", observações "Lousa digital" | ✅ |
| AC3 salvar grava, fecha, **recarrega a lista** e anuncia "Espaço salvo." em `role="status"` | Quatro efeitos | AMT:396 `status.textContent === "Espaço salvo."`, AMT:397 diálogo fechado, AMT:398 chamada `update` com `id`; AMT:613 formato do fio | ❌ GAP: a recarga não é afirmada; remover `await router.invalidate()` (M25) sobrevive |
| AC4 recusa de campo: mantém o digitado, mensagem abaixo, `aria-invalid`, `aria-describedby`, foco | Estado do campo | AMT:666 (computadores: foco, `aria-invalid="true"`, `aria-describedby` contém o id do alerta, valor "1000" e nome mantidos); AMT:688 (projetor: foco na 1ª opção, grupo ligado); AMT:423 (capacidade) | ⚠️ parcial: nenhum teste corrige e salva de novo (o Independent Test da spec pede isso); manter o botão em "Salvando…" para sempre depois da recusa (M24) sobrevive |
| AC5 falha sem campo: alerta no topo, diálogo aberto | Mensagem do servidor | AMT:704 `toBe("Sem permissão para esta ação.")`, diálogo presente | ✅ |
| AC6 "Salvando…" com botão desabilitado | Texto e `disabled` | AMT:650-651 `findByRole("button", { name: "Salvando…" })`, `disabled === true` | ✅ |
| AC7 fechar/cancelar descarta | Próxima abertura com dados gravados | AMT:715 (Cancelar e "Fechar"; nome volta a "A-202"; `spaceCalls` vazio) | ✅ |
| AC8 regras de nome e capacidade | Aparado, 1–80, sem controle, único sem caixa; inteiro 1–2000 | `src/application/spaces.test.ts:60`, `:85`-`:99`, `:101`-`:115`, `:117`, `:121`; `src/server/admin-actions.test.ts:450`-`:454` (409/400 com `field`) | ✅ |

### P1: Registrar equipamentos por espaço

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 projetor/som sim-não-não informado; computadores 0–999; observações ≤ 500 | Estados e limites | `src/application/spaces.test.ts:252` (presença, " 12 ", observações aparadas com `\n\t`); `:268` (vazio/nulo/0); `:278` (0 e 999) | ✅ |
| AC2 uma linha por equipamento informado, nenhuma para não informado | Linhas em `space_equipment` | `src/infra/db/repos/space-repository.test.ts:102` `countEquipment() === 1` após `{ som: 0 }`; `:71` `items: {}` para espaço sem equipamentos | ✅ |
| AC3 migração mantém espaços e lê tudo como não informado | Nome e capacidade intactos; `equipment_notes` nulo; nenhuma linha | `src/infra/db/repos/space-repository.test.ts:240`-`:248` (aplica 0000–0008, insere 2 espaços, aplica 0009); `src/infra/db/flow/space-d1.test.ts:57` (D1 local; rodado pelo verificador com `RUN_D1_TESTS=1`: 1 pass) | ✅ |
| AC4 computadores fora de 0–999 ou não inteiro | Mensagem exata no campo `computadores`, sem gravar | `src/application/spaces.test.ts:298` `toEqual({ ok:false, kind:"validation", message: COUNT_ERROR, field:"computadores" })` para -1, 1000, 2,5, "doze", "1.5", "10000"; `:304` `rows.size === 0`; `src/server/admin-actions.test.ts:521` (400) | ✅ |
| AC5 presença fora de 1/0/vazio/nulo | "Escolha sim, não ou não informado." no campo | `src/application/spaces.test.ts:315` para 2, "1", -1, 5, "sim" | ✅ |
| AC6 observações > 500 após aparar | Mensagem exata em `notes` | `src/application/spaces.test.ts:325` (500 ok; 501 com espaços em volta recusado) | ✅ |
| AC7 controle além de `\n` e `\t` | "As observações contêm caracteres inválidos." | `src/application/spaces.test.ts:339` (U+0007, DEL, U+0085) | ✅ |
| AC8 tipo fora do catálogo | "Tipo de equipamento desconhecido.", sem gravar | `src/application/spaces.test.ts:348`-`:353`; `src/server/admin-actions.test.ts:525` (400 com a mensagem) | ✅ |
| AC9 gravação atômica, substituindo o conjunto | Tudo ou nada | Substituição: `src/infra/db/repos/space-repository.test.ts:90`. Atomicidade: `:113` e `:123` forçam falha só na **primeira** instrução (UNIQUE do nome), o que não distingue transação de execução em sequência | ❌ GAP: trocar `runAtomically` por execução sequencial em `create` e `update` (M16) sobrevive. Uma sonda do verificador com gatilho que falha na inserção do 2º equipamento mata o M16 e passa no código real, então a lacuna é fechável (lição L-011) |
| AC10 edição sem equipamentos nem observações mantém o gravado | Equipamentos e observações intactos | `src/infra/db/repos/space-repository.test.ts:105` (repositório); `src/application/spaces.test.ts:356` (serviço não repassa `equipment`) | ❌ GAP na ação: remover o retorno `undefined` de `equipmentBody` (`src/server/admin-actions.ts:112`, M19) sobrevive; nenhum teste da ação edita sem `equipment`/`notes` um espaço que já tem equipamentos |

### P1: Só admin altera espaços

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 sem sessão → 401 "É preciso entrar." | Status e mensagem | `src/server/admin-actions.test.ts:173`-`:176` `toMatchObject({ ok:false, status:401 })` para `listAdminSpaces`, `createSpace`, `updateSpace`, `deleteSpace` (`:158`-`:169`) | ⚠️ parcial: status afirmado, mensagem não |
| AC2 sem papel `admin` → 403 "Sem permissão para esta ação." sem gravar | Status, mensagem e nada gravado | `src/server/admin-actions.test.ts:178`-`:183` (`horarios` e `docente` → 403; `spaces.list()` vazio); mutante M17 (deleteSpace aceitando `horarios`) morto | ⚠️ parcial: status afirmado, mensagem não |
| AC3 corpo inválido → 400 "Requisição inválida." sem gravar | Mensagem exata | `src/server/admin-actions.test.ts:541`-`:545` `toEqual({ ok:false, status:400, message:"Requisição inválida." })` para equipamento texto, lista, `null`, booleano, objeto; notes número/lista; `:550` nada gravado; `:552` exclusão sem `id` texto | ✅ |

### P2: Excluir espaço sem uso

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 "Excluir" abre "Excluir {nome}?" sem chamar o servidor | Título, botões, zero chamadas | AMT:490 (`getByText("Excluir A-202?")`, botão "Excluir espaço", `spaceCalls` vazio) | ✅ |
| AC2 cancelar fecha sem chamar | Zero chamadas | AMT:496-498 | ✅ |
| AC3 sem uso: apaga espaço e equipamentos, **recarrega** e anuncia "Espaço excluído." | Linhas apagadas; anúncio | `src/infra/db/repos/space-repository.test.ts:162`-`:166` (0 espaços, 0 equipamentos); `src/server/admin-actions.test.ts:577` (`{ ok:true, data:null }`); AMT:405 `status === "Espaço excluído."` | ⚠️ parcial: recarga não afirmada (M25, ver diálogo AC3) |
| AC4 em uso (ocupação ativa/cancelada, vínculo XML, linha de importação) → 409 com a mensagem, nada apagado | Status, mensagem, contagens | `src/infra/db/repos/space-repository.test.ts:168`, `:178`, `:188` (`in_use`, 1 espaço, 1 equipamento); `src/server/admin-actions.test.ts:581`-`:585` `toEqual({ ok:false, status:409, message:"Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído." })`; D1 `src/infra/db/flow/space-d1.test.ts:95` | ✅ |
| AC5 inexistente → 404 "Espaço não encontrado." | Status e mensagem | `src/server/admin-actions.test.ts:586`-`:590`; `src/application/spaces.test.ts:431`-`:435` | ✅ |
| AC6 recusa aparece na confirmação, sem fechá-la | Alerta dentro do `alertdialog` | AMT:524-526; reabrir sem alerta antigo AMT:531 | ✅ |
| AC7 "Excluindo…" com botão desabilitado | Texto e `disabled` | AMT:506-507 | ✅ |

### P2: Equipamentos na consulta da agenda

| Critério | Resultado definido na spec | `file:line` + asserção | Result |
| -------- | -------------------------- | ---------------------- | ------ |
| AC1 `listSpaces` devolve `id`, `name`, `capacity` e `equipment` | Formato | `src/infra/db/repos/space-repository.test.ts:71`-`:74` `toEqual` exato de `listWithEquipment()`; a ligação `src/server/spaces.ts:16` só tem gate de build (matriz: none) | ✅ (repositório) |
| AC2 `equipment` opcional em `Space` | Código antigo compila | `tsc --noEmit` no `bun run check` (saída 0); testes que constroem `Space` sem `equipment` (ex.: AMT:323) | ✅ |
| AC3 `list()` só com `id`, `name`, `capacity` | Chaves exatas | `src/infra/db/repos/space-repository.test.ts:80` `Object.keys(first)` `toEqual(["id","name","capacity"])` | ✅ |

### Edge cases

- [x] " 12 " grava 12: `src/application/spaces.test.ts:261`; `src/server/admin-actions.test.ts:479`.
- [x] Computadores vazio ou só espaços = não informado: `src/application/spaces.test.ts:269`-`:275`.
- [x] Observações só com espaços = `null`: `src/application/spaces.test.ts:272`.
- [x] Nome sem código em "Outros espaços" > "Sem andar identificado": `src/domain/space-groups.test.ts:53`.
- [x] Excluir espaço já excluído → "Espaço não encontrado." na confirmação: servidor `src/server/admin-actions.test.ts:586`; a interface mostra qualquer recusa no alerta (AMT:514, testado com 409).
- [ ] Falha no meio da gravação desfaz nome, capacidade e observações: **sem teste que discrimine** (M16 sobrevive).
- [x] Linha com tipo fora do catálogo ignorada na leitura: `src/infra/db/repos/space-repository.test.ts:87` (M12 morto).

### Outras conferências pedidas

- **Autorização das ações novas**: `deleteSpace` e as ações de criar/editar com equipamentos passam por `asAdmin` (`src/server/admin-actions.ts:250`-`:256`); a matriz de `src/server/admin-actions.test.ts:104`-`:184` inclui as quatro ações de espaço; M17 morto.
- **Exclusão condicional**: `NOT EXISTS` em `occupations`, `room_mappings` e `import_rows` dentro das duas instruções do lote (`src/infra/db/repos/space-repository.ts:99`-`:118`); M14 e M15 mortos. A exclusão tem só duas instruções com a mesma condição; o risco de estado parcial ali é baixo, mas o padrão de teste de L-011 também não existe para ela.
- **Migração `drizzle/0009_little_tomas.sql`**: aplica limpa sobre 0000–0008 com dados (`space-repository.test.ts:226`), mantém linhas e cria FK com cascata (M28 morto); D1 local também passou.
- **Visitantes e nomes de pessoas**: `listSpaces` (`src/server/spaces.ts:16`) devolve só `id`, `name`, `capacity` e `equipment { items, notes }` (formato exato em `space-repository.test.ts:71`); nenhum campo de pessoa entra no diff. Observação: `notes` é texto livre e passa a chegar a visitantes quando `PUBLIC_READ=true`, ainda que nenhuma tela o mostre agora; o `[PENDENTE]` de RF-09 da spec cobre a decisão de exibição.

**Status**: ❌ Gaps present (5 mutantes sobreviventes, 1 defeito de layout em dado extremo) e ⚠️ 3 imprecisões.

---

## Discrimination Sensor

Feito numa worktree temporária (`git worktree add C:\Users\luiss\wt-verify-admin HEAD --detach`, `bun install --frozen-lockfile --ignore-scripts`), uma mutação por vez, restauração com `git checkout` na própria worktree temporária, conferida por comparação do conteúdo. Linha de base nos 7 arquivos de teste relevantes: 196 pass, 0 fail. Depois: worktree temporária removida e `git status --porcelain` da worktree verificada vazio antes e depois.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| M01 | `src/domain/equipment.ts:48` | `quantity > 0` → `>= 0` (0 vira "tem") | ✅ Killed (4 fail) |
| M02 | `src/domain/equipment.ts:47` | não informado com `known: true` | ✅ Killed (3 fail) |
| M03 | `src/application/spaces.ts:64` | contagem sem `Number.isInteger` | ✅ Killed |
| M04 | `src/application/spaces.ts:54` | presença aceita o texto `"1"` | ✅ Killed |
| M05 | `src/application/spaces.ts:74` | observações aceitam DEL e C1 | ✅ Killed (2 fail) |
| M06 | `src/application/spaces.ts:96` | tipo desconhecido ignorado | ✅ Killed (2 fail) |
| M07 | `src/application/spaces.ts:170` | `in_use` vira sucesso | ✅ Killed (2 fail) |
| M08 | `src/application/spaces.ts:80` | limite de observações `>` → `>=` | ✅ Killed |
| M09 | `src/domain/space-groups.ts:8` | `floorOf` sem `(?!\d)` | ✅ Killed (3 fail) |
| M10 | `src/domain/space-groups.ts:42` | nomes do andar em ordem lexical, sem `numeric` | ❌ Survived (50 pass) |
| M11 | `src/domain/space-groups.ts:38` | blocos sem ordenação | ✅ Killed (4 fail) |
| M12 | `src/infra/db/repos/space-repository.ts:42` | leitura não ignora tipo fora do catálogo | ✅ Killed |
| M13 | `src/infra/db/repos/space-repository.ts:90` | update não apaga o conjunto anterior | ✅ Killed (2 fail) |
| M14 | `src/infra/db/repos/space-repository.ts:111` | `remove` ignora `import_rows` | ✅ Killed |
| M15 | `src/infra/db/repos/space-repository.ts:115` | `remove` apaga equipamentos de espaço em uso | ✅ Killed (4 fail) |
| M16 | `src/infra/db/repos/space-repository.ts:67`, `:85` | `create`/`update` sem `runAtomically` (sequência sem transação) | ❌ Survived (130 pass) |
| M17 | `src/server/admin-actions.ts:242` | `deleteSpace` aceita o papel `horarios` | ✅ Killed |
| M18 | `src/server/admin-actions.ts:118` | valor de equipamento não primitivo deixa de ser 400 | ✅ Killed |
| M19 | `src/server/admin-actions.ts:112` | edição sem `equipment`/`notes` apaga o gravado | ❌ Survived (56 pass) |
| M20 | `src/components/admin/space-card.tsx:42` | recusa fecha a confirmação | ✅ Killed |
| M21 | `src/components/admin/space-card.tsx:107` | "Excluir espaço" não desabilita | ✅ Killed |
| M22 | `src/components/admin/space-card.tsx:84` | fechar não limpa o erro anterior | ✅ Killed |
| M23 | `src/components/admin/space-form-dialog.tsx:46` | presença vai como texto | ✅ Killed (2 fail) |
| M24 | `src/components/admin/space-form-dialog.tsx:106` | sem `setPending(false)`: botão preso em "Salvando…" depois da resposta | ❌ Survived (38 pass) |
| M25 | `src/components/admin/spaces-manager.tsx:35` | salvar/excluir não recarrega (`router.invalidate` removido) | ❌ Survived (38 pass) |
| M26 | `src/components/admin/spaces-manager.tsx:65` | contador usa o total filtrado como N | ✅ Killed |
| M27 | `src/components/admin/spaces-manager.tsx:78` | "Limpar busca" não limpa | ✅ Killed |
| M28 | `drizzle/0009_little_tomas.sql:6` | FK sem `ON DELETE cascade` | ✅ Killed |
| M29 | `src/components/admin/space-form-dialog.tsx:94` | editar abre com observações vazias | ✅ Killed (2 fail) |
| M16P | sonda do verificador (não versionada) | gatilho `RAISE(ABORT)` na inserção do 2º equipamento: passa no código real, falha com M16 | ✅ prova que M16 é detectável |

**Sensor depth**: P0 (integridade de dados e autorização) - 29 mutações manuais cobrindo domínio, validação, repositório, caso de uso, ações, `SpaceCard`, diálogo, `SpacesManager` e migração.
**Result**: 24/29 killed - FAIL

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (desvios registrados em `tasks.md`: DDL de `atomic.test.ts`, repositórios falsos, ajustes visuais da T13) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`asAdmin`, `runAtomically`, `runAdminAction`, `FieldError`) |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ mensagens 401/403 não afirmadas; recarga não afirmada |
| Per-layer Coverage Expectation met | ❌ repositório sem teste de atomicidade com falha posterior; ação sem teste de "mantém o gravado" |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `AGENTS.md`, `bunfig.toml` (cobertura 90%), `.dependency-cruiser.cjs` | ✅ (`bun run check` saída 0; arquivos novos com 100% de linhas e funções) |

---

## Gate Check

- **Gate command**: `bun run check` na worktree verificada (log em `C:\Users\luiss\tcc\tmp\verify-admin.log`)
- **Result**: 1348 passed, 0 failed, 3 skipped; biome, `tsc --noEmit`, knip, depcruise (0 violações) e betterleaks (sem vazamentos) limpos; saída 0
- **Test count before feature** (`9bf1fc1`, `bun test` na worktree temporária): 1258 pass + 2 skip = 1260
- **Test count after feature**: 1348 pass + 3 skip = 1351
- **Delta**: +91 testes; nenhum removido; asserções antigas mantidas (o teste antigo de capacidade só ganhou o clique em "Novo espaço")
- **Skipped tests**: os 2 que já existiam e `src/infra/db/flow/space-d1.test.ts:17` (só com `RUN_D1_TESTS=1`; rodado pelo verificador: 1 pass)
- **Failures**: nenhuma

---

## Fix Plans

### Fix 1: atomicidade sem teste que discrimine (Major)

- **Root cause**: os testes de "desfaz tudo" falham na primeira instrução (UNIQUE do nome), então execução sequencial sem transação dá o mesmo resultado (M16).
- **Fix task**: em `src/infra/db/repos/space-repository.test.ts`, criar um gatilho `BEFORE INSERT ON space_equipment ... RAISE(ABORT)` para um tipo e afirmar que `update` com nome novo e dois equipamentos rejeita e que `listWithEquipment()` devolve nome, capacidade, observações e equipamentos antigos; idem para `create` (nenhum espaço criado).
- **Done when**: M16 morre; teste passa no código atual.

### Fix 2: ação não prova que edição sem equipamentos mantém o gravado (Major)

- **Root cause**: `src/server/admin-actions.test.ts` não edita sem `equipment`/`notes` um espaço com equipamentos (M19).
- **Fix task**: criar espaço com equipamentos e observações pela ação, chamar `updateSpace` só com `id`, `name`, `capacity` e afirmar com `listAdminSpaces` que `equipment` ficou igual.
- **Done when**: M19 morre.

### Fix 3: regravar depois de recusa não é testado (Major)

- **Root cause**: nenhum teste do diálogo corrige o campo e salva de novo (Independent Test da spec), então o botão preso em "Salvando…" (M24) passa.
- **Fix task**: em AMT, depois da recusa de campo afirmar que o botão volta a "Salvar" habilitado; trocar a resposta para sucesso, salvar de novo e ver "Salvos: 1".
- **Done when**: M24 morre.

### Fix 4: recarga da lista não é afirmada (Minor)

- **Root cause**: os testes de "Espaço salvo." e "Espaço excluído." só olham o anúncio (M25).
- **Fix task**: no teste do `SpacesManager`, contar as chamadas ao loader da rota (ou trocar a lista no loader) e afirmar que salvar e excluir disparam nova carga.
- **Done when**: M25 morre.

### Fix 5: ordem natural dentro do andar sem teste (Minor)

- **Root cause**: o exemplo `A-202`/`A-1000` cai em andares diferentes (M10). A spec usa o mesmo exemplo.
- **Fix task**: teste com nomes do mesmo andar ou de "Sem andar identificado" em que a ordem natural difere da lexical (ex.: "Sala 2", "Sala 10"); ajustar o exemplo do AC1 na spec.
- **Done when**: M10 morre.

### Fix 6: transbordo em 360 px com texto longo sem espaço (Minor)

- **Root cause**: o item da grade (`spaces-manager.tsx:89`) mantém a largura mínima do conteúdo; `break-words` não reduz essa largura. Com uma observação de 120 caracteres sem espaço (ex.: um link), a página foi a 957 px de largura em 360 px.
- **Fix task**: permitir a quebra (ex.: `wrap-anywhere`/`min-w-0` nos itens do cartão e da grade) e conferir no navegador com observação e nome longos sem espaço.
- **Done when**: `scrollWidth === clientWidth` em 360 px com esse dado.

### Fix 7: mensagens 401/403 não afirmadas (Minor)

- **Fix task**: na matriz de acesso de `src/server/admin-actions.test.ts:173`-`:183`, afirmar `message` "É preciso entrar." e "Sem permissão para esta ação.".

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| ESPACOS-01 | Pending | ❌ Needs Fix (M10) |
| ESPACOS-02 | Pending | ✅ Verified |
| ESPACOS-03 | Pending | ✅ Verified |
| ESPACOS-04 | Pending | ❌ Needs Fix (transbordo em 360 px com texto sem espaço) |
| ESPACOS-05 | Pending | ✅ Verified |
| ESPACOS-06 | Pending | ❌ Needs Fix (M24, M25) |
| ESPACOS-07 | Pending | ✅ Verified |
| ESPACOS-08 | Pending | ✅ Verified |
| ESPACOS-09 | Pending | ✅ Verified |
| ESPACOS-10 | Pending | ❌ Needs Fix (M16, M19) |
| ESPACOS-11 | Pending | ❌ Needs Fix (mensagens 401/403 não afirmadas) |
| ESPACOS-12 | Pending | ❌ Needs Fix (recarga da lista, M25) |
| ESPACOS-13 | Pending | ✅ Verified |
| ESPACOS-14 | Pending | ✅ Verified |

---

## Imprecisões da spec

1. AC1 de "Ver os espaços": o exemplo de ordem natural (`A-202` antes de `A-1000`) não exercita a regra, porque `A-1000` não tem andar identificado e vai para outro grupo.
2. AC10 de "Equipamentos" só define o caso "sem equipamentos **nem** observações". Com só `notes` no pedido, a implementação troca o conjunto de equipamentos por vazio (`src/server/admin-actions.test.ts:484`-`:487` afirma `items: {}`); a spec não diz se isso é o esperado.
3. AC9 de "Ver os espaços" (360 px) não diz como será verificado nem com que dados (texto longo sem espaço ficou de fora).

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 34 de 44 critérios (ACs + edge cases) com asserção no resultado da spec; 6 com lacuna (❌) e 4 parciais (⚠️); 3 imprecisões da spec
**Sensor**: 24/29 mutations killed
**Gate**: 1348 passed, 0 failed, 3 skipped

**What works**: validação de equipamentos e observações (todas as mensagens exatas), exclusão condicional no repositório e no servidor, autorização das ações novas, migração 0009 sobre dados antigos (SQLite e D1 local), cartão, confirmação de exclusão, abertura e descarte do diálogo, busca e contador; 360 px e 1280 px sem rolagem com dados comuns.

**Issues found**: Fix 1 a Fix 7 acima.

**Next steps**: rotear Fix 1 a Fix 5 (testes) e Fix 6 (layout) a um implementador e verificar de novo (iteração 1 de 3).

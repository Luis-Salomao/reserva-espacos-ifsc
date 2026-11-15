# Docentes do XML: validação

**Date**: 2026-11-04
**Spec**: `docs/specs/features/docentes-do-xml/spec.md`
**Diff range**: `6181b01..5b42004` (branch `feat/docentes-do-xml`, 17 commits, 63 arquivos)
**Verifier**: subagente independente (autor ≠ verificador); evidência rederivada do código e dos testes, sem usar o relatório do autor

**Verdict**: FAIL

Motivo: dois mutantes não equivalentes sobreviveram (M11 e M14). O código de produção se comporta como a spec pede nos dois casos, mas os testes não detectam a regressão. Pela regra do sensor, mutante sobrevivente vira tarefa de correção antes de dar a feature por concluída.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T10 | ✅ Done | T10 com desvio registrado: testes em `src/infra/db/flow/import-version.test.ts` (depcruise proíbe teste de aplicação importar infra) |
| T11 | ✅ Done | Desvio registrado: rota de API `/api/import-responsibles` em vez de server fn; botão em `batch-detail.tsx` |
| T12-T15 | ✅ Done | - |
| T16 | ✅ Done | Desvio registrado: formulários embutidos no cartão, não modais |

---

## Spec-Anchored Acceptance Criteria

### P1: Criar contas fantasmas na importação

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1: DTO do docente | só `id`, `short`, `name`; sem e-mail, celular, gênero, cor | `src/import-asc/normalize.test.ts:226` - `expect(teacher).toEqual({ id: "P9", short: "ZQ", name: "Zeca Quintal" })` e `not.toMatch(/exemplo\.invalid\|48911112222\|#123456\|gender/)`; `normalize.test.ts:39` - chaves `["id","name","short"]`; `src/import-asc/preview.test.ts:37` | ✅ PASS (M1 morto) |
| AC1: fallback do nome | `name`, senão `firstname lastname`, senão sigla | `src/import-asc/normalize.test.ts:234` - `toEqual(["Zeca Quintal", "Lua", "Sol", "XY", ""])` | ✅ PASS |
| AC2: padrão "Criar conta fantasma" | `defaultAction: "fantasma"` sem vínculo nem sugestão | `src/infra/db/flow/import-mappings-placeholders.test.ts:54` - `toEqual({... suggestion: null, defaultAction: "fantasma"})`; `:68` sugestão → `"sugestao"`; `:83` salvo → `"salvo"`; UI `src/components/import/import-flow.test.tsx:361` - opção "Criar conta fantasma" `selected: true`; `src/components/import/flow-helpers.test.ts:116` | ✅ PASS (M6 morto) |
| AC3: cria fantasma e vínculo | nome do XML, e-mail presumido, sigla como código, papel `docente`, `placeholder: true`, vínculo gravado | `import-mappings-placeholders.test.ts:112` - `toMatchObject({ name: "Zeca Quintal", email: "zeca.quintal@ifsc.edu.br", code: "ZQ", roles: ["docente"], active: true, placeholder: true })` e `teachers.list()` com `userId` da fantasma | ✅ PASS |
| AC4: colisão de e-mail | sufixo `2` no segundo | `src/domain/guess-email.test.ts:29` - `toBe("ana.silva2@ifsc.edu.br")`, depois `ana.silva3`; `import-mappings-placeholders.test.ts:130` - no envio e contra conta existente (`lua.sol2@`) | ✅ PASS (M3 morto) |
| AC5: reimportação sem duplicar | reaproveita a fantasma; nenhuma conta nova | `import-mappings-placeholders.test.ts:163` - `expect(await env.users.list()).toHaveLength(1)` e mesmo `id` para `P1` e `NOVA-ID`; `src/server/import-actions.test.ts:300` - segunda sugestão vem `"salvo"` | ✅ PASS (M5 morto) |
| AC6: falha não deixa nada | nenhuma conta nem vínculo do envio | `src/infra/db/repos/mapping-repositories.test.ts:89` - e-mail duplicado no meio → `users.list()` vazio e vínculo antigo intacto; `:113` - vínculo com FK inválida desfaz as contas; `import-mappings-placeholders.test.ts:183` - item inválido depois de fantasma → nada gravado | ✅ PASS (M4 morto) |

### P1: Avatar do responsável na agenda

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1: avatar logado | avatar com iniciais no cartão | `test/components/agenda-person.test.tsx:34` - `getByText("FL")`; `:88` fantasma → `getByText("ZQ")` | ✅ PASS |
| AC2: cartão < 54 px | só avatar; nome no rótulo acessível | `agenda-person.test.tsx:52` - avatar `"FL"` com `aria-hidden="true"` e nome com classe `sr-only` | ✅ PASS (M12 morto) |
| AC3: visitante sem avatar, iniciais nem nome | nenhum avatar | Dados: `src/application/bookings.test.ts:545` - visitante `person` `toBeNull()` e JSON sem `placeholder` (M10b morto). Componente: `agenda-person.test.tsx:101` e `:114` só verificam ausência de `"FL"` e de `"Fabiana"` | ❌ GAP (M11 sobreviveu: avatar genérico para visitante passa) |
| AC4: avulsa | avatar de quem reservou | `agenda-person.test.tsx:66` - `getByText("RC")` em avulsa curta e `"FL"` em longa | ✅ PASS |
| AC5: fantasma | avatar normal e selo "conta não ativada" nos detalhes | `agenda-person.test.tsx:88` (avatar) e `:208` - `getByText(/conta não ativada/i)` na fantasma, `queryByText(...)` nulo na conta comum; `bookings.test.ts:545` - `placeholder: true` para logado | ✅ PASS |

### P1: Atualizar responsáveis das aulas já importadas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1: aplica vínculos atuais aula por aula | responsável por `lesson_id` nas importadas ativas do semestre | `src/infra/db/repos/import-repository.test.ts:98` - `toEqual({ o1: "u1", o2: "u1", o3: null, o4: "u2" })`; `src/infra/db/flow/import-version.test.ts:1687` - `L1:ativa` → `user-t2`, `L2:ativa` → `null` | ✅ PASS |
| AC2: avulsa e cancelada intocadas | sem alteração | `import-repository.test.ts:122` - `toEqual({ avulsa: "u2", cancelada: null })` e `changed 0`; `:143` - fora do semestre, outro semestre e lote rascunho intocados; `import-version.test.ts:1687` - manual mantém `user-t1` | ✅ PASS (M7, M8 mortos) |
| AC3: contagens | mudaram e continuam sem responsável | `import-version.test.ts:1687` - `toEqual({ ok: true, value: { changed: 5, withoutResponsible: 6 } })`; UI `src/components/import/refresh-responsibles.test.tsx:33` - "12 ocupações mudaram de responsável; 1 continua sem responsável." | ✅ PASS |
| AC4: 403 para quem não é admin/horários | 403 | `src/server/import-actions.test.ts:128` (laço com `refreshResponsibles`) - docente `status: 403`, anônimo 401; rota `src/server/import-prepare.test.ts:186` - 401/403 e corpo não lido (`touched === false`) | ✅ PASS (M17, M18 mortos) |
| AC5: hash diferente | recusa com "Envie o mesmo arquivo da versão aplicada" e nada muda | `import-version.test.ts:1666` - `kind: "validation"`, mensagem, `occupationsOf(env)` igual ao antes; `import-actions.test.ts:376` - `status: 400, message: "Envie o mesmo arquivo da versão aplicada."` | ✅ PASS (M9 morto) |
| AC6: idempotente | mesmo resultado, sem efeito extra | `import-repository.test.ts:162` - segunda chamada `toBe(0)` e estado igual; `import-version.test.ts:1719` - `changed: 0` na repetição e ocupações iguais | ✅ PASS (M19 morto) |

### P2: Ativar ou fundir conta fantasma

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1: selo e filtro | "Não ativada" e filtro só fantasmas | `src/components/admin/admin-managers.test.tsx:194` - `getAllByText("Não ativada")` com 1 item; `:203` - "Só não ativadas" → "Contas (1)" | ✅ PASS |
| AC2: ativar permite login | marca removida e login funciona | `src/server/admin-actions.test.ts:367` - login antes `false`, `placeholder: false`, login depois `true`; `src/application/users.test.ts:633`; `src/infra/db/repos/user-repository.test.ts:137` | ✅ PASS |
| AC3: e-mail em uso | "Este e-mail já está em uso" | `admin-actions.test.ts:381` - `status: 409, field: "email", message: "Este e-mail já está em uso."` e fantasma segue marcada; `users.test.ts:657`; `user-repository.test.ts:154` | ✅ PASS (M15 morto) |
| AC4: fundir transfere e apaga | ocupações (responsável) e vínculos do XML para o alvo; fantasma apagada | `user-repository.test.ts:96` - snapshot com `responsibleUserId`, `createdBy` e vínculos em `real`, sessões vazias, fantasma fora de `users`; `admin-actions.test.ts:396` | ✅ PASS no resultado / ❌ GAP na atomicidade (M14 sobreviveu) |
| AC5: alvo fantasma ou inativo | recusa | `admin-actions.test.ts:410` - `status: 400, field: "targetId"` e fantasma preservada; `users.test.ts:699`; `user-repository.test.ts:114` - nada muda | ✅ PASS (M16 morto) |
| AC6: fantasma não entra | mesma mensagem (e mesmo custo) da credencial inválida | `src/application/auth.test.ts:191` - `expect(ghost).toEqual(wrong)`, `{ ok: false, reason: "invalid" }`, `hasher.calls` com 2 (um verify por login), nenhuma sessão, tentativa registrada como falha | ✅ PASS (M2 morto) |

**Status**: ❌ Gaps presentes (P1 Avatar AC3 no componente; P2 AC4 na atomicidade). Nenhum ⚠️ spec-precision gap: os resultados da spec são precisos o bastante para as asserções conferidas.

---

## Edge Cases

- [x] Sem nome nem sigla → "Docente sem nome" e `docente.ID@ifsc.edu.br`: `import-mappings-placeholders.test.ts:155` (`name: "Docente sem nome"`, `email: "docente.p7@ifsc.edu.br"`); `guess-email.test.ts:23`
- [x] Nome de uma palavra → `palavra@ifsc.edu.br`: `guess-email.test.ts:19` (`cecilia@ifsc.edu.br`)
- [x] Vínculo salvo com conta real é mantido e não cria fantasma: `import-mappings-placeholders.test.ts:83` (`defaultAction: "salvo"`); `flow-helpers.test.ts:116` (salvo vira `user:u2`, não `placeholder`)
- [x] Vários docentes → primeiro com vínculo, na ordem do XML: `src/application/import-plan.test.ts:109` (regra `responsibleOf`, reaproveitada por `refreshResponsibles` em `src/application/import-apply.ts:428`)

---

## Discrimination Sensor

Executado numa worktree isolada (`C:\Users\luiss\wt-verify-doc`, HEAD destacado), uma mutação por vez, com `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0` e conferência de que a mutação estava no disco antes de rodar. `git status --porcelain` da worktree verificada: vazio antes e depois.

| # | File:line | Mutação | Testes que falharam | Killed? |
| - | --------- | ------- | ------------------- | ------- |
| M1 | `src/import-asc/normalize.ts:222` | DTO do docente passa a levar `email` | 4 (`normalize.test.ts:39,48,226`, `preview.test.ts:37`) | ✅ |
| M2 | `src/application/auth.ts:104` | remove `record.placeholder \|\|` (fantasma entra) | `auth.test.ts:191` | ✅ |
| M3 | `src/domain/guess-email.ts:33` | sem sufixo em colisão | `guess-email.test.ts:29`, `import-mappings-placeholders.test.ts:130` | ✅ |
| M4 | `src/infra/db/repos/mapping-repositories.ts:98` | contas e vínculos gravados um a um, fora de `runAtomically` | `mapping-repositories.test.ts:89,113` | ✅ |
| M5 | `src/application/import-mappings.ts:266` | nunca reaproveita fantasma (duplica) | `import-mappings-placeholders.test.ts:163` | ✅ |
| M6 | `src/application/import-mappings.ts:154` | `defaultAction` "fantasma" → "sugestao" | `import-mappings-placeholders.test.ts:54`, `import-actions.test.ts:300` | ✅ |
| M7 | `src/infra/db/repos/import-repository.ts:454` | `setResponsibles` sem filtro `status = 'ativa'` | `import-repository.test.ts:122`, `import-version.test.ts:1687` | ✅ |
| M8 | `src/infra/db/repos/import-repository.ts:455-456` | `setResponsibles` sem intervalo do semestre | `import-repository.test.ts:143` | ✅ |
| M9 | `src/application/import-apply.ts:422` | ignora hash diferente | `import-version.test.ts:1666`, `import-actions.test.ts:376` | ✅ |
| M10 | `src/application/bookings.ts:213` | `peopleFor` carrega pessoas para visitante | nenhum | ⚪ Equivalente na saída: `toItem` (`bookings.ts:171`) também zera `person` para visitante |
| M10b | `src/application/bookings.ts:171` + `:213` | remove as duas barreiras (vazamento real) | 4 (`bookings.test.ts:545` e três pré-existentes) | ✅ |
| M11 | `src/components/agenda/agenda-blocks.tsx:190` | cartão baixo mostra avatar mesmo sem pessoa (`ev.person?.name ?? ev.title`) | nenhum | ❌ Survived |
| M12 | `src/components/agenda/agenda-blocks.tsx:190` | cartão baixo sem avatar | `agenda-person.test.tsx:52,66` | ✅ |
| M13 | `src/infra/db/repos/user-repository.ts:135` | fusão não move vínculos do XML | `user-repository.test.ts:96`, `admin-actions.test.ts:396` | ✅ |
| M14 | `src/infra/db/repos/user-repository.ts:123` | fusão executa as 5 instruções uma a uma, sem `runAtomically` | nenhum | ❌ Survived |
| M15 | `src/application/users.ts:204` | `emailTaken` sempre falso (aceita e-mail em uso) | `admin-actions.test.ts:381`, `users.test.ts:657` | ✅ |
| M16 | `src/application/users.ts:235` | serviço aceita alvo fantasma (só a guarda SQL sobra) | `admin-actions.test.ts:410`, `users.test.ts:699` | ✅ |
| M17 | `src/server/import-prepare.ts:38` | rota não recusa sem papel antes de ler o corpo | `import-prepare.test.ts:186` (e 2 do preparo) | ✅ |
| M18 | `src/server/import-actions.ts:177` | ação `refreshResponsibles` sem `asImporter` | `import-actions.test.ts:128` | ✅ |
| M19 | `src/infra/db/repos/import-repository.ts:472` | conta e regrava o que não mudou | `import-repository.test.ts:162`, `import-version.test.ts:1687,1719`, `import-actions.test.ts:355` | ✅ |

**Sensor depth**: P0/expandido (auth, privacidade e integridade de dados), 20 execuções manuais.
**Result**: 17 mortos, 2 sobreviventes não equivalentes (M11, M14), 1 equivalente (M10). FAIL ❌

Nota de método: a primeira execução de M5 e M10 rodou antes de a edição chegar ao disco e deu falso "sobrevivente"; ambas foram refeitas com a conferência de disco (M5 morto; M10 segue sobrevivente e foi confirmado equivalente pela leitura de `bookings.ts:171`).

---

## Segurança

| Ponto | Achado |
| ----- | ------ |
| Rota `/api/import-responsibles` (`src/routes/api/import-responsibles.ts`, `src/server/import-prepare.ts:27-56`) | Sessão e papel (`IMPORT_ROLES`) checados por `requireRole` antes de ler o corpo (teste `import-prepare.test.ts:186`, M17 morto); papel checado de novo por `asImporter` (M18 morto); `Content-Length` e leitura em fluxo limitados a 10 MB (`MAX_XML_BYTES`), igual ao preparo; resposta `Cache-Control: no-store`; erro inesperado vira mensagem genérica e o log só leva `error.name`. OK |
| CSRF/origem | Não há checagem na rota, mas o padrão do projeto é global: `src/start.ts:29` (`csrfRejection` para todo POST/PUT/PATCH/DELETE, inclusive rotas de servidor) e `src/start.ts:47` (`createCsrfMiddleware` do Start). A rota nova herda as duas camadas, como `/api/import-prepare`. OK |
| Hash único por envio (`src/application/import-mappings.ts:272`) | Todas as fantasmas de um envio recebem o mesmo scrypt de 32 bytes aleatórios descartados. Sem risco real: a senha não é conhecida por ninguém (256 bits, descartada), o login recusa `placeholder` antes de qualquer sessão (`auth.ts:104`), a ativação sempre grava hash novo (`users.ts:208`) e a fusão apaga a conta. O que vaza, para quem já lê o banco, é só que as contas nasceram no mesmo envio. Redefinir a senha de uma fantasma pela tela atual não a ativa (a marca continua e o login segue recusado). |
| Privacidade do visitante | `person` é zerado em duas camadas (`bookings.ts:171` e `:213`); remover ambas é detectado (M10b). A prévia do XML, que agora leva o nome, só é servida a admin/horários. |
| Mesma falha para fantasma | Mesmo `reason: "invalid"`, mesmo número de `verify` e tentativa registrada como falha (conta para o bloqueio igual à senha errada). OK |

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (refatorações pequenas e justificadas: `upsertTeacher`, `handleXmlPost`, `isValidCode` movido para o domínio) |
| No scope creep | ✅ |
| Matches patterns | ✅ (`runAtomically`, `asRoles`, `fromResult`, rotas de API do preparo) |
| Spec-anchored outcome check | ✅ exceto os dois gaps acima |
| Per-layer Coverage Expectation | ✅ domínio 1:1; rotas com 401/403/400/feliz; repositórios com atomicidade, exceto `mergeInto` (M14) |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | `AGENTS.md`, `package.json` (`check`), `bunfig.toml` (cobertura ≥ 90%) ✅ |

---

## Gate Check

- **Gate command**: `bun run check` (log em `C:\Users\luiss\tcc\tmp\verify-doc.log`)
- **Result**: biome (291 arquivos, sem correções), `tsc --noEmit`, knip, depcruise (sem violações), `bun test --coverage` 1164 pass / 0 fail / 2 skip, betterleaks sem vazamentos; saída 0
- **Test count before feature** (`6181b01`): 1081 (1079 pass, 2 skip)
- **Test count after feature**: 1166 (1164 pass, 2 skip)
- **Delta**: +85 testes
- **Skipped tests**: "arquivo real de data/real" (nenhum XML real no repositório) e "reservas no D1 local" (exige D1 local); ambos pré-existentes
- **Assertions alteradas**: as listas de segredos em `normalize.test.ts`, `preview.test.ts` e `import-preview*.test.ts` perderam "Fulano/Testador/Beltrana"; justificado pela AD-001, e e-mail, celular e cor seguem verificados
- **Migração `drizzle/0008_faithful_dark_beast.sql`**: uma instrução, ``ALTER TABLE `users` ADD `placeholder` integer DEFAULT false NOT NULL;``. Aditiva, com default; aplicada sobre 0000-0007 com uma conta existente em bun:sqlite 3.53.2 (conta antiga lê `placeholder = 0`, linha nova recebe 0) e aplicada com `wrangler d1 migrations apply DB --local` (0000-0008 ✅). D1 remoto não foi tocado.

---

## Fix Plans

### Fix 1: provar que a fusão é atômica (M14)

- **Root cause**: `src/infra/db/repos/user-repository.ts:123` usa `runAtomically`, mas nenhum teste força falha no meio da fusão; trocar por execução sequencial passa em todos os testes.
- **Fix task**: em `src/infra/db/repos/user-repository.test.ts`, provocar falha numa instrução posterior à primeira (por exemplo um gatilho SQLite `BEFORE DELETE ON users ... RAISE(ABORT)` só no teste, ou uma FK que impeça apagar a fantasma) e afirmar que `snapshot()` é igual ao de antes: ocupações, vínculos e sessões continuam na fantasma.
- **Done when**: o teste falha com M14 aplicado e passa no código atual.
- **Priority**: Major (integridade de dados; DOC-11)

### Fix 2: visitante sem nenhum avatar no cartão (M11)

- **Root cause**: `test/components/agenda-person.test.tsx:101` e `:114` só procuram as iniciais "FL" e o nome; um avatar genérico renderizado para visitante não é detectado.
- **Fix task**: nos dois testes de visitante, afirmar que o cartão não tem nenhum avatar (por exemplo `card.querySelector("span.rounded-full[aria-hidden='true']")` nulo) ou que `card.textContent` é exatamente título + horário + etiqueta.
- **Done when**: o teste falha com M11 aplicado e passa no código atual.
- **Priority**: Minor (o dado pessoal já não chega ao visitante; falta a garantia visual da spec; DOC-06)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| DOC-01 | Done | ✅ Verified |
| DOC-02 | Done | ✅ Verified |
| DOC-03 | Done | ✅ Verified |
| DOC-04 | Done | ✅ Verified |
| DOC-05 | Done | ✅ Verified |
| DOC-06 | Done | ❌ Needs Fix (M11) |
| DOC-07 | Done | ✅ Verified |
| DOC-08 | Done | ✅ Verified |
| DOC-09 | Done | ✅ Verified |
| DOC-10 | Done | ✅ Verified |
| DOC-11 | Done | ❌ Needs Fix (M14) |

---

## Lacunas ranqueadas

1. **Fusão sem prova de atomicidade** - P2 AC4 / DOC-11 - `src/infra/db/repos/user-repository.ts:123` (M14 sobreviveu).
2. **Visitante: teste não exclui qualquer avatar** - P1 Avatar AC3 / DOC-06 - `test/components/agenda-person.test.tsx:101,114` (M11 sobreviveu).
3. **Informativo: "visitante nem dispara a consulta" não é testado** - `src/application/bookings.ts:211-213` (M10 equivalente na saída; só custo de consulta).
4. **Informativo: `saveWithPlaceholders` grava tudo num único `batch`** (`mapping-repositories.ts:98`): com 500 docentes seriam até 1000 instruções num lote do D1. [PENDENTE: confirmar o limite de instruções por `batch` do D1 em produção; o XML real tem 45 docentes, cerca de 90 instruções.]

---

## Summary

**Overall**: ❌ Not Ready (só por força de testes; o comportamento conferido está correto)

**Spec-anchored check**: 21/23 critérios com evidência alinhada à spec; 2 gaps; 0 spec-precision gaps
**Sensor**: 17/19 mutantes não equivalentes mortos (M10 equivalente)
**Gate**: 1164 passed, 0 failed, 2 skipped

**What works**: privacidade do DTO, login recusado para fantasma com a mesma falha e custo, e-mail presumido, gravação atômica de fantasmas e vínculos, reimportação sem duplicar, "Atualizar responsáveis" (hash, filtros, idempotência, 403), ativar e fundir (regras e resultado), migração aditiva.

**Next steps**: executar Fix 1 e Fix 2 e chamar o Verifier de novo.

## Correção após a verificação (orquestrador, sem nova rodada independente)

- DOC-11 (M14): `user-repository.test.ts` ganhou "falha na última instrução desfaz responsáveis, vínculos e sessões já movidos"; um trigger `BEFORE DELETE ON users` aborta a fusão e o estado fica igual ao anterior. M14 reaplicado: 1 fail.
- DOC-06 (M11): `Avatar` passou a ter `data-slot="avatar"`; os dois testes de visitante afirmam que não há nenhum avatar no cartão e o de fantasma afirma que há. As asserções comparam com `null` em booleano para a falha não despejar o DOM inteiro. M11 reaplicado: 2 fail.
- `docs/specs/lessons.json` excluído do biome, como no ramo `feat/todas-as-salas`, para as lições entrarem no Git.
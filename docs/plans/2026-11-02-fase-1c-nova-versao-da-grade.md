# Fase 1c: nova versão da grade (comparar e aplicar mudanças)

**Goal:** Ao importar um XML alterado para um semestre que já tem grade aplicada, mostrar inclusões, alterações e remoções antes de aplicar, e aplicar só as mudanças, preservando reservas avulsas e cancelamentos anteriores (regras 5 e 6 do design).

**Architecture:** Diff puro em `src/domain/version-diff.ts`; orquestração em `src/application/import-apply.ts` (mesmo fluxo em passos, CAS e impressão digital da 1b); UI na etapa de conferência existente.

**Spec:** `docs/specs/2026-11-01-reserva-espacos-design.md` (regras 4, 5, 6; §7.3)

## Global Constraints

- **Identidade da ocorrência entre versões (decisão de desenho):** os ids do aSc não são confirmados como estáveis entre exportações, então a comparação usa uma chave natural: `lessonKey` = título normalizado (sigla da disciplina + siglas das turmas ordenadas, o mesmo `title` já gravado) e a `date`. Para cada par `(lessonKey, date)` comparam-se os multiconjuntos de `(spaceId, startsAt, endsAt)` da versão vigente com os da nova versão.
- Classificação por par: iguais → `inalterada`; ambos existem e diferem → `alteracao` (ocupações antigas que sumiram são canceladas, as novas inseridas); só na vigente → `remocao`; só na nova → `inclusao`. Mudança apenas de responsável → `alteracao_responsavel` (atualiza a ocupação existente, sem cancelar).
- "Versão vigente" de um semestre = ocupações `source = "import"` do semestre (ativas **e** canceladas) dos lotes `aplicado`; o novo lote registra `supersedes_batch_id` (o último aplicado) apenas para rastreio.
- **Cancelamentos preservados:** ocorrência que estava `cancelada` e continua igual na nova versão permanece cancelada e é reportada como `mantida_cancelada`; nunca é recriada nem reativada.
- **Reservas avulsas (`source = "manual"`) nunca são alteradas.** Conflito de uma inclusão/alteração com reserva avulsa ou com outra ocupação ativa que não está sendo removida/alterada na mesma versão → `conflito` (não inserida), como na 1b.
- Remoções e alterações cancelam (status `cancelada`, `cancel_reason = "nova_versao"`, `cancelled_at`), nunca apagam.
- Responsáveis afetados (ocupações canceladas/alteradas com `responsible_user_id`) ficam listados no lote para comunicação futura (regra 4); nenhum envio nesta fase.
- Tudo em passos limitados, transições CAS e impressão digital do plano, nos dois alvos (sem `db.transaction` fora de infra).
- Reimportar o arquivo **idêntico** continua reconhecido pelo hash (sem diff).

## Review Focus

1. Cancelamento manual anterior não volta a ficar ativo depois de uma nova versão igual.
2. Aula movida de sala: a sala antiga fica livre (cancelada) e a nova ocupada; nenhum conflito consigo mesma.
3. Reserva avulsa que cai no horário de uma inclusão: inclusão vira conflito, reserva intacta.
4. Interrupção no meio da aplicação: retomar não duplica nem cancela em dobro.
5. Dois títulos iguais na mesma data (turmas divididas): multiconjunto compara contagens corretamente.

---

### Task 1: Diff puro de versões

**Files:** `src/domain/version-diff.ts` (+test).

**Interfaces:**
- `type VersionOccurrence = { lessonKey: string; date: string; spaceId: string; startsAt: string; endsAt: string; responsibleUserId: string | null; occupationId?: string; status?: "ativa" | "cancelada" }`.
- `diffVersions(current: VersionOccurrence[], next: VersionOccurrence[]) → { unchanged: Pair[]; keptCancelled: Pair[]; responsibleChanged: Pair[]; changed: Array<{ lessonKey; date; cancel: VersionOccurrence[]; insert: VersionOccurrence[] }>; removed: VersionOccurrence[]; added: VersionOccurrence[] }`.
- [ ] TDD com casos: igual; cancelada igual → keptCancelled; mudança de sala; mudança de horário; só responsável; removida; incluída; multiconjunto (2 iguais vs 1); ordem de entrada irrelevante (saída determinística).
- [ ] `bun run check` verde. Commit.

### Task 2: Preparar e aplicar nova versão

**Files:** schema/migração (`occupations.cancel_reason`, `occupations.cancelled_at`, `import_batches.supersedes_batch_id`, novos status de `import_rows`: `inalterada`, `mantida_cancelada`, `inclusao`… conforme desenho), `src/application/import-apply.ts`, `import-plan.ts`, repositório, testes de fluxo em `src/infra/db/flow/`.

- [ ] `prepare` detecta versão vigente do semestre; se houver, monta o plano da nova versão e roda `diffVersions`; linhas do lote passam a representar a mudança (inclusão, alteração com cancelar/inserir, remoção, inalterada, mantida_cancelada, alteração de responsável, não aplicável e conflitos).
- [ ] `apply` executa em passos: cancela (CAS: só se ainda `ativa`), insere com o mesmo `INSERT…WHERE NOT EXISTS` (ignorando ocupações que este lote cancela), atualiza responsável; idempotente e retomável; lista de responsáveis afetados no resumo.
- [ ] Testes cobrindo os 5 itens do Review Focus nos dois caminhos (bun-sqlite; D1 via dev:cf manual).
- [ ] `bun run check` verde. Commits.

### Task 3: Conferência da nova versão na tela

**Files:** componentes de conferência/resultado em `src/components/import/`, `describeReason`/rótulos de status.

- [ ] Na conferência, quando houver versão vigente: resumo "X inclusões, Y alterações, Z remoções, W inalteradas, K canceladas mantidas" e tabelas filtráveis por tipo (antes → depois para alterações); lista de responsáveis afetados; confirmação explícita "Aplicar mudanças". Remover o aviso provisório da 1b.
- [ ] Resultado por linha e lista de lotes mostram os novos estados com rótulo + cor.
- [ ] Verificação manual em `dev` com duas versões sintéticas e com o XML real + uma cópia alterada (mover uma aula, remover outra, incluir outra), e uma ocorrência cancelada antes. README atualizado.
- [ ] `bun run check` verde. Commit.

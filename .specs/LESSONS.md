# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Teste o loaderDeps da rota para que parâmetros de URL só de cliente não disparem nova carga no servidor
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: todas-as-salas
- evidence: M13 src/routes/salas.tsx:119 (routes)
- last seen: 2026-11-04T17:07:01Z

### L-002 - Todo AC que proíbe chamada ao servidor precisa de um teste que conte as chamadas na rota real
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: todas-as-salas
- evidence: SALAS-09 Livres AC2 (routes)
- last seen: 2026-11-04T17:07:01Z

### L-003 - Quando a spec exige elementos fixos numa grade rolável, afirme as classes sticky e o deslocamento de cada um
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: todas-as-salas
- evidence: M26 M27 src/components/rooms/rooms-columns.tsx:59 (components)
- last seen: 2026-11-04T17:07:01Z

### L-004 - Contadores na spec usam o total dinâmico N, nunca um número fixo do cadastro atual
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: todas-as-salas
- evidence: spec.md Filtros AC6 (specs)
- last seen: 2026-11-04T17:07:01Z

### L-005 - AC de layout responsivo deve dizer como será verificado, porque o happy-dom não mede rolagem
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: todas-as-salas
- evidence: spec.md Colunas AC4 (specs) (+1 more)
- last seen: 2026-11-04T17:24:57Z

### L-006 - Teste que o loader da rota repassa as deps à busca de dados, não só o retorno de loaderDeps
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: todas-as-salas
- evidence: N1 src/routes/salas.tsx:121 (routes)
- last seen: 2026-11-04T17:24:56Z

### L-007 - Quando a spec define o que um contador conta em cada visão, afirme o contador em cada visão
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: todas-as-salas
- evidence: N5 src/components/rooms/rooms-view.tsx:146 (components)
- last seen: 2026-11-04T17:24:56Z

### L-008 - Elemento sticky numa grade rolável só fica fixo se a grade tiver a largura do conteúdo; confira no navegador rolando até o fim, porque a classe sticky não prova o efeito
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: todas-as-salas
- evidence: SALAS-03 Colunas AC4 src/components/rooms/rooms-columns.tsx:47 (components)
- last seen: 2026-11-04T17:24:57Z

### L-009 - Regras de horário na spec devem dizer o que acontece perto da meia-noite
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: todas-as-salas
- evidence: spec.md:31 janela padrão; src/domain/room-filter.test.ts:200 (specs)
- last seen: 2026-11-04T17:24:57Z

### L-010 - Ao testar um loader, substitua a busca de dados e afirme o argumento que ela recebe; o valor derivado no retorno não prova o que foi pedido ao servidor
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: todas-as-salas
- evidence: V1 V1b src/routes/salas.tsx:121 (routes)
- last seen: 2026-11-04T17:43:22Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

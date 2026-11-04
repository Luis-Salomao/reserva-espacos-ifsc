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
- evidence: spec.md Colunas AC4 (specs)
- last seen: 2026-11-04T17:07:02Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

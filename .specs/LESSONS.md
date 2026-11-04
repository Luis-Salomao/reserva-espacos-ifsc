# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-005 - AC de layout responsivo deve dizer como será verificado, porque o happy-dom não mede rolagem
- signal: `spec_precision_gap` · recurrence: 2 feature(s) · scope: `specs` · harmful: 0
- features: todas-as-salas, admin-espacos
- evidence: spec.md Colunas AC4 (specs) (+2 more)
- last seen: 2026-11-04T20:53:47Z

### L-011 - Toda gravação atômica de várias instruções precisa de um teste que force falha numa instrução posterior e afirme que nada foi gravado
- signal: `surviving_mutant` · recurrence: 2 feature(s) · scope: `repo-layer` · harmful: 0
- features: docentes-do-xml, admin-espacos
- evidence: validation.md M14 src/infra/db/repos/user-repository.ts:123 (repo-layer) (repo-layer) (+2 more)
- last seen: 2026-11-04T21:54:25Z

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

### L-012 - Teste de ausência na interface deve afirmar que o elemento não existe, não só que um texto específico não aparece
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: docentes-do-xml
- evidence: validation.md M11 test/components/agenda-person.test.tsx:101 (components) (components)
- last seen: 2026-11-04T18:17:21Z

### L-013 - Quando a spec diz que omitir um campo mantém o valor gravado, teste a omissão na camada que monta o pedido, não só no repositório
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `server-actions` · harmful: 0
- features: admin-espacos
- evidence: validation.md M19 src/server/admin-actions.ts:112 (server-actions)
- last seen: 2026-11-04T20:53:46Z

### L-014 - Teste de erro de formulário deve corrigir e salvar de novo, provando que o botão de salvar volta a ficar habilitado
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: admin-espacos
- evidence: validation.md M24 src/components/admin/space-form-dialog.tsx:106 (components)
- last seen: 2026-11-04T20:53:46Z

### L-015 - Quando a spec manda recarregar a lista depois de gravar, afirme a nova carga, não só o anúncio
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: admin-espacos
- evidence: validation.md M25 src/components/admin/spaces-manager.tsx:35 (components)
- last seen: 2026-11-04T20:53:46Z

### L-016 - Teste de ordem natural precisa de nomes no mesmo grupo cuja ordem lexical difere da natural
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `domain` · harmful: 0
- features: admin-espacos
- evidence: validation.md M10 src/domain/space-groups.ts:42 (domain)
- last seen: 2026-11-04T20:53:47Z

### L-017 - Confira o layout de 360 px com texto longo sem espaço, porque break-words não reduz a largura mínima de itens de grade ou flex
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: admin-espacos
- evidence: ESPACOS-04 AC9 src/components/admin/spaces-manager.tsx:89 (components)
- last seen: 2026-11-04T20:53:47Z

### L-018 - Matriz de autorização deve afirmar a mensagem de 401 e 403, não só o status
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `server-actions` · harmful: 0
- features: admin-espacos
- evidence: ESPACOS-11 AC1 AC2 src/server/admin-actions.test.ts:173 (server-actions)
- last seen: 2026-11-04T20:53:47Z

### L-019 - Spec de edição parcial deve dizer o que acontece com cada campo omitido isoladamente, não só com todos omitidos
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: admin-espacos
- evidence: spec.md Equipamentos AC10 src/server/admin-actions.test.ts:484 (specs)
- last seen: 2026-11-04T20:53:47Z

### L-020 - Exemplo de ordenação na spec deve cair no mesmo grupo para exercitar a regra
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: admin-espacos
- evidence: spec.md Ver os espaços AC1 src/domain/space-groups.test.ts:63 (specs)
- last seen: 2026-11-04T20:53:47Z

### L-021 - Ligação de nova tentativa no errorComponent da rota não tem teste de componente; confira no navegador forçando falha do loader e veja a nova carga
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: admin-espacos
- evidence: validation.md N18 src/routes/admin.espacos.tsx:48 (routes)
- last seen: 2026-11-04T21:54:25Z

### L-022 - Afirme o resultado logo depois da interação testada; uma ação extra antes da asserção pode refazer o estado e esconder a falha
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: visao-geral
- evidence: validation.md M20 test/components/rooms-overview.test.tsx:341 (components) (components)
- last seen: 2026-11-04T22:02:13Z

### L-023 - Quando a spec define a ordem entre seções da tela, afirme a posição delas no DOM, não só o conteúdo de cada uma
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: visao-geral
- evidence: validation.md M30 test/components/rooms-overview.test.tsx:352 (components) (components)
- last seen: 2026-11-04T22:02:14Z

### L-024 - Atalho de teclado oferecido pela tela precisa de AC na spec e de um teste que pressione a tecla e afirme o efeito
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components` · harmful: 0
- features: visao-geral
- evidence: validation.md M21 M22 src/components/rooms/rooms-overview.tsx:96 (components) (components)
- last seen: 2026-11-04T22:02:14Z

### L-025 - Regras de horário passado devem dizer o que acontece com o trecho em andamento, não só com o já terminado
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: visao-geral
- evidence: validation.md M27 GERAL-13 AC6 src/components/rooms/overview-selection.tsx:78 (specs) (specs)
- last seen: 2026-11-04T22:02:14Z

### L-026 - Quando uma tarefa muda um comportamento já especificado, reescreva o AC antigo na spec na mesma tarefa
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: visao-geral
- evidence: spec.md:146 GERAL-10 AC1 AC3 x GERAL-13 AC2; spec.md:114 GERAL-08 AC2 (specs) (specs)
- last seen: 2026-11-04T22:02:14Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_

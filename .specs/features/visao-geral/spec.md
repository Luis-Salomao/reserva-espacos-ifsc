# Visão geral (salas × semana): especificação

## Problem Statement

Hoje dá para ver uma sala na semana ou todas as salas num dia, mas não a semana inteira de todas as salas. Quem organiza horários quer bater o olho e ver onde cada matéria acontece e onde sobram buracos. Uma grade compacta, com um quadradinho colorido por matéria em cada bloco de horário, responde isso numa tela.

## Goals

- [ ] Ver a semana (segunda a sexta) de todas as salas numa tela, sem rolagem vertical em 1280 × 800 para 21 salas.
- [ ] Reconhecer cada matéria pela cor e destacar uma matéria com um clique.
- [ ] Manter a tela limpa: filtros pouco usados ficam recolhidos.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Mês inteiro ou duas semanas | O usuário escolheu uma semana. |
| Cor por professor | O usuário escolheu cor por matéria. |
| Arrastar aulas para outra sala | Remanejar grade é outra feature. |
| Reservar várias salas ou várias datas de uma vez | Uma reserva por vez nesta tela. Várias datas ficam para a feature de reserva recorrente (próxima, depois do checkpoint desta), uma sala por recorrência. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Onde fica | Terceira visão em `/salas` ("Colunas", "Livres", "Visão geral") | Reaproveita rota, dados de salas e URL | n |
| Célula | Um bloco de horário do semestre num dia, numa sala | Escolha do usuário; blocos vêm de `semester_blocks` | y |
| Período | Segunda a sexta da semana da data escolhida, com setas de semana | Escolha do usuário | y |
| Cor | Cor estável derivada da matéria (parte do título antes de " — "), numa paleta acessível; reservas avulsas têm cor neutra própria | O título importado é `MATÉRIA — TURMA`; mesma ideia do `avatarTone` | y |
| Aula que cobre parte do bloco | Pinta o bloco inteiro e marca com canto recortado | O quadradinho é a unidade; o detalhe mostra o horário real | n |
| Mais de uma ocupação no mesmo bloco | Divide o quadradinho em faixas, uma por ocupação | Raro, mas não pode sumir | n |
| Filtros | Recolhidos por padrão atrás de um botão "Filtros"; visível sempre só a semana e a busca de sala | Pedido do usuário: o que nem sempre é usado não aparece sempre | y |
| Animação | Ao passar o mouse ou focar, o quadradinho cresce (scale 1.6, 120 ms) e abre um cartão com detalhes; sem animação com `prefers-reduced-motion` | Pedido do usuário, com respeito à acessibilidade | n |
| Celular | Abaixo de 768 px mostra um dia por vez (salas × blocos), com troca de dia por abas | Semana inteira não cabe em 360 px | n |
| Fora de semestre | Sem blocos: mostra "Esta semana não tem blocos de horário" e sugere a visão "Colunas" | Sem blocos não há grade | n |
| Reservar pelo quadradinho | Quadradinho livre abre a reserva com sala, dia e horário do bloco; a sala continua editável | Pedido do usuário em 2026-11-04 | y |
| Página única | Agenda e salas viram uma página (`/`) com as visualizações "Sala", "Colunas", "Livres" e "Visão geral"; `/salas` redireciona | Pedido do usuário: "não faz sentido serem lugares diferentes" | y |
| Visualização padrão | "Sala" (a agenda de uma sala), em qualquer largura | Escolha do usuário | y |
| Livres primeiro | Na visão "Livres" e na escolha de sala da reserva, livres primeiro e depois as ocupadas com o motivo (o que ocupa e o horário) | Pedido do usuário | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Grade da semana por sala e bloco ⭐ MVP

**User Story**: Como responsável por horários, quero ver todas as salas na semana, bloco a bloco, para enxergar a ocupação geral de uma vez.

**Why P1**: É a visão pedida.

**Acceptance Criteria**:

1. WHEN o usuário abre `/salas?visao=geral&data=AAAA-MM-DD` THEN o sistema SHALL mostrar uma linha por sala e, para cada dia de segunda a sexta daquela semana, uma coluna por bloco do semestre.
2. WHEN um bloco tem ocupação THEN o sistema SHALL pintar o quadradinho com a cor da matéria da ocupação.
3. WHEN um bloco está livre THEN o sistema SHALL mostrar o quadradinho vazio, só com contorno.
4. IF mais de uma ocupação cruza o mesmo bloco THEN o sistema SHALL dividir o quadradinho em faixas, uma por ocupação.
5. WHEN o usuário usa as setas de semana THEN o sistema SHALL carregar a semana anterior ou seguinte numa única chamada ao servidor e atualizar a URL.
6. THE sistema SHALL caber sem rolagem vertical em 1280 × 800 com 21 salas.
7. IF a semana não tiver blocos de horário THEN o sistema SHALL mostrar "Esta semana não tem blocos de horário" e um atalho para a visão "Colunas".

**Independent Test**: Abrir a visão geral na semana atual e ver 21 linhas × 5 dias de blocos, com as aulas coloridas.

---

### P1: Cor por matéria e destaque ⭐ MVP

**User Story**: Como usuário, quero reconhecer as matérias pela cor e destacar uma delas para ver onde ela acontece na semana.

**Why P1**: É o que torna a grade legível.

**Acceptance Criteria**:

1. THE sistema SHALL dar a mesma cor à mesma matéria em qualquer sala, dia ou semana.
2. THE sistema SHALL usar cores com contraste mínimo de 3:1 contra o fundo nos temas claro e escuro.
3. WHEN o usuário clica numa matéria da legenda THEN o sistema SHALL esmaecer todos os quadradinhos de outras matérias.
4. WHEN o usuário clica de novo na matéria destacada THEN o sistema SHALL remover o destaque.
5. WHERE a ocupação é uma reserva avulsa the sistema SHALL usar a cor neutra de "Reserva".

**Independent Test**: Clicar em uma matéria na legenda e ver só os quadradinhos dela em cor cheia.

---

### P1: Detalhe ao passar o mouse ⭐ MVP

**User Story**: Como usuário, quero passar o mouse num quadradinho e ver uma animação com os detalhes da aula, sem sair da grade.

**Why P1**: A célula é pequena demais para texto.

**Acceptance Criteria**:

1. WHEN o mouse para sobre um quadradinho ocupado ou ele recebe foco do teclado THEN o sistema SHALL aumentá-lo com animação de até 150 ms e abrir um cartão com matéria, turma, sala, dia e horário real.
2. WHILE o usuário estiver logado the sistema SHALL incluir no cartão o avatar e o nome do responsável.
3. WHILE o usuário for visitante the sistema SHALL NOT mostrar nome, iniciais nem avatar no cartão.
4. WHERE o sistema operacional pede movimento reduzido the sistema SHALL abrir o cartão sem animação de escala.
5. WHEN o usuário clica num quadradinho ocupado THEN o sistema SHALL abrir a visualização "Sala" daquela sala no dia do quadradinho, na mesma página.

**Independent Test**: Passar o mouse numa aula, ver o quadradinho crescer e o cartão com os dados; navegar com Tab e ver o mesmo cartão.

---

### P2: Filtros recolhidos

**User Story**: Como usuário, quero uma tela limpa, com os filtros pouco usados escondidos até eu precisar.

**Why P2**: Pedido de simplicidade; vale também para as visões "Colunas" e "Livres".

**Acceptance Criteria**:

1. THE sistema SHALL mostrar sempre visíveis apenas a navegação de data, a busca de sala e, na visão "Livres", a janela de horário (é a pergunta dessa visão).
2. WHEN o usuário abre "Filtros" THEN o sistema SHALL mostrar bloco, capacidade mínima e "Só livres".
3. WHILE houver filtro ativo escondido the sistema SHALL mostrar a contagem no botão ("Filtros · 2").
4. WHEN a visão "Colunas" ou "Livres" abre THEN o sistema SHALL seguir a mesma regra de filtros recolhidos.

**Independent Test**: Abrir `/salas` e ver só data e busca; abrir "Filtros" e ver o resto.

---

### P2: Um dia por vez no celular

**User Story**: Como usuário no celular, quero ver a grade de um dia por vez para os quadradinhos terem tamanho tocável.

**Why P2**: A semana inteira não cabe em 360 px.

**Acceptance Criteria**:

1. WHILE a largura da tela for menor que 768 px the sistema SHALL mostrar um dia por vez, com abas de segunda a sexta.
2. WHEN o usuário toca num quadradinho THEN o sistema SHALL abrir o cartão de detalhes em vez de navegar.
3. THE sistema SHALL ter alvos de toque de pelo menos 32 px na visão de um dia.

**Independent Test**: Em 360 px, trocar entre abas de dias e tocar numa aula para ver o cartão.

---

### P1: Reservar pelo quadradinho

**User Story**: Como docente, quero clicar num quadradinho livre e já reservar aquele bloco, escolhendo a sala na reserva.

**Why P1**: Pedido do usuário; a grade mostra os buracos, então reservar dali é o passo natural.

**Acceptance Criteria**:

1. WHEN quem pode reservar clica (ou toca, no celular) num quadradinho livre de um bloco que ainda não terminou THEN o sistema SHALL abrir a reserva com a sala, o dia e o horário do bloco preenchidos.
2. THE sistema SHALL deixar a sala editável na reserva aberta pelo quadradinho.
3. IF o visitante clica num quadradinho livre THEN o sistema SHALL mostrar o convite para entrar, sem abrir a reserva.
4. IF o bloco do quadradinho livre já terminou THEN o sistema SHALL NOT abrir a reserva.
5. WHEN a reserva é confirmada THEN o sistema SHALL recarregar a semana e pintar o bloco reservado.

**Independent Test**: Logado como docente, clicar num quadradinho livre de amanhã, ver a reserva com sala, dia e horário do bloco, trocar a sala e confirmar.

---

### P1: Uma página com todas as visualizações

**User Story**: Como usuário, quero agenda e salas no mesmo lugar, trocando só a visualização.

**Why P1**: Pedido do usuário: ver uma sala ou todas não deve exigir ir para outra página.

**Acceptance Criteria**:

1. THE sistema SHALL oferecer em `/` as visualizações "Sala", "Colunas", "Livres" e "Visão geral", trocadas por um seletor que atualiza `visao` na URL.
2. WHEN `/` abre sem `visao` THEN o sistema SHALL mostrar a visualização "Sala".
3. WHEN o usuário troca de visualização THEN o sistema SHALL manter a data e a sala escolhidas.
4. WHEN alguém abre `/salas` THEN o sistema SHALL redirecionar para `/` mantendo os parâmetros e, sem `visao`, usar "Colunas".
5. THE sistema SHALL NOT mostrar o item "Salas" no menu nem o link "Todas as salas" na barra da agenda; "Ver todas as salas" no seletor de sala SHALL trocar para "Colunas".
6. WHEN o usuário clica no nome de uma sala em "Colunas" ou "Livres" THEN o sistema SHALL abrir a visualização "Sala" dela no mesmo dia.

**Independent Test**: Abrir `/`, trocar entre as quatro visualizações e ver a URL e a data mantidas; abrir `/salas` e cair em `/?visao=colunas`.

---

### P1: Livres primeiro, ocupadas com o motivo

**User Story**: Como docente, quero ver primeiro as salas livres e depois as ocupadas com o motivo, para decidir rápido.

**Why P1**: Pedido do usuário.

**Acceptance Criteria**:

1. WHEN a visão "Livres" abre THEN o sistema SHALL listar primeiro as salas livres na janela e depois as ocupadas, separadas por um título "Ocupadas".
2. THE sistema SHALL mostrar em cada sala ocupada o motivo: título e horário de cada ocupação que cruza a janela (e "Horário já passou" quando for o caso).
3. WHEN a reserva abre THEN o sistema SHALL listar na escolha de sala primeiro as livres no dia e horário escolhidos e depois as ocupadas com o motivo, recalculando ao trocar data ou horário.
4. THE sistema SHALL impedir a escolha de uma sala ocupada na reserva.
5. WHILE o usuário for visitante the sistema SHALL NOT mostrar nomes de pessoas no motivo.

**Independent Test**: Na visão "Livres" das 14:00 às 16:00, ver as livres no topo e as ocupadas abaixo com "Cálculo I, 14:00–15:40"; abrir a reserva e ver a mesma ordem na escolha de sala.

---

### P1: Selecionar um horário na visão geral e ver o que está livre

**User Story**: Como professor, quero arrastar um trecho de horário num dia da visão geral e ver na hora quais salas estão livres, para escolher uma e reservar.

**Why P1**: Pedido do usuário: "arrasto o quadrado e mostra o que tá livre". Na agenda de uma sala a seleção fica presa à coluna; com várias salas, o horário vem primeiro e a sala depois.

**Acceptance Criteria**:

1. WHEN o usuário arrasta sobre quadradinhos de um mesmo dia THEN o sistema SHALL selecionar o trecho do início do primeiro bloco ao fim do último e destacar esses blocos em todas as salas.
2. WHEN o usuário clica num quadradinho livre THEN o sistema SHALL selecionar aquele bloco e sugerir a sala da linha.
3. WHEN um trecho é selecionado THEN o sistema SHALL abrir um painel com o dia e o horário, as salas livres primeiro e depois as ocupadas com o motivo (mesma regra da visão "Livres").
4. THE sistema SHALL permitir no painel filtrar por bloco e por andar e ajustar início e fim.
5. WHEN o usuário escolhe uma sala livre no painel THEN o sistema SHALL abrir a reserva com sala, dia e horário do trecho; visitante vê o convite para entrar.
6. IF o trecho já terminou THEN o sistema SHALL NOT oferecer reserva no painel.
7. WHILE a largura for menor que 768 px the sistema SHALL selecionar por toque um bloco por vez e permitir ajustar início e fim no painel.

**Independent Test**: Na visão geral, arrastar a tarde de quarta, ver 1 sala livre no topo do painel, filtrar por bloco e andar, escolher a livre e ver a reserva preenchida.

---

### P2: Filtro por andar

**User Story**: Como usuário, quero filtrar salas por andar, além de bloco.

**Why P2**: Pedido do usuário; o andar vem do código da sala (A-202 = bloco A, andar 2).

**Acceptance Criteria**:

1. THE sistema SHALL derivar o andar do primeiro dígito do código da sala (letra + três dígitos); sala sem código não tem andar.
2. WHEN o usuário escolhe um ou mais andares em "Filtros" THEN o sistema SHALL mostrar só as salas desses andares, em todas as visualizações de salas e no painel de seleção.
3. THE sistema SHALL guardar os andares escolhidos na URL (`andar`).

**Independent Test**: Escolher "Andar 2" e ver só salas como A-202 e B-210.

---

## Edge Cases

- IF uma ocupação começar antes do primeiro bloco ou terminar depois do último THEN o sistema SHALL pintar os blocos que ela cruza e mostrar o horário real no cartão.
- IF a matéria não puder ser extraída do título THEN o sistema SHALL usar o título inteiro para a cor.
- WHEN os filtros escondem todas as salas THEN o sistema SHALL mostrar "Nenhuma sala com esses filtros" e "Limpar filtros".

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| GERAL-01 | P1: Grade (AC 1, 3, 6) | T1, T2, T6, T9 | Verified |
| GERAL-02 | P1: Grade (AC 2, 4) | T1, T6 | Verified |
| GERAL-03 | P1: Grade (AC 5, 7) | T2, T3, T4, T9 | Verified |
| GERAL-04 | P1: Cor (AC 1, 2, 5) | T1, T6 | Verified |
| GERAL-05 | P1: Cor (AC 3, 4) | T7 | Verified |
| GERAL-06 | P1: Detalhe (AC 1, 4, 5) | T6, T8 | Verified |
| GERAL-07 | P1: Detalhe (AC 2, 3) | T2, T8 | Verified |
| GERAL-08 | P2: Filtros recolhidos (AC 1–4) | T5, T9 | Needs Fix |
| GERAL-09 | P2: Celular (AC 1–3) | T9 | Verified |
| GERAL-10 | P1: Reservar pelo quadradinho (AC 1–5) | T10 | Needs Fix |
| GERAL-11 | P1: Página única (AC 1–6) | T13, T14, T15 | Verified |
| GERAL-12 | P1: Livres primeiro (AC 1–5) | T11, T12 | Verified |
| GERAL-13 | P1: Selecionar horário (AC 1–7) | T17 | Needs Fix |
| GERAL-14 | P2: Filtro por andar (AC 1–3) | T16, T17 (painel) | Verified |

**Coverage:** 14 total, 14 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Achar todas as aulas de uma matéria na semana leva um clique na legenda.
- [ ] Visitante não recebe nome nem iniciais de pessoas em nenhuma resposta.

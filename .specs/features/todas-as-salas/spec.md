# Todas as salas: especificação

## Problem Statement

A agenda mostra uma sala por vez. Para achar uma sala livre, quem reserva precisa trocar de sala 21 vezes e comparar de cabeça. Falta uma visão que mostre todas as salas juntas e filtre por bloco, capacidade, nome e disponibilidade, inclusive no celular.

## Goals

- [ ] Encontrar uma sala livre para um horário em uma única tela, sem trocar de sala.
- [ ] Reservar direto dessa tela com o mesmo gesto de rascunho da agenda de uma sala.
- [ ] Funcionar no celular (largura de 360 px) sem rolagem horizontal da página.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Visão semanal de todas as salas | 21 salas × 5 dias não cabe legível; a visão é de um dia. |
| Cadastro de capacidade das salas | Já existe em Administração > Espaços; aqui só filtramos. |
| Recursos da sala (projetor, laboratório) | Não há esse dado no cadastro nem no XML. |
| Mapa 3D ou planta dos blocos | Fica para depois. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Onde fica a tela | Nova rota `/salas`, com item "Salas" na navegação e opção "Ver todas as salas" no seletor de sala da agenda | Não pesa a agenda de uma sala, que é o uso mais comum, e a URL pode ser compartilhada | n |
| Bloco da sala | Letra extraída do nome (`A-202` → Bloco A); nomes sem código vão para "Outros espaços" | O cadastro não tem campo de bloco; é a mesma regra do seletor em andamento em `room-selector.tsx` | n |
| Capacidade | Com capacidade mínima definida, salas sem capacidade cadastrada somem do resultado, e a tela avisa quantas foram escondidas por isso | Hoje nenhuma das 21 salas tem capacidade; esconder sem avisar pareceria erro | n |
| Janela de horário padrão | Próximo intervalo de 1 h a partir de agora, arredondado para 30 min, no dia escolhido | Pergunta mais comum: "o que está livre agora?" | n |
| Celular | Abaixo de 768 px a tela abre na visão "Livres"; a visão "Colunas" rola na horizontal dentro da grade, com o eixo de horas fixo | 21 colunas não cabem em 360 px; a lista é a forma útil no celular | n |
| Estado dos filtros | Todos os filtros e a visão ficam na URL | Voltar, recarregar e compartilhar mantêm o resultado | y |
| Visitante | Vê a tela e os filtros, sem nomes de pessoas e sem rascunho | Mesma regra da agenda atual | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Ver todas as salas lado a lado num dia ⭐ MVP

**User Story**: Como docente, quero ver as ocupações de todas as salas num mesmo dia, uma coluna por sala, para comparar a disponibilidade de uma vez.

**Why P1**: É a visão central do pedido; sem ela não há o que filtrar.

**Acceptance Criteria**:

1. WHEN o usuário abre `/salas?data=AAAA-MM-DD` THEN o sistema SHALL mostrar uma coluna por sala cadastrada, em ordem natural de nome (`A-202` antes de `A-1000`), com as ocupações daquele dia no mesmo eixo de horas.
2. WHEN o usuário troca o dia THEN o sistema SHALL buscar as ocupações de todas as salas numa única chamada ao servidor.
3. WHEN o usuário clica no nome de uma coluna THEN o sistema SHALL abrir a agenda daquela sala no mesmo dia (`/?espaco=ID&data=AAAA-MM-DD`).
4. WHILE a largura da tela for menor que 768 px, WHEN o usuário escolhe a visão "Colunas" THEN o sistema SHALL rolar a grade na horizontal com o eixo de horas e os nomes das salas fixos, sem rolagem horizontal da página.
5. THE sistema SHALL mostrar o nome do responsável apenas para quem está logado.
6. IF a data na URL for inválida THEN o sistema SHALL usar o dia de hoje.

**Independent Test**: Abrir `/salas` logado, ver 21 colunas com as aulas de hoje e clicar em "A-202" para ir à agenda dela.

---

### P1: Filtrar salas ⭐ MVP

**User Story**: Como docente, quero filtrar as salas por bloco, capacidade mínima, nome e disponibilidade para ver só as que me servem.

**Why P1**: Sem filtro, 21 colunas são ruído; o usuário pediu os quatro filtros.

**Acceptance Criteria**:

1. WHEN o usuário escolhe um ou mais blocos THEN o sistema SHALL mostrar só as salas desses blocos.
2. WHEN o usuário define capacidade mínima N THEN o sistema SHALL mostrar só as salas com capacidade cadastrada maior ou igual a N.
3. WHEN a capacidade mínima esconde salas sem capacidade cadastrada THEN o sistema SHALL mostrar o aviso "X salas sem capacidade cadastrada ficaram de fora".
4. WHEN o usuário digita na busca THEN o sistema SHALL mostrar só as salas cujo nome contém o texto, sem diferenciar maiúsculas nem acentos.
5. WHEN o usuário liga "Só livres" THEN o sistema SHALL mostrar só as salas sem nenhuma ocupação que cruze a janela de horário escolhida.
6. WHEN qualquer filtro muda THEN o sistema SHALL refletir o filtro na URL e mostrar "X de 21 salas".
7. IF nenhuma sala passar nos filtros THEN o sistema SHALL mostrar "Nenhuma sala com esses filtros" e um botão "Limpar filtros".
8. WHILE a largura da tela for menor que 768 px the sistema SHALL agrupar os filtros num botão "Filtros" com contador dos filtros ativos.

**Independent Test**: Filtrar Bloco A + "Só livres" 14:00–16:00 e conferir que só aparecem salas do bloco A sem aula nesse intervalo.

---

### P1: Listar salas livres num horário ⭐ MVP

**User Story**: Como docente, quero informar dia e horário e ver a lista de salas livres para reservar rápido, principalmente no celular.

**Why P1**: É a pergunta mais comum e a forma que funciona no celular.

**Acceptance Criteria**:

1. WHEN o usuário abre a visão "Livres" THEN o sistema SHALL listar as salas que passam nos filtros e estão inteiramente livres na janela escolhida, com nome, bloco e capacidade.
2. WHEN a janela de horário muda THEN o sistema SHALL recalcular a lista sem nova chamada ao servidor, enquanto o dia for o mesmo.
3. WHERE a janela cruza um horário passado de hoje the sistema SHALL tratar o trecho passado como indisponível, como a agenda atual.
4. IF o fim da janela for menor ou igual ao início THEN o sistema SHALL mostrar "O fim precisa ser depois do início" e manter a lista anterior.
5. WHILE a largura da tela for menor que 768 px the sistema SHALL abrir na visão "Livres" quando a URL não define a visão.

**Independent Test**: No celular, abrir `/salas`, escolher 14:00–16:00 e ver só salas livres nesse intervalo.

---

### P2: Reservar a partir de todas as salas

**User Story**: Como docente, quero criar a reserva direto da visão de todas as salas, com rascunho arrastável ou um toque na lista, sem precisar abrir a agenda da sala.

**Why P2**: Fecha o fluxo, mas a visão já é útil só para consultar.

**Acceptance Criteria**:

1. WHEN o usuário arrasta num horário livre de uma coluna THEN o sistema SHALL criar um rascunho naquela sala, com o mesmo comportamento da agenda de uma sala (mover, redimensionar, Esc descarta).
2. WHEN o usuário clica no rascunho THEN o sistema SHALL abrir "Nova reserva" com a sala, a data e o horário do rascunho.
3. WHEN o usuário toca em "Reservar" numa sala da lista "Livres" THEN o sistema SHALL abrir "Nova reserva" com a sala, a data e a janela escolhida.
4. WHEN a reserva é criada THEN o sistema SHALL atualizar a coluna ou a lista sem recarregar a página.
5. IF o usuário não pode reservar (visitante ou sem papel docente) THEN o sistema SHALL esconder o rascunho e o botão "Reservar".
6. THE sistema SHALL manter no máximo um rascunho por vez em toda a tela.

**Independent Test**: Arrastar 14:00–15:30 na coluna B-104, clicar no rascunho e ver "Nova reserva" com B-104, data e horário certos.

---

## Edge Cases

- WHEN não há salas cadastradas THEN o sistema SHALL mostrar "Nenhuma sala cadastrada" e o atalho para Administração > Espaços para admins.
- IF a chamada ao servidor falhar THEN o sistema SHALL manter os filtros e mostrar "Não foi possível carregar as salas" com "Tentar de novo".
- WHEN o dia escolhido estiver fora de qualquer semestre THEN o sistema SHALL mostrar as reservas avulsas desse dia sem a grade de blocos.
- IF a URL tiver um bloco que não existe THEN o sistema SHALL ignorar esse bloco.
- IF a capacidade mínima da URL não for um inteiro entre 1 e 999 THEN o sistema SHALL ignorar o filtro de capacidade.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SALAS-01 | P1: Colunas por sala (AC 1, 2) | - | Implemented |
| SALAS-02 | P1: Colunas por sala (AC 3) | - | Implemented |
| SALAS-03 | P1: Colunas por sala (AC 4, 5, 6) | - | Implemented |
| SALAS-04 | P1: Filtros (AC 1, 6) | - | Implemented |
| SALAS-05 | P1: Filtros (AC 2, 3) | - | Implemented |
| SALAS-06 | P1: Filtros (AC 4) | - | Implemented |
| SALAS-07 | P1: Filtros (AC 5, 7) | - | Implemented |
| SALAS-08 | P1: Filtros (AC 8) | - | Implemented |
| SALAS-09 | P1: Livres (AC 1, 2, 3, 4) | - | Implemented |
| SALAS-10 | P1: Livres (AC 5) | - | Implemented |
| SALAS-11 | P2: Reservar (AC 1, 2, 6) | - | Implemented |
| SALAS-12 | P2: Reservar (AC 3, 4, 5) | - | Implemented |

**Coverage:** 12 total, 0 mapped to tasks, 12 unmapped ⚠️

---

## Success Criteria

- [ ] Achar uma sala livre para 14:00–16:00 leva no máximo 3 interações a partir de `/salas`.
- [ ] Em 360 px de largura a página não rola na horizontal em nenhuma das duas visões.
- [ ] Visitante nunca recebe nome nem iniciais de pessoas na resposta do servidor.

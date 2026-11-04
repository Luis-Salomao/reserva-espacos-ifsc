# Matéria na reserva: especificação

## Problem Statement

Na "Nova reserva" o docente digita o título à mão, embora as matérias e turmas já venham no XML. Isso gera títulos diferentes para a mesma aula e trabalho repetido. O docente quer escolher a matéria de uma lista, começando pelas dele.

## Goals

- [ ] O docente escolhe o título da reserva numa lista, com as matérias dele primeiro.
- [ ] Continua possível digitar outro título quando a reserva não é de uma matéria (reunião, evento).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Tabela própria de matérias | Os títulos das aulas importadas já são o catálogo; uma tabela nova só vale se o catálogo precisar de edição. |
| Vincular a reserva avulsa à aula (`lesson_id`) | A reserva avulsa continua independente da grade. |
| Editar matérias pela interface | Matérias vêm do XML. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| O que é "matéria" na lista | O título das aulas importadas, no formato atual `MATÉRIA — TURMA` (142 títulos distintos hoje) | É o mesmo texto que aparece na agenda; escolher só a matéria sem a turma perderia a informação da turma | n |
| De onde vêm "minhas matérias" | Títulos das ocupações importadas ativas em que o usuário logado é responsável | Depende de `docentes-do-xml`; sem responsável, a seção fica vazia | y |
| Período considerado | Ocupações importadas do semestre que contém a data da reserva; fora de semestre, o semestre mais recente | Matérias mudam a cada semestre | n |
| Título livre | Opção "Usar “texto” como título" quando o texto digitado não bate com nenhum item | O usuário quer lista, mas reservas de evento precisam de título livre | y |
| Ordem | "Minhas matérias" primeiro, depois "Todas as matérias", cada grupo em ordem alfabética | Escolha do usuário | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Escolher a matéria na nova reserva ⭐ MVP

**User Story**: Como docente, quero escolher a matéria da reserva numa lista com as minhas primeiro, para não digitar e manter o título igual ao da grade.

**Why P1**: É o pedido em si.

**Acceptance Criteria**:

1. WHEN o docente abre "Nova reserva" THEN o sistema SHALL mostrar o campo "Matéria ou título" como lista pesquisável com os grupos "Minhas matérias" e "Todas as matérias".
2. WHEN o docente digita no campo THEN o sistema SHALL filtrar os dois grupos pelo texto, sem diferenciar maiúsculas nem acentos.
3. WHEN o docente escolhe um item THEN o sistema SHALL usar o texto do item como título da reserva.
4. THE sistema SHALL NOT repetir em "Todas as matérias" um título que já aparece em "Minhas matérias".
5. WHEN o docente não tem nenhuma aula como responsável THEN o sistema SHALL esconder o grupo "Minhas matérias".
6. WHILE a largura da tela for menor que 768 px the sistema SHALL abrir a lista logo abaixo do campo, na largura total da folha de reserva, com alvos de toque de pelo menos 44 px.

**Independent Test**: Logado como Fabiana, abrir "Nova reserva" e ver as matérias dela no topo; escolher uma e criar a reserva com esse título.

---

### P1: Usar um título livre ⭐ MVP

**User Story**: Como docente, quero digitar um título que não está na lista para reservar a sala para reunião ou evento.

**Why P1**: Sem isso a lista bloquearia reservas que não são aula.

**Acceptance Criteria**:

1. WHEN o texto digitado não bate exatamente com nenhum item THEN o sistema SHALL oferecer a opção "Usar “texto” como título".
2. WHEN o docente escolhe essa opção THEN o sistema SHALL usar o texto digitado, sem espaços nas pontas, como título.
3. IF o título passar do limite atual de tamanho THEN o sistema SHALL mostrar a mesma mensagem de validação de hoje e SHALL NOT enviar a reserva.
4. IF o título ficar vazio THEN o sistema SHALL mostrar "Informe a matéria ou o título" e SHALL NOT enviar a reserva.

**Independent Test**: Digitar "Reunião de área", escolher "Usar “Reunião de área” como título" e criar a reserva.

---

## Edge Cases

- WHEN não há nenhuma ocupação importada no período THEN o sistema SHALL mostrar só a opção de título livre.
- IF a lista de matérias não carregar THEN o sistema SHALL manter o campo funcionando como título livre e mostrar "Não foi possível carregar as matérias".
- WHILE o usuário for visitante the sistema SHALL NOT expor a lista de matérias, porque visitante não reserva.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| MAT-01 | P1: Escolher matéria (AC 1, 3) | - | Pending |
| MAT-02 | P1: Escolher matéria (AC 2, 4, 5) | - | Pending |
| MAT-03 | P1: Escolher matéria (AC 6) | - | Pending |
| MAT-04 | P1: Título livre (AC 1, 2) | - | Pending |
| MAT-05 | P1: Título livre (AC 3, 4) | - | Pending |

**Coverage:** 5 total, 0 mapped to tasks, 5 unmapped ⚠️

---

## Success Criteria

- [ ] Um docente com aulas cria uma reserva com a própria matéria em no máximo 3 toques no campo.
- [ ] Reservas com título livre continuam funcionando como hoje.

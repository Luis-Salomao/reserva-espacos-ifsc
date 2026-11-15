# Matéria na reserva: especificação

## Problem Statement

Na "Nova reserva" o docente digita o título à mão, embora as matérias e turmas já venham no XML. Isso gera títulos diferentes para a mesma aula e trabalho repetido. O docente quer escolher a matéria de uma lista, começando pelas dele.

## Goals

- [ ] O docente escolhe o título da reserva numa lista, com as matérias dele primeiro.
- [ ] Continua possível digitar outro título quando a reserva não é de uma matéria (reunião, evento).
- [ ] O título escolhido (da lista ou livre) vale tanto para a reserva simples quanto para a série recorrente.

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
| Ordem | "Minhas matérias" primeiro, depois "Todas as matérias", cada grupo em ordem alfabética (`localeCompare` pt-BR, sem ordem numérica) | Escolha do usuário | y |
| Onde o campo fica | No lugar de "Finalidade", depois da seção "Repetir", na folha "Nova reserva" da página `/` | A folha ganhou repetição, salas livres/ocupadas e a visão geral depois desta spec | y |
| Título da série | O mesmo texto do campo segue na prévia e na confirmação da série | Pedido desta entrega: o título da lista vale para a recorrente | y |
| Recarga da lista | Nova chamada a cada mudança da data. O servidor escolhe o semestre | O cliente não conhece o início e o fim do semestre; o desenho falava em recarregar só na troca de semestre | n |
| Lista no celular | Lista inline logo abaixo do campo, `w-full` (a largura da folha) e alvos `min-h-11` (44 px). A página sem rolagem horizontal em 360 px se confere no navegador: o happy-dom não mede scroll | L-005 | n |
| Atalhos | Com a lista aberta: Seta baixo e Seta cima movem o destaque; Enter escolhe a opção destacada e não envia o formulário; Esc fecha a lista e mantém o título já escolhido | L-024 | y |
| Texto do campo | O que está no campo é o título. Escolher um item troca pelo texto do catálogo. A opção livre só aparece com texto aparado não vazio que não coincide com nenhum item e, ao ser escolhida, grava o texto aparado | A opção confirma o título fora da lista; digitar já preenche o campo, como a finalidade fazia | y |
| Mensagens | Vazio: "Informe a matéria ou o título". Acima de 120: "A finalidade deve ter no máximo 120 caracteres." (a mensagem de hoje). O campo não usa `maxLength`, senão a mensagem de tamanho não aparece | O servidor continua validando 120 | y |
| Falha de carga | O aviso "Não foi possível carregar as matérias" aparece e a lista (o elemento) não é montada; o campo segue como título livre | Ausência se afirma no elemento | y |

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
5. WHEN o docente não tem nenhuma aula como responsável, ou o filtro esvazia o grupo, THEN o sistema SHALL esconder o grupo "Minhas matérias" (o elemento do grupo não existe).
6. WHEN a lista está aberta THEN o sistema SHALL mostrá-la logo abaixo do campo, com a classe `w-full` (largura da folha) e cada opção com `min-h-11` (44 px). A página em 360 px não rola na horizontal; isso se confere no navegador.
7. WHEN a lista está aberta e o docente pressiona Seta baixo ou Seta cima THEN o sistema SHALL mover o destaque entre as opções.
8. WHEN uma opção está destacada e o docente pressiona Enter THEN o sistema SHALL escolher essa opção e SHALL NOT enviar o formulário.
9. WHEN a lista está aberta e o docente pressiona Esc THEN o sistema SHALL fechar a lista e manter o título já escolhido.
10. WHEN o docente escolhe um item ou a opção de título livre e pede a série recorrente THEN o sistema SHALL enviar esse mesmo texto como finalidade da prévia e da confirmação.

**Independent Test**: Logado como Fabiana, abrir "Nova reserva" e ver as matérias dela no topo; escolher uma e criar a reserva com esse título.

---

### P1: Usar um título livre ⭐ MVP

**User Story**: Como docente, quero digitar um título que não está na lista para reservar a sala para reunião ou evento.

**Why P1**: Sem isso a lista bloquearia reservas que não são aula.

**Acceptance Criteria**:

1. WHEN o texto aparado não está vazio e não coincide com nenhum item (igualdade depois de normalizar: sem acento, sem diferença de maiúsculas, sem espaços nas pontas) THEN o sistema SHALL oferecer a opção "Usar “texto” como título", com o texto já aparado.
2. WHEN o docente escolhe essa opção THEN o sistema SHALL gravar no campo o texto aparado e usá-lo como título.
3. IF o título passar do limite atual de tamanho THEN o sistema SHALL mostrar a mesma mensagem de validação de hoje e SHALL NOT enviar a reserva.
4. IF o título ficar vazio THEN o sistema SHALL mostrar "Informe a matéria ou o título" e SHALL NOT enviar a reserva.

**Independent Test**: Digitar "Reunião de área", escolher "Usar “Reunião de área” como título" e criar a reserva.

---

## Edge Cases

- WHEN não há nenhuma ocupação importada no período THEN o sistema SHALL mostrar só a opção de título livre.
- IF a lista de matérias não carregar THEN o sistema SHALL manter o campo funcionando como título livre, mostrar "Não foi possível carregar as matérias" e SHALL NOT montar a lista.
- WHILE o usuário for visitante (sem sessão) the sistema SHALL NOT expor a lista de matérias: a ação responde 401 "É preciso entrar.". Conta que não pode reservar recebe recusa no serviço, sem a lista.
- WHEN a data muda THEN o sistema SHALL pedir de novo as matérias dessa data. O servidor usa o semestre que contém a data; fora de qualquer semestre, o mais recente (`semesters.list()` já vem do mais recente para o mais antigo).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| MAT-01 | P1: Escolher matéria (AC 1, 3) | T1–T3, T5, T6 | Done |
| MAT-02 | P1: Escolher matéria (AC 2, 4, 5) | T2, T4, T5 | Done |
| MAT-03 | P1: Escolher matéria (AC 6–9, atalhos e largura) | T5, T6 | Done |
| MAT-04 | P1: Título livre (AC 1, 2) | T4, T5, T6 | Done |
| MAT-05 | P1: Título livre (AC 3, 4) | T6 | Done |
| MAT-06 | P1: Escolher matéria (AC 10, série recorrente) | T6 | Done |

**Coverage:** 6 total, 6 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] Um docente com aulas cria uma reserva com a própria matéria em no máximo 3 toques no campo.
- [ ] Reservas com título livre continuam funcionando como hoje.

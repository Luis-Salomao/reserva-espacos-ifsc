# Reserva recorrente: especificação

## Problem Statement

Hoje cada reserva avulsa vale para uma data só. Quem precisa da mesma sala no mesmo horário por semanas ou meses refaz o formulário data a data. O usuário quer repetir a reserva no próprio formulário, ver antes quais datas estão livres e reservar só essas.

## Goals

- [ ] Criar uma série de reservas (mesma sala, mesmo horário) a partir do formulário "Nova reserva".
- [ ] Mostrar a prévia das datas, livres e com conflito, antes de confirmar; reservar só as livres.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Salas diferentes por data | Decisão do usuário: uma sala para toda a série. |
| Horários diferentes por data | Decisão do usuário: mesmo horário em todas as datas. |
| Reservar várias datas avulsas de uma vez | Decisão do usuário: só a recorrente cria várias. |
| Editar a série depois de criada | Não pedido; cancela-se e cria-se outra. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Premissa: limite de ocorrências | No máximo 120 datas por série | Protege o servidor e a tela de prévia | n |
| Premissa: horizonte | Última data no máximo 365 dias depois da data inicial | "No máximo 1 ano à frente" | n |
| Premissa: intervalo semanal | "A cada N semanas" com N de 1 a 12; semanas contadas a partir da semana (seg–dom) da data inicial | Cobre quinzenal e mensal-por-semana sem poluir | n |
| Premissa: data inicial | A série usa as datas que casam com a regra a partir da data do formulário; a própria data só entra se casar | Mesmo comportamento de agendas comuns | n |
| Premissa: mês sem a data | "Mensal no dia 31" pula meses sem dia 31; "5ª sexta" pula meses sem 5ª sexta | Não inventa data substituta | n |
| Premissa: gravação atômica | As datas livres são gravadas todas ou nenhuma; o servidor revalida os conflitos na gravação; se o conjunto de livres mudou desde a prévia, nada é gravado e a prévia atualizada volta | Evita série pela metade sem o usuário saber | n |
| Premissa: id de série | Coluna `series_id` nova e anulável em `occupations` (migração sem perda de dados); avulsas simples ficam `NULL` | Liga as datas para mostrar e cancelar a série | n |
| Premissa: motivo do conflito | Título e horário da ocupação que bloqueia (nunca o nome de pessoa); ou a mensagem de validação da data | Mesma regra de privacidade da reserva simples | n |
| Premissa: cancelar "esta e as próximas" (P2) | Cancela as ativas da mesma série com início igual ou posterior ao da escolhida; não-admin só as que criou | Espelha a série de aulas importadas | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Repetir no formulário de reserva ⭐ MVP

**User Story**: Como docente, quero marcar que a reserva se repete, para reservar várias datas de uma vez.

**Acceptance Criteria** (REC-01 a REC-04):

1. REC-01 WHEN o formulário "Nova reserva" abre THEN o sistema SHALL mostrar a seção recolhida "Repetir" com o valor "Não repete" e SHALL NOT mostrar as opções de repetição.
2. REC-02 WHEN o usuário abre "Repetir" THEN o sistema SHALL oferecer: "Não repete", "Todo dia útil (seg. a sex.)", "Semanal", "Mensal no dia D" e "Mensal na Nª <dia da semana>" (D e N derivados da data do formulário).
3. REC-02 WHEN a repetição é "Semanal" THEN o sistema SHALL mostrar os dias da semana para marcar (o dia da data inicial vem marcado) e o campo "A cada N semanas".
4. REC-03 WHEN há repetição THEN o sistema SHALL oferecer o término "Até a data" ou "Depois de N ocorrências".
5. REC-04 WHEN há repetição válida THEN o sistema SHALL mostrar o resumo em texto, por exemplo "Toda terça e quinta, até 18/12, 12 datas".

### P1: Gerar as datas da regra ⭐ MVP

**Acceptance Criteria** (REC-05, REC-06):

1. REC-05 WHEN a regra é "dia útil" THEN o sistema SHALL gerar as datas de segunda a sexta a partir da data inicial.
2. REC-05 WHEN a regra é semanal com dias marcados e intervalo N THEN o sistema SHALL gerar os dias marcados das semanas 0, N, 2N… contadas a partir da semana da data inicial.
3. REC-05 WHEN a regra é mensal por dia THEN o sistema SHALL gerar o mesmo dia do mês, pulando meses sem esse dia.
4. REC-05 WHEN a regra é mensal por semana THEN o sistema SHALL gerar a Nª ocorrência do dia da semana da data inicial em cada mês, pulando meses sem a Nª ocorrência.
5. REC-05 WHEN o término é "até a data" THEN o sistema SHALL incluir as datas até essa data, inclusive; WHEN é "N ocorrências" THEN SHALL gerar exatamente N datas.
6. REC-06 IF a regra gera mais de 120 datas, passa de 365 dias depois da data inicial, não gera nenhuma data, tem término antes da data inicial, semanal sem dia marcado ou intervalo fora de 1–12 THEN o sistema SHALL recusar com mensagem no campo "Repetir" e SHALL NOT reservar nada.

### P1: Prévia e confirmação parcial ⭐ MVP

**Acceptance Criteria** (REC-07 a REC-10):

1. REC-07 WHEN o usuário pede a prévia THEN o sistema SHALL listar as datas em "Livres" e "Com conflito", cada conflito com o motivo (título e horário, sem nome de pessoa).
2. REC-08 WHEN o usuário confirma THEN o sistema SHALL reservar só as datas livres, todas ligadas pelo mesmo id de série, e mostrar quantas foram reservadas e quantas ficaram de fora.
3. REC-08 IF nenhuma data está livre THEN o sistema SHALL NOT reservar nada e SHALL desabilitar a confirmação.
4. REC-09 IF o conjunto de datas livres mudou entre a prévia e a confirmação THEN o sistema SHALL NOT reservar nada e SHALL devolver a prévia atualizada com o aviso.
5. REC-09 IF a gravação de qualquer data falha THEN o sistema SHALL NOT gravar nenhuma data da série.
6. REC-10 THE sistema SHALL aplicar a cada data as mesmas regras da reserva simples no servidor: papel (docente, horários, admin; visitante recebe 401, outros papéis 403), finalidade, expediente, sem passado e sem sobreposição.
7. REC-10 WHEN a repetição é "Não repete" THEN o sistema SHALL reservar uma data só, pelo fluxo da reserva simples.

### P2: Série em "Minhas reservas"

**Acceptance Criteria** (REC-11):

1. REC-11 WHEN uma reserva faz parte de uma série THEN "Minhas reservas" SHALL mostrar o selo "Série" no cartão.
2. REC-11 WHEN o usuário cancela uma reserva de série THEN o diálogo SHALL oferecer "Somente esta" e "Esta e as próximas", com a prévia das datas que a segunda opção cancela.

---

## Edge Cases

- Data inicial que não casa com a regra (ex.: segunda com regra "terça"): a série começa na primeira terça seguinte.
- Virada de mês e de ano nas regras semanais e mensais.
- "Mensal no dia 31" e "5ª sexta": meses sem a data são pulados.
- Data inicial hoje com início já passado: recusada como na reserva simples.
- Duas datas da série nunca se sobrepõem entre si (datas diferentes), então a checagem de conflito não as compara.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| REC-01..04 | P1: Repetir no formulário | T3 | Pending |
| REC-05, REC-06 | P1: Gerar as datas | T1 | Done |
| REC-07..10 | P1: Prévia e confirmação | T2, T3 | Pending |
| REC-11 | P2: Série em Minhas reservas | T4 | Pending |

## Success Criteria

- [ ] Uma série semanal de um semestre é criada em uma confirmação, com as datas em conflito listadas e puladas.

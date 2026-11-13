# Minha agenda — design

Data: 2026-11-13. Aprovado pelo autor.

## Por quê

O docente quer organizar, por unidade curricular, os dias em que usa uma sala ou laboratório.
Exemplo: "Cultura Digital - LAZ" tem o LAB 106A reservado toda semana pelo horário importado; o
docente quer ver só essa disciplina e desmarcar os dias em que não usará o laboratório. Também quer
mudar dia/horário das reservas manuais a partir de uma visão de agenda.

## Objetivos

- Rota nova "Minha agenda" no menu; "Minhas reservas" (lista por mês) continua igual.
- Grade semanal (reaproveitando `week-grid`) com as ocupações do usuário em todas as salas: as
  mesmas que `listMine` traz (criadas por ele ou importadas em que é responsável). O card mostra a sala.
- Filtro "Disciplina": títulos das reservas futuras do usuário, agrupados por título normalizado
  (sem diferença de maiúsculas, espaços extras e variantes de traço `-`, `–`, `—`).
- Com disciplina filtrada, alternar "Semana" / "Todas as datas": lista de todas as datas futuras
  daquela disciplina, cada uma com "Desmarcar" (cancelamento de uma data).
- Clique numa reserva abre o painel de detalhes existente (`occupation-details`):
  - manual: Editar (dia/horário; em série "só esta" ou "esta e as próximas", usando a edição de
    série existente) e Cancelar;
  - importada: só "Desmarcar esta data" (cancelamento escopo `data`).

## Não objetivos

- Mover ou editar aula importada (decisão do autor: basta desmarcar).
- Arrastar/redimensionar com o mouse (etapa futura).
- Mudar regras de permissão ou de cancelamento.

## Restrições

- Servidor: nova consulta das ocupações do usuário num intervalo `[from, to)` em todas as salas,
  sem o limite de página de `myBookings`, com teto razoável de intervalo (ex.: um semestre); e a lista
  das disciplinas futuras do usuário. Mesmas regras de `canEdit`/`responsible` de `myBookings`.
- Seguir os gates do repo (`bun run check`), testes de domínio para a normalização de título,
  layout mobile sem rolagem horizontal.

## Abordagens consideradas

1. **Tela nova reaproveitando grade e painel (escolhida):** menor código novo, comportamento já testado.
2. Aba dentro de "Minhas reservas": a lista não comporta bem a grade semanal.
3. Grade nova do zero: duplicaria `week-grid`/`occupation-details`.

## Fica com quem constrói

Nome exato da rota/arquivos, forma do payload, como o filtro persiste na URL, layout mobile da grade
(pode cair para "Todas as datas"/dia no celular).

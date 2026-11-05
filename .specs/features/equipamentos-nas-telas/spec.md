# Equipamentos nas telas

**Status**: implementada nesta branch.

A administração já grava equipamentos (`space_equipment`) e observações (`spaces.equipment_notes`). A consulta `listWithEquipment` / `listSpaces` já devolve esses dados (ESPACOS-14). Esta feature só os mostra.

## Premissas

| Premissa | Decisão | Confirmada |
| --- | --- | --- |
| Observações livres (`equipment_notes`) | Só para quem está logado. Visitante recebe `notes: null` e o parágrafo não é montado. | Não |
| Sem dado | Os três tipos aparecem, com o texto já existente de `describeEquipment` ("… não informado"). | Sim |
| Ícones | Pequenos, `aria-hidden`; o rótulo fica em `sr-only`. | Sim |
| Largura | As marcas usam `min-w-0` e `wrap-anywhere`. A página em 360 px não deve rolar na horizontal; as colunas continuam rolando dentro da caixa. A rolagem se confere no navegador (L-005). | Não |

## Onde aparece

1. Seletor de sala (`room-selector.tsx`): ícones em cada sala. Observações só se `showNotes`.
2. Cabeçalho da sala na visão "Sala".
3. Cabeçalho das colunas e lista "Livres".
4. Cartão de detalhe da visão geral e itens do painel de seleção.
5. Formulário de reserva, ao trocar a sala.

## Filtro (P2)

- "Com projetor": só sala com projetor informado e quantidade maior que zero. Zero e "não informado" ficam de fora.
- "Mínimo de N computadores": N de 1 a 999. Quantidade desconhecida ou menor que N fica de fora. Não entra na conta de "sem capacidade".
- URL: `projetor=true` e `pcs`. Só no cliente; não entram nas `loaderDeps`.

## Critérios

- EQ-01: o grupo `Equipamentos` tem um rótulo por tipo, com o texto acessível; sem cadastro, os três dizem "não informado".
- EQ-02: observações aparecem para logado e o elemento está ausente para visitante.
- EQ-03: `roomsDay`, `roomsWeek` e `listSpaces` trazem os itens; o JSON do visitante não contém o texto das observações.
- EQ-04: trocar a sala no formulário troca as marcas.
- EQ-05: projetor e computadores filtram como acima; a URL guarda `projetor` e `pcs`.

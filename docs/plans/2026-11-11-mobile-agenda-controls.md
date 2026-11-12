# Agenda mobile: agrupar controles secundários

- **Pedido:** reduzir a pilha de controles antes dos horários em telas de 360–390 px.
- **Proposta:** agrupar visualizações alternativas e detalhes da sala em “Mais opções”, com controles quebrando linha sem rolagem horizontal.
- **Essenciais sempre visíveis:** sala escolhida, dia selecionado, disponibilidade e ação “Reservar”.
- **Verificação:** testes de componente adicionados para 360 e 390 px e navegação com data/sala na URL; execução pendente porque `@happy-dom/global-registrator` não está instalado e `bun install` falha ao acessar o diretório temporário.
- **Escopo:** somente agenda mobile; onboarding não faz parte desta tarefa.

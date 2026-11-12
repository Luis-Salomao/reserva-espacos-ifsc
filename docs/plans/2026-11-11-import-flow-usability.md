# Plano: prévia e importação guiada de horários

## Problema observado

A conferência atual exige selecionar uma sala por vez para entender o conteúdo do XML. O fluxo também mantém várias etapas na mesma página e perde estado local ao sair da rota. Quando nenhuma linha pode ser aplicada, o resultado pode parecer sucesso mesmo com zero ocupações criadas.

## Escopo

1. Mostrar uma visão consolidada de todas as salas do XML, com ocorrências (inclusive aulas com várias salas), dias e conflitos; manter a grade de sala única como detalhe opcional.
2. Na etapa de vínculo, mostrar em tabela compacta cada sala do arquivo, suas ocorrências, o destino IFSC e o estado do vínculo, com contagens e filtros para pendências, sugestões e vínculos salvos.
3. Distinguir explicitamente linhas aplicáveis pelo parser de ocupações que só podem ser aplicadas depois de vínculo válido com espaço IFSC e datas de duração configuradas.
4. Transformar a importação em etapas visíveis uma por vez, com navegação para avançar e voltar.
5. Preservar prévia, arquivo selecionado, etapa, semestre, vínculos e lote no cache em memória do TanStack Query durante navegação dentro da mesma sessão. Não persistir XML ou conteúdo de entrevista/local em armazenamento durável.
6. Permitir criar/configurar semestre na própria tela. Sugerir datas somente quando forem inferíveis sem ambiguidade; caso contrário, pedir a entrada explícita das datas necessárias.
7. Explicar claramente quando zero linhas podem ser aplicadas e apontar motivos como sala sem vínculo, duração sem datas ou múltiplas salas.

## Critérios de aceite

- A pessoa consegue ver todas as salas do arquivo e localizar pendências sem abrir uma grade por sala.
- A tabela não apresenta `uma sala no XML` como sinônimo de `espaço IFSC vinculado`.
- A grade detalhada por sala continua acessível como opção.
- Somente a etapa atual aparece visualmente, com botões anterior/próxima e indicação de progresso.
- Ao navegar para outra rota e voltar, a etapa e os dados da importação continuam disponíveis enquanto o cache do navegador existir.
- Datas de duração nunca são inventadas. A ausência de datas vem acompanhada do caminho para configurá-las.
- O estado de zero aplicações informa a causa e não é rotulado como importação concluída com sucesso.
- Regras existentes de segurança, idempotência, proteção contra duplicação e confirmação dos mapeamentos permanecem ativas.

## Dados locais usados para diagnóstico

Foi consultado localmente um XML do aSc, sem copiá-lo ao repositório nem registrar nomes. Totais agregados: 7 durações, 21 salas, 195 horários semanais; 155 horários com uma sala, 17 sem sala e 23 com várias salas. Foram encontradas zero sobreposições certas e uma possível. Esses totais descrevem o parser; não provam vínculo com espaços do IFSC.

## Verificação

- Testes focados de componente e de transformação de dados.
- `git diff --check`.
- Executar os checks disponíveis no worktree e registrar limitações de dependências do ambiente.
- Sem commit, push, merge ou deploy nesta tarefa.

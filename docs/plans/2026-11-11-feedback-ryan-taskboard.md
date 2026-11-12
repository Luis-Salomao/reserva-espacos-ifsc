# Plano de execução — feedback do Ryan

PR em andamento: https://github.com/Luis-Salomao/reserva-espacos-ifsc/pull/1  
Branch de trabalho: `codex/ryan-feedback-wave`, baseada na cabeça atual da PR `d5f7a1b`.  
Este quadro transforma os 15 pontos de Ryan e o novo feedback sobre a importação em tarefas rastreáveis. Um agente implementador/auditor será designado por tarefa, e cada resultado será revisado antes da integração.

## Regras da rodada

- Trabalhar somente nesta branch e preservar o banco, secrets, e domínio de produção.
- Usar dados fictícios e banco temporário para testes. Não criar conta em produção nem enviar e-mail sem configuração e prova de entrega.
- Não marcar como resolvido por existência de código ou testes unitários apenas: conferir a experiência local no navegador quando o critério envolver interface ou fluxo.
- Cada tarefa deve registrar arquivos, evidências, limites e resultado no próprio quadro; a revisão final confirma o estado atual da PR.
- A conta real do Ryan e o e-mail de teste dependem de autorização/configuração do provedor e não podem ser simulados como envio real.

## Tarefas

| ID | Feedback do Ryan | Critérios de aceite | Estado inicial |
|---|---|---|---|
| RYAN-01 | A tela inicial precisa identificar o IFSC Câmpus Garopaba. | Marca institucional legível em tema claro/escuro e viewport estreito; título identifica o sistema de reservas do câmpus. | Implementado e conferido localmente no Chromium em 1440/390/320 px, temas claro/escuro; 20 testes passaram. Limite: sessão autenticada e produção não verificadas. |
| RYAN-02 | Explicar melhor os formatos de visualização e melhorar a navegação. | Cada modo informa o que mostra; controles e mudança de modo são compreensíveis em desktop e mobile; seleção/data não se perdem sem explicação. | Validado em 75 testes focados e inspeção de código/DOM; sem inspeção no navegador real. |
| RYAN-03 | O botão de entrar precisa dar retorno ao usuário. | Envio mostra estado de carregamento, impede submissão duplicada e apresenta erro acessível em falha. | Código validado; 25 testes de autenticação passaram no HEAD d5f7a1b. O feedback acessível existe; inspeção visual ainda pendente. |
| RYAN-04 | Testar envio de e-mail e cadastrar o e-mail real do Ryan. | Configuração de teste documentada e fluxo validado; e-mail só é declarado enviado com confirmação do provedor. Conta real não recebe senha em texto aberto. | Pendente de ambiente/credenciais do provedor e verificação de envio. |
| RYAN-05 | Corrigir “origem não permitida” ao voltar da recuperação de senha para login. | Recuperação, retorno ao login e POSTs passam localmente com a origem do proxy; configuração não depende de origem indevida. | Corrigido e reproduzido/regredido em Chromium com proxy local, SQLite sintético e e-mail desabilitado; `bun run check`: 1904 pass, 4 skip, 0 fail. Produção não verificada. Commit local `45dd4745b2e2f5d2b30dbae903067fb62723bd67`. |
| RYAN-06 | Evitar que disciplinas diferentes tenham cores repetidas. | Diferenciação continua perceptível quando cores se repetem, incluindo legenda, tema escuro e daltonismo básico por padrão além da cor. | Rótulos textuais por disciplina e nome acessível integral conferidos em Chromium a 420 px, claro/escuro, cartões de 106/236 px; 19 testes, lint e typecheck passaram. Siglas podem coincidir. Commit local `472dae71dce6296d4a2d9d5e0098a1e043fcc6c7`. |
| RYAN-07 | Melhorar o select de sala no tema escuro e pedir data antes da sala. | Data é escolhida antes da sala; ao mudar data, disponibilidade respeita a data; select tem contraste em tema escuro. | Ordem, classes do select e atualização de disponibilidade confirmadas em código; 46 testes e typecheck passaram. Inspeção visual no navegador ficou bloqueada por falha Vite/Nitro ao resolver dependências da junction. Sem alteração de código. |
| RYAN-08 | “A cada quantas semanas?” não é claro. | Texto explica a recorrência em linguagem direta, com exemplo de semanal e quinzenal; ajuda contextual acessível. | Concluído no commit local `a3d80a39ee6891b4d3559ad94c1cc5a5c8e8db7f`: rótulo “Intervalo entre repetições (semanas)”, exemplo semanal/quinzenal com `aria-describedby`; 21 testes, typecheck e Biome passaram. Sem verificação manual de navegador. |
| RYAN-09 | Facilitar a troca de tema. | Alternância claro/escuro fica acessível sem abrir menu secundário e tem nome acessível. | Integrado em `e02a68e`; botão visível mantém o nome “Tema escuro”, expõe estado `aria-pressed` e título que informa a ação. 20 testes de AppShell passaram. Sem conferência visual em navegador. |
| RYAN-10 | Minhas reservas com muitas ocorrências viram uma lista longa. | Reservas são agrupadas de modo escaneável, sem perder ações, datas ou informação de recorrência; mobile também. | Integrado em `cdb24f5`: séries recolhíveis dentro do mês, com título, contagem e próxima ocorrência; as ações continuam em cada ocorrência. Teste de rota: 12 passaram. Sem inspeção visual mobile. |
| RYAN-11 | Editar/cancelar recorrências deveria agir sobre o grupo. | Usuário escolhe editar/cancelar uma ocorrência, esta e próximas ou série, com prévia e confirmação; atualização valida conflitos e autorização atomicamente e preserva exceções. | Parcial: a série oferece atalhos para editar a próxima ocorrência individual e abrir o cancelamento com escopos suportados; edição em lote não existe porque domínio e aplicação atualizam somente um `occupationId`. Não afirmar edição de série concluída. |
| RYAN-12 | Disponibilizar uma conta para testar importação XML. | Criar/instruir conta de teste somente no banco local temporário, com papel necessário e sem expor credenciais em Git, PR ou produção. | Conta admin local criada no SQLite descartável e senha validada contra o hash no banco; login pela prévia do navegador não foi confirmado. Credenciais são entregues fora do Git. |
| RYAN-13 | Reservas importadas não devem parecer sempre de responsabilidade do administrador. | Importador permite mapear docente do XML para a conta responsável; autoria/responsabilidade exibida corretamente e rastreável em teste com XML local. | Integrado: importação segue atribuindo responsabilidade à conta do docente mapeado; “você é responsável” só aparece para essa pessoa. Teste de aplicação e lista cobre o responsável e quem não é responsável. `createdBy` da ocupação importada permanece nulo por desenho do repositório; o criador do lote é registrado separadamente. |
| RYAN-14 | Alinhar ícones do menu. | Ícones de navegação compartilham caixa, centro e alinhamento em sidebar aberta/compacta e viewport móvel. | Slot e tamanho de ícones unificados no menu desktop e móvel; teste do DOM cobre menu aberto, recolhido e móvel. Inspeção visual ainda pendente. |
| RYAN-15 | Cliques em Sala > Semana não funcionam. | Clique em horário livre abre uma única reserva com sala, data e intervalo corretos; clique ocupado não cria reserva; conferir visualmente em navegador. | Integrado em `071e37d` e corrigido em `bc731b5`: clique físico cria um rascunho único de 1 hora e consome o clique nativo, sem abrir o formulário duas vezes; os testes focados de agenda/rascunho passaram (64 testes). Reprodução manual de navegador ainda pendente. |
| RYAN-16 | A conferência do XML exige revisar sala por sala e a visão geral não ajuda a entender o lote. | A prévia mostra as salas em visão resumida, permite abrir os horários de cada uma diretamente na linha, destaca salas com sobreposição/sem horários, e mantém a comparação semanal completa como opção; não grava ocupações antes da confirmação. | Melhorado: nomes visualmente iguais são exibidos uma vez; contagem identifica “horários”; resumo prioriza sobreposições e salas sem horários; botão “Conferir sala” expande a grade na própria linha, inclusive mensagens para salas sem grade individual. Comparação semanal de todas as salas permanece recolhida como alternativa. Testes focados: 17 passaram. `bun run check`: Biome, typecheck, Knip, dependency-cruiser, 1.916 testes (4 ignorados), Betterleaks sem leaks. Inspeção visual no navegador ainda pendente. Arquivos: `rooms-overview.tsx`, teste, `importar.index.tsx`.

### Gate integrado

Na integração, `bun run check` passou após a melhoria RYAN-16: Biome, typecheck, Knip, dependency-cruiser, 1.916 testes (4 ignorados) e Betterleaks sem leaks. Para executar Betterleaks neste Windows isolado, `LOCALAPPDATA`, `TEMP` e `TMP` foram direcionados a `.tmp/betterleaks-localappdata`; sem isso o runtime Wazero falha ao renomear temporário no diretório padrão do sandbox.

### Evidência de ambiente para RYAN-04

Na inspeção local, não há `.env`; as variáveis `RESEND_API_KEY`, `EMAIL_PAYLOAD_KEY`, `EMAIL_FROM` e `EMAIL_PROVIDER` não estão definidas. Nenhum e-mail real foi enviado. Esta tarefa continua aberta até o provedor ser configurado com secrets protegidos e a entrega ser confirmada.

## Registro por tarefa

Para cada ID, anexar: agente, commit/arquivos, comandos e saída de teste, observação local no navegador (quando aplicável), resultado da revisão independente e quaisquer dependências externas. Manter RYAN-04 em aberto até a entrega real ser confirmada; não substituir essa evidência por mock.


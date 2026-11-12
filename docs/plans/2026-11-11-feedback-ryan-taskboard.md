# Plano de execução — feedback do Ryan

PR em andamento: https://github.com/Luis-Salomao/reserva-espacos-ifsc/pull/1  
Branch de trabalho: `codex/ryan-feedback-wave`, baseada na cabeça atual da PR `d5f7a1b`.  
Este quadro transforma cada um dos 15 pontos de Ryan em tarefa rastreável. Um agente implementador/auditor será designado por tarefa, e cada resultado será revisado antes da integração.

## Regras da rodada

- Trabalhar somente nesta branch e preservar o banco, secrets, e domínio de produção.
- Usar dados fictícios e banco temporário para testes. Não criar conta em produção nem enviar e-mail sem configuração e prova de entrega.
- Não marcar como resolvido por existência de código ou testes unitários apenas: conferir a experiência local no navegador quando o critério envolver interface ou fluxo.
- Cada tarefa deve registrar arquivos, evidências, limites e resultado no próprio quadro; a revisão final confirma o estado atual da PR.
- A conta real do Ryan e o e-mail de teste dependem de autorização/configuração do provedor e não podem ser simulados como envio real.

## Tarefas

| ID | Feedback do Ryan | Critérios de aceite | Estado inicial |
|---|---|---|---|
| RYAN-01 | A tela inicial precisa identificar o IFSC Câmpus Garopaba. | Marca institucional legível em tema claro/escuro e viewport estreito; título identifica o sistema de reservas do câmpus. | Implementado no código da PR; auditoria visual pendente. |
| RYAN-02 | Explicar melhor os formatos de visualização e melhorar a navegação. | Cada modo informa o que mostra; controles e mudança de modo são compreensíveis em desktop e mobile; seleção/data não se perdem sem explicação. | Implementado no código da PR; auditoria visual pendente. |
| RYAN-03 | O botão de entrar precisa dar retorno ao usuário. | Envio mostra estado de carregamento, impede submissão duplicada e apresenta erro acessível em falha. | Implementado no código da PR; auditar comportamento local. |
| RYAN-04 | Testar envio de e-mail e cadastrar o e-mail real do Ryan. | Configuração de teste documentada e fluxo validado; e-mail só é declarado enviado com confirmação do provedor. Conta real não recebe senha em texto aberto. | Pendente de ambiente/credenciais do provedor e verificação de envio. |
| RYAN-05 | Corrigir “origem não permitida” ao voltar da recuperação de senha para login. | Recuperação, retorno ao login e POSTs passam localmente com a origem do proxy; configuração não depende de origem indevida. | Corrigido no código, sem validação local do fluxo nesta rodada. |
| RYAN-06 | Evitar que disciplinas diferentes tenham cores repetidas. | Diferenciação continua perceptível quando cores se repetem, incluindo legenda, tema escuro e daltonismo básico por padrão além da cor. | Implementado no código da PR; auditar visualmente. |
| RYAN-07 | Melhorar o select de sala no tema escuro e pedir data antes da sala. | Data é escolhida antes da sala; ao mudar data, disponibilidade respeita a data; select tem contraste em tema escuro. | Implementado no código da PR; auditar visualmente. |
| RYAN-08 | “A cada quantas semanas?” não é claro. | Texto explica a recorrência em linguagem direta, com exemplo de semanal e quinzenal; ajuda contextual acessível. | Implementado no código da PR; auditar. |
| RYAN-09 | Facilitar a troca de tema. | Alternância claro/escuro fica acessível sem abrir menu secundário e tem nome acessível. | Implementado no código da PR; auditar. |
| RYAN-10 | Minhas reservas com muitas ocorrências viram uma lista longa. | Reservas são agrupadas de modo escaneável, sem perder ações, datas ou informação de recorrência; mobile também. | Implementado no código da PR; auditar. |
| RYAN-11 | Editar/cancelar recorrências deveria agir sobre o grupo. | Usuário escolhe editar/cancelar uma ocorrência, esta e próximas ou série, com prévia e confirmação; atualização valida conflitos e autorização atomicamente e preserva exceções. | Parcial: cancelamento de série existe; edição em grupo falta. |
| RYAN-12 | Disponibilizar uma conta para testar importação XML. | Criar/instruir conta de teste somente no banco local temporário, com papel necessário e sem expor credenciais em Git, PR ou produção. | Fluxo de papel existe; conta local de teste ainda precisa ser preparada/verificada. |
| RYAN-13 | Reservas importadas não devem parecer sempre de responsabilidade do administrador. | Importador permite mapear docente do XML para a conta responsável; autoria/responsabilidade exibida corretamente e rastreável em teste com XML local. | Fluxo de mapeamento existe; teste integrado e responsabilidade visível pendentes. |
| RYAN-14 | Alinhar ícones do menu. | Ícones de navegação compartilham caixa, centro e alinhamento em sidebar aberta/compacta e viewport móvel. | Implementado no código da PR; auditar visualmente. |
| RYAN-15 | Cliques em Sala > Semana não funcionam. | Clique em horário livre abre uma única reserva com sala, data e intervalo corretos; clique ocupado não cria reserva; conferir visualmente em navegador. | Teste de componente existe; reprodução manual local pendente. |

## Registro por tarefa

Para cada ID, anexar: agente, commit/arquivos, comandos e saída de teste, observação local no navegador (quando aplicável), resultado da revisão independente e quaisquer dependências externas. Manter RYAN-04 em aberto até a entrega real ser confirmada; não substituir essa evidência por mock.

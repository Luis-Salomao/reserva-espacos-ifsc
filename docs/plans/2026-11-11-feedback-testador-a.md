# Feedback do testador A para a PR de reservas

Repositório: `Luis-Salomao/reserva-espacos-ifsc`

PR em andamento: https://github.com/Luis-Salomao/reserva-espacos-ifsc/pull/1

Domínio final: https://reservas-ifsc.luissalomao.dev/

## Itens de revisão

| # | Pedido | Estado inicial / tarefa |
|---|---|---|
| 1 | Identificar claramente o IFSC Câmpus Garopaba na tela inicial | **Implementado:** cabeçalho usa a marca oficial horizontal do IFSC Câmpus Garopaba em base branca no tema escuro; o nome do sistema usa cor adaptada ao tema. |
| 2 | Explicar as visualizações e melhorar a navegação | **Implementado:** cada visualização mostra orientação contextual e mantém dica no controle. |
| 3 | Dar retorno visível ao enviar o login | **Implementado:** botão muda para “Entrando…”, bloqueia duplo envio e anuncia o estado. |
| 4 | Validar envio de e-mail para `e-mail institucional do testador` | **Pendente de ambiente:** configuração/diagnóstico local existe; entrega real depende de secrets e execução do provedor. Nenhum e-mail foi enviado. |
| 5 | Corrigir “origem não permitida” após recuperação de senha | **Corrigido no código local:** `PUBLIC_ORIGIN` é a origem upstream reescrita pelo proxy; `PUBLIC_LINK_ORIGIN` aponta os links de e-mail para o domínio oficial. Produção não foi verificada. |
| 6 | Diferenciar disciplinas cujas cores se repetem | **Implementado:** padrões visuais acompanham as cores na agenda e legenda. |
| 7 | Corrigir seletor de sala no tema escuro e pedir data antes da sala | **Implementado:** data vem antes da sala e o seletor tem cores explícitas no tema escuro. |
| 8 | Explicar “a cada quantas semanas?” | **Implementado:** exemplos para repetição semanal, quinzenal e a cada três semanas. |
| 9 | Facilitar acesso à troca de tema | **Implementado:** controle fica visível na barra também para pessoas autenticadas. |
| 10 | Evitar lista longa de reservas | **Implementado:** agrupa por mês em seções recolhíveis; reservas não são fundidas. |
| 11 | Editar/cancelar recorrências como série | **Parcial:** cancelamento de série existe; edição continua por ocorrência. Edição em lote fica pendente de modelagem e validação atômica segura. |
| 12 | Criar conta para testar importação XML | **Fluxo disponível:** administradores podem criar contas e atribuir papel de horários; nenhuma conta de produção foi criada. |
| 13 | Permitir indicar outra pessoa como responsável pelas reservas XML | **Fluxo disponível:** etapa de mapeamento associa docentes do XML às contas responsáveis; precisa de teste com participante/conta real autorizada. |
| 14 | Alinhar ícones no menu | **Implementado:** ícones dos menus usam caixas centralizadas de tamanho uniforme. |
| 15 | Fazer os cliques no calendário Sala > Semana funcionarem | **Coberto por teste de componente** que confirma a sala, data e intervalo; não houve conferência manual no navegador. |
| 16 | Melhorar usabilidade mobile, possivelmente com modo próprio | **Implementado:** cartões por dia/sala e blocos de horário tocáveis na visão compacta, mantendo a matriz desktop. |
| 17 | Evitar a grade semanal comprimida no celular quando o navegador solicita “Site para computador” | **Implementado:** o modo compacto ativa até 1023 px, incluindo viewport CSS próximo de 980 px. Teste de componente em 980 px; sem validação em aparelho físico. |
| 18 | Evitar que “Detalhes” quebre para uma linha separada no cabeçalho da sala | **Implementado:** botão compacto com ícone de informação em círculo e rótulo acessível com o nome da sala. |
| 19 | Investigar clique noturno que supostamente abre duas reservas | **Coberto por teste de componente:** um toque em um intervalo noturno emite uma única seleção. O problema não foi reproduzido manualmente no navegador. |
| 20 | Reduzir a quantidade de controles antes dos horários na agenda mobile | **Implementado:** visualizações secundárias e detalhes da sala em “Mais opções”; sala selecionada, dia, disponibilidade e ação de reserva continuam visíveis. Teste para 360 e 390 px adicionado; execução pendente por dependências ausentes no worktree. |

## Estado salvo

Snapshot local commitado em `codex/estado-deploy-2026-11-11` (`ce82b4d`). O commit não fez push nem deploy. Naquele snapshot, `PUBLIC_ORIGIN` apontava incorretamente para o domínio público; a correção pós-snapshot usa o upstream do app Worker para CSRF e cookies, e `PUBLIC_LINK_ORIGIN` para links públicos de e-mail. Nenhuma configuração da produção foi verificada ou alterada. Os hooks de pré-commit do snapshot passaram: Betterleaks sem achados após marcar como permitidos apenas valores fictícios de fixtures de teste, e Biome sem erros.

## Restrições

- Não executar deploy nem migrar D1 remoto durante a revisão.
- Não incluir credenciais reais em arquivos ou logs.
- Não afirmar envio de e-mail real sem configuração e evidência do provedor.
- Manter cada ponto associado a uma alteração e à verificação correspondente antes de atualizar a PR.

## Implementação nesta rodada

- Marca do sistema no cabeçalho: IFSC Garopaba + Reserva de espaços.
- Visualizações Sala, Colunas, Livres e Visão geral: orientação curta atualizada conforme a seleção.
- Login: feedback de envio com estado acessível e botão desabilitado durante a submissão.
- Tema: botão de alternância fora do menu da conta para acesso direto.
- Navegação: ícones alinhados por contêineres uniformes de 20 px.
- Identidade: marca oficial horizontal do IFSC Câmpus Garopaba aplicada ao cabeçalho, com registro da fonte em `src/assets/ifsc-garopaba-horizontal.md`; o nome “Reserva de espaços” usa a cor principal do tema para manter contraste.
- Detalhes da sala: o rótulo que quebrava a linha foi substituído por um botão compacto de informação, com nome acessível.
- Verificações previstas: `bun test src/components/app-shell.test.tsx test/components/view-switcher.test.tsx`; não houve deploy.

## Implementação de usabilidade e estado dos itens 6–16

- **6 — disciplinas com cores repetidas:** a agenda geral agora combina a cor com padrões visuais por disciplina, incluindo a legenda; os padrões complementam a cor para ajudar a diferenciar eventos.
- **7 — sala e tema escuro:** o formulário de reserva pede a data antes de carregar/escolher a sala e aplica estilo explícito ao seletor no tema escuro.
- **8 — recorrência:** o rótulo pergunta a cada quantas semanas a reserva se repete, acompanhado de exemplos para intervalos de uma, duas e três semanas.
- **10 — Minhas reservas:** as próximas reservas ficam agrupadas por mês em seções recolhíveis com contagem, reduzindo a lista corrida. O agrupamento mensal não altera nem funde reservas recorrentes.
- **11 — edição/cancelamento de séries:** cancelamento com escopo para a ocorrência e para a série já tem fluxo existente. A edição continua limitada à ocorrência. O serviço `updateBooking` valida propriedade e estado e grava uma única ocupação por `updateManualIfFree`; não há operação transacional para validar conflitos e autorização e atualizar várias ocorrências/“esta e próximas” atomicamente. A implementação pedida exige primeiro modelar escopos e exceções, incluir leitura/validação concorrente e gravação em transação, preservar importações e definir comportamento quando uma ocorrência já foi alterada/cancelada. Não foi improvisada edição em lote neste patch.
- **15 — calendário Sala > Semana:** acrescentei uma verificação que clica em um horário livre na coluna da sala e confirma a abertura do fluxo com sala, data e intervalo corretos. Não foi feita validação manual no navegador nesta rodada.
- **16 — mobile:** a visão compacta ganhou alternativa em cartões por dia e sala, com blocos de horário em botões maiores, mantendo o painel de consulta/seleção; a matriz larga permanece na visão desktop.

### Verificações executadas

- `bunx biome check` nos arquivos alterados: passou.
- `bun run typecheck`: passou após corrigir a possibilidade de dia ausente no modo compacto.
- Testes focados de agenda, formulário de reserva/recorrência, visão geral de salas, calendário Sala > Semana e Minhas reservas: **135 passaram, 0 falharam** (127 na rodada anterior e 8 na suíte focada de `rooms-columns`).
- `bun run check`: **passou nesta rodada**. Biome, TypeScript, Knip, dependency-cruiser e Betterleaks sem achados; suíte completa com **1896 testes aprovados, 3 ignorados e 0 falhas** (1.899 no total).
- A verificação focada do clique noturno confere que um toque no intervalo 20:10–22:00 chama o fluxo de reserva uma única vez; ela não substitui reprodução manual no navegador.
- Nenhum deploy foi feito; o comportamento em produção não foi verificado.

## Achado complementar — modo desktop do navegador em celular

A captura da grade semanal comprimida é compatível com o Chrome Android usando “Site para computador”: nesse modo, o viewport CSS pode ficar próximo de 980 px, acima do breakpoint anterior de 767 px. Assim, `useCompact()` mantinha a matriz larga visível apesar de a tela física ser de celular. O breakpoint foi ampliado para 1023 px; abaixo dele, a visão geral usa cartões por sala e horários tocáveis. Um teste em viewport de 980 px confirma a ativação dos cartões, a navegação entre dias e a quantidade de opções por sala. Essa alteração não modifica rotas nem o fluxo de reserva.

Verificação focada deste achado: Biome aprovado; `bun test test/components/rooms-view.test.tsx test/components/rooms-overview.test.tsx` — **85 testes passaram, 0 falharam**. Sem validação manual em aparelho físico e sem deploy.

## Revisão complementar — consulta administrativa e erro de data

- **Administração, lista de contas:** busca por nome, e-mail e sigla, sem diferença de acentos ou maiúsculas; filtros combináveis por papel e status (ativa, inativa ou não ativada); contagem visível de itens filtrados e estado vazio com ação para limpar os filtros. A listagem usa duas colunas em telas médias ou maiores, mantendo uma coluna no celular. Criação, edição, ativação, redefinição e fusão de contas permanecem disponíveis.
- **Formulário de semestre:** ao editar a data de início após erro de validação do campo `start`, a mensagem antiga é limpa; a submissão continua usando a validação server-side existente.
- **Testes de regressão adicionados:** busca por nome com acento, e-mail e sigla; combinação de papel/status; contagem, estado vazio e limpeza dos filtros; limpeza do erro de início ao editar. Verificação focal: `bun test src/components/admin/admin-managers.test.tsx test/components/rooms-overview.test.tsx` — **89 passaram, 0 falharam**; Biome nos arquivos TypeScript alterados e `bun run typecheck` passaram.

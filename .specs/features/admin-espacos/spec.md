# Administração de espaços: especificação

## Problem Statement

A tela `/admin/espacos` é um formulário de criação seguido de uma lista plana de cartões, sem busca nem agrupamento. Com 21 salas, achar e editar uma sala é lento, e o cadastro só guarda nome e capacidade. O usuário pediu uma administração com UX melhor e o cadastro de equipamentos por sala (projetor, quantidade de computadores, aparelho de som e afins), que o RF-09 do TCC pede para mostrar distinguindo dado informado de dado desconhecido.

## Goals

- [ ] Achar e editar qualquer espaço em no máximo 3 interações a partir de `/admin/espacos` (busca, "Editar", "Salvar").
- [ ] Registrar projetor, computadores, aparelho de som e observações por espaço, com "não informado" distinto de "não tem".
- [ ] Funcionar em 360 px e em 1280 px sem rolagem horizontal da página.
- [ ] Deixar os equipamentos disponíveis na consulta de espaços da agenda, sem mudar as telas da agenda agora.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Mostrar equipamentos no seletor de sala, em `/salas` e na reserva | Arquivos em mudança na feature `visao-geral`; entra depois do merge (próximo passo registrado). |
| Filtrar salas por equipamento na agenda | Depende da tela acima; não foi pedido para agora. |
| Estado de funcionamento do equipamento ("projetor quebrado") | RF-09 proíbe afirmar funcionamento atual sem fonte e responsável pela atualização. |
| Campo próprio de bloco e andar | O cadastro não tem esse dado; o agrupamento usa o nome, como o seletor de sala. |
| Histórico de alterações do cadastro | Não pedido; o projeto não registra ações administrativas hoje. |
| Motoristas, veículos e outros recursos agendáveis | Feature `motoristas-e-veiculos` (só spec, rascunho). |
| Desativar espaço sem excluir | Não pedido; a exclusão só vale para espaço sem uso (ver P2). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Modelo dos equipamentos | Tabela `space_equipment` com uma linha por (espaço, tipo, quantidade) e catálogo de tipos no domínio; observações numa coluna de `spaces` | Novo tipo de equipamento entra no catálogo sem migração; o usuário pediu modelo extensível | n |
| Projetor e aparelho de som | Três estados: sim (quantidade 1), não (quantidade 0), não informado (sem linha) | RF-09 exige distinguir desconhecido de informado | n |
| Limite de computadores | Inteiro de 0 a 999; vazio = não informado; 0 = não tem | Laboratórios do campus têm dezenas, não milhares; o limite barra erro de digitação | n |
| Limite das observações | Até 500 caracteres, quebras de linha permitidas; vazio = não informado | Campo livre para "outros equipamentos" sem virar documento | n |
| Onde editar | Diálogo (no celular ocupa a base da tela, com rolagem interna) | Mantém a lista visível no desktop e cabe em 360 px | n |
| Bloco e andar | Bloco = letra do código no nome (`A-202` → Bloco A); andar = primeiro dígito do código de 3 dígitos; sem código vai para "Outros espaços" / "Sem andar identificado" | Mesma regra de `room-selector.tsx` | n |
| Busca | Mesma busca do seletor de sala da agenda (`matchesRoomSearch`): nome, bloco e andar, sem acento nem caixa, com tolerância a pequenos erros | Comportamento igual nas duas telas | n |
| Ação destrutiva | "Excluir espaço" com confirmação, só para espaço sem ocupações (ativas ou canceladas), sem vínculo com sala do XML e sem linhas de importação | O pedido cita ações destrutivas com confirmação; apagar espaço em uso quebraria reservas e importações | n |
| Edição concorrente | Última gravação vence; a troca de equipamentos é atômica | Um único admin edita na prática; trava otimista não foi pedida | n |
| Edição sem equipamentos ou sem observações no pedido | `equipment` e `notes` são campos independentes: o ausente mantém o valor gravado, o presente o substitui | Chamadas antigas (nome e capacidade) continuam valendo; decisão do orquestrador na validação de 2026-11-04 | y |
| Quem edita | Só o papel `admin` (padrão de `admin-actions.ts`); `horarios` não edita espaços | É a regra atual da tela | y |
| Funcionamento do equipamento | O cadastro registra "tem / não tem / não informado", nunca "funciona" | RF-09 | y |
| Responsável pela atualização dos equipamentos | Fica em aberto; o cadastro só registra o que o admin informar. [PENDENTE: quem mantém os equipamentos atualizados e com que frequência; RF-09 pede responsabilidade definida antes de mostrar o dado na escolha de sala] | Sem fonte; não bloqueia o cadastro, bloqueia só a exibição na agenda | n |

**Open questions:** none - all resolved or logged above (o único item pendente, o responsável pela atualização, fica registrado como `[PENDENTE]` e não bloqueia esta feature).

---

## User Stories

### P1: Ver os espaços organizados ⭐ MVP

**User Story**: Como admin, quero ver os espaços agrupados por bloco e andar, com busca, capacidade e equipamentos visíveis, para achar e conferir uma sala rápido.

**Why P1**: É o ponto de partida de toda edição; a lista plana atual é a principal queixa.

**Acceptance Criteria**:

1. WHEN o admin abre `/admin/espacos` THEN o sistema SHALL agrupar os espaços por bloco ("Bloco A", "Bloco B", … e "Outros espaços" por último) e, dentro do bloco, por andar ("Andar 1", "Andar 2", … e "Sem andar identificado" por último), com nomes em ordem natural dentro do mesmo andar (`A-201 Lab 2` antes de `A-201 Lab 10`; `Sala 2` antes de `Sala 10` em "Sem andar identificado").
2. THE sistema SHALL mostrar em cada espaço a capacidade como "N lugares" ou "Capacidade não informada".
3. THE sistema SHALL mostrar em cada espaço um rótulo por equipamento do catálogo, com texto distinto para cada estado: "Projetor" / "Sem projetor" / "Projetor não informado"; "N computadores" (ou "1 computador") / "Sem computadores" / "Computadores não informados"; "Aparelho de som" / "Sem aparelho de som" / "Aparelho de som não informado".
4. WHEN o espaço tem observações THEN o sistema SHALL mostrá-las no cartão do espaço.
5. WHEN o admin digita na busca THEN o sistema SHALL mostrar só os espaços aceitos por `matchesRoomSearch` e o contador "X de N espaços".
6. IF a busca não encontra nenhum espaço THEN o sistema SHALL mostrar "Nenhum espaço encontrado." e o botão "Limpar busca", que volta a lista completa.
7. WHEN não há espaço cadastrado THEN o sistema SHALL mostrar "Nenhum espaço cadastrado." e o botão "Cadastrar espaço", que abre o diálogo de novo espaço.
8. IF o carregamento da lista falhar THEN o sistema SHALL mostrar "Não foi possível carregar os espaços." e o botão "Tentar de novo", que refaz a carga.
9. WHILE a largura da tela for 360 px the sistema SHALL mostrar a lista e o diálogo sem rolagem horizontal da página, inclusive com nome ou observações longos sem espaço (verificado no navegador: `document.documentElement.scrollWidth` igual a 360 com uma observação de 120 caracteres sem espaço; o teste de componente só afirma as classes de quebra, porque o happy-dom não mede layout).

**Independent Test**: Com 21 salas, abrir `/admin/espacos`, ver "Bloco A > Andar 2 > A-202" com "Capacidade não informada" e "Projetor não informado", buscar "a202" e ver "1 de 21 espaços".

---

### P1: Cadastrar e editar espaço num diálogo ⭐ MVP

**User Story**: Como admin, quero criar e editar um espaço num diálogo com erros mostrados no próprio campo, para corrigir sem perder o que digitei.

**Why P1**: Sem formulário novo não há onde informar equipamentos.

**Acceptance Criteria**:

1. WHEN o admin clica em "Novo espaço" THEN o sistema SHALL abrir o diálogo "Novo espaço" com nome e capacidade vazios, projetor e aparelho de som em "Não informado", computadores e observações vazios.
2. WHEN o admin clica em "Editar" num espaço THEN o sistema SHALL abrir o diálogo "Editar espaço" preenchido com nome, capacidade, equipamentos e observações atuais do espaço.
3. WHEN o admin salva dados válidos THEN o sistema SHALL gravar, fechar o diálogo, recarregar a lista e anunciar "Espaço salvo." numa região `role="status"`.
4. IF o servidor recusa um campo THEN o sistema SHALL manter o diálogo aberto com o que foi digitado, mostrar a mensagem do servidor abaixo do campo, marcá-lo com `aria-invalid="true"`, ligá-lo à mensagem por `aria-describedby` e levar o foco a ele.
5. IF a gravação falha sem campo associado (sessão expirada, rede, 403) THEN o sistema SHALL mostrar a mensagem num alerta no topo do diálogo, sem fechá-lo.
6. WHILE a gravação está em andamento the sistema SHALL desabilitar o botão de salvar e mostrar "Salvando…".
7. WHEN o admin fecha ou cancela o diálogo THEN o sistema SHALL descartar as alterações não salvas, e a próxima abertura SHALL mostrar os dados gravados.
8. THE sistema SHALL manter as regras atuais de nome (aparado, de 1 a 80 caracteres, sem caracteres de controle, único sem diferenciar maiúsculas) e de capacidade (inteiro de 1 a 2000; vazio = não informada).

**Independent Test**: Abrir "Novo espaço", digitar "Lab" e capacidade "0", salvar, ver a mensagem de capacidade no campo com foco nele; corrigir para 30, salvar e ver "Espaço salvo." e o espaço na lista.

---

### P1: Registrar equipamentos por espaço ⭐ MVP

**User Story**: Como admin, quero registrar projetor, computadores, aparelho de som e outros equipamentos de cada espaço, deixando claro o que não sei, para que quem reserva saiba o que a sala tem.

**Why P1**: É o pedido central de dados e a base do RF-09.

**Acceptance Criteria**:

1. THE sistema SHALL registrar para cada espaço: projetor (sim, não ou não informado), computadores (inteiro de 0 a 999 ou não informado), aparelho de som (sim, não ou não informado) e observações (texto de até 500 caracteres; vazio = não informado).
2. THE sistema SHALL guardar cada equipamento informado como uma linha (espaço, tipo, quantidade) e não guardar linha para equipamento não informado.
3. WHEN a migração roda num banco que já tem espaços THEN o sistema SHALL manter todos os espaços com nome e capacidade intactos e lê-los com todos os equipamentos e observações como não informados.
4. IF a quantidade de computadores não for um inteiro de 0 a 999 THEN o sistema SHALL recusar com "A quantidade de computadores deve ser um número inteiro de 0 a 999." no campo `computadores`, sem gravar.
5. IF projetor ou aparelho de som vier com valor diferente de sim (1), não (0) ou não informado (vazio ou nulo) THEN o sistema SHALL recusar com "Escolha sim, não ou não informado." no campo do equipamento (`projetor` ou `som`), sem gravar.
6. IF as observações passarem de 500 caracteres depois de aparadas THEN o sistema SHALL recusar com "As observações devem ter no máximo 500 caracteres." no campo `notes`, sem gravar.
7. IF as observações tiverem caracteres de controle além de quebra de linha e tabulação THEN o sistema SHALL recusar com "As observações contêm caracteres inválidos." no campo `notes`, sem gravar.
8. IF o pedido trouxer um tipo de equipamento fora do catálogo THEN o sistema SHALL recusar com "Tipo de equipamento desconhecido.", sem gravar.
9. WHEN o admin salva um espaço com equipamentos THEN o sistema SHALL gravar nome, capacidade, observações e o conjunto inteiro de equipamentos numa única unidade atômica (batch no D1, transação no bun:sqlite), substituindo o conjunto anterior.
10. WHEN uma edição chega THEN o sistema SHALL tratar equipamentos (`equipment`) e observações (`notes`) como campos independentes: o campo ausente do pedido mantém o valor gravado e o campo presente o substitui. Sem equipamentos nem observações, mantém os dois; só com observações, mantém os equipamentos; só com equipamentos, mantém as observações. (O diálogo sempre envia os dois.)

**Independent Test**: Editar A-202 com projetor "Sim", 0 computadores, som "Não informado" e observação "Lousa digital"; recarregar e ver "Projetor", "Sem computadores", "Aparelho de som não informado" e "Lousa digital".

---

### P1: Só admin altera espaços ⭐ MVP

**User Story**: Como responsável pelo sistema, quero que só administradores alterem espaços, verificando no servidor, para que ninguém mude o cadastro chamando a função direto.

**Why P1**: Regra de acesso atual (RF-07) que a feature não pode enfraquecer.

**Acceptance Criteria**:

1. IF quem chama listar (administração), criar, editar ou excluir espaço não tem sessão THEN o sistema SHALL responder 401 "É preciso entrar." sem gravar.
2. IF quem chama tem sessão sem o papel `admin` THEN o sistema SHALL responder 403 "Sem permissão para esta ação." sem gravar.
3. IF o corpo do pedido tiver formato inválido (equipamentos que não são objeto, valor de equipamento que não é texto, número ou nulo, observações que não são texto nem nulo, exclusão sem `id` em texto) THEN o sistema SHALL responder 400 "Requisição inválida." sem gravar.

**Independent Test**: Chamar a ação de editar espaço com sessão de docente e receber 403; o espaço fica como estava.

---

### P2: Excluir espaço sem uso, com confirmação

**User Story**: Como admin, quero excluir um espaço cadastrado por engano, com confirmação, sem risco de apagar reservas ou aulas.

**Why P2**: Limpa erros de cadastro; não é necessário para registrar equipamentos.

**Acceptance Criteria**:

1. WHEN o admin clica em "Excluir" num espaço THEN o sistema SHALL abrir a confirmação "Excluir {nome}?" com os botões "Excluir espaço" e "Cancelar", sem chamar o servidor.
2. WHEN o admin cancela a confirmação THEN o sistema SHALL fechá-la sem chamar o servidor.
3. WHEN o admin confirma e o espaço não tem ocupações (ativas ou canceladas), vínculo com sala do XML nem linhas de importação THEN o sistema SHALL apagar o espaço e seus equipamentos, recarregar a lista e anunciar "Espaço excluído." numa região `role="status"`.
4. IF o espaço tem ocupações, vínculo com sala do XML ou linhas de importação THEN o sistema SHALL responder 409 "Este espaço tem reservas, aulas ou vínculo com o XML e não pode ser excluído." e não apagar nada.
5. IF o espaço não existe mais THEN o sistema SHALL responder 404 "Espaço não encontrado.".
6. IF a exclusão é recusada THEN o sistema SHALL mostrar a mensagem do servidor num alerta dentro da confirmação, sem fechá-la.
7. WHILE a exclusão está em andamento the sistema SHALL desabilitar o botão "Excluir espaço" e mostrar "Excluindo…".

**Independent Test**: Criar "Sala teste", excluir, confirmar e ver "Espaço excluído."; tentar excluir A-202 (com aulas) e ver a mensagem de recusa.

---

### P2: Equipamentos na consulta de espaços da agenda

**User Story**: Como equipe do projeto, quero que a consulta de espaços usada pela agenda já traga os equipamentos, para que a tela da agenda possa mostrá-los depois do merge da `visao-geral` sem nova mudança no servidor.

**Why P2**: Prepara o RF-09 na escolha de sala, mas nenhuma tela usa o dado agora.

**Acceptance Criteria**:

1. WHEN a agenda pede a lista de espaços (`listSpaces`) THEN o sistema SHALL devolver cada espaço com `id`, `name` e `capacity` como antes e com `equipment` contendo os itens informados e as observações.
2. THE tipo `Space` SHALL declarar `equipment` como opcional, de modo que código que constrói espaços só com `id`, `name` e `capacity` continue compilando e funcionando.
3. THE consulta `list()` do repositório SHALL continuar devolvendo só `id`, `name` e `capacity`.

**Independent Test**: Gravar equipamentos num espaço e conferir que `listWithEquipment()` os devolve e que `list()` devolve o mesmo formato de antes.

---

## Edge Cases

- WHEN a quantidade de computadores vem como texto com espaços (" 12 ") THEN o sistema SHALL gravar 12.
- WHEN a quantidade de computadores vem vazia ou só com espaços THEN o sistema SHALL tratá-la como não informada.
- WHEN as observações vêm só com espaços THEN o sistema SHALL tratá-las como não informadas (`null`).
- IF o nome do espaço não tem código de bloco THEN o sistema SHALL listá-lo em "Outros espaços" > "Sem andar identificado".
- IF o admin exclui um espaço já excluído em outra aba THEN o sistema SHALL mostrar "Espaço não encontrado." na confirmação.
- IF a gravação dos equipamentos falha no meio THEN o sistema SHALL desfazer também a mudança de nome, capacidade e observações (nada parcial).
- IF o banco tiver uma linha de equipamento com tipo fora do catálogo THEN o sistema SHALL ignorá-la na leitura.

### Implicit-requirement sweep

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | P1 equipamentos AC 4–8; P1 diálogo AC 8; P1 acesso AC 3 |
| Failure / partial-failure states | P1 equipamentos AC 9; edge case de falha no meio; P1 lista AC 8; P1 diálogo AC 5 |
| Idempotency / retry / duplicate handling | Salvar substitui o conjunto inteiro (repetir dá o mesmo estado); excluir de novo responde 404 (P2 AC 5) |
| Auth boundaries & rate limits | P1 acesso AC 1–2; limite de taxa N/A porque só admins autenticados chamam e o projeto não limita ações administrativas |
| Concurrency / ordering | Última gravação vence (assumption); exclusão condicional numa só instrução (P2 AC 3–4) |
| Data lifecycle / expiry | Excluir apaga os equipamentos junto (P2 AC 3); sem expiração |
| Observability | N/A porque o projeto não registra ações administrativas hoje (Out of Scope) |
| External-dependency failure | N/A porque a feature não chama serviço externo |
| State-transition integrity | N/A porque espaço não tem estados |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ESPACOS-01 | P1: Ver os espaços (AC 1) | Validate | Needs Fix |
| ESPACOS-02 | P1: Ver os espaços (AC 2, 3, 4) | Validate | Verified |
| ESPACOS-03 | P1: Ver os espaços (AC 5, 6, 7) | Validate | Verified |
| ESPACOS-04 | P1: Ver os espaços (AC 8, 9) | Validate | Needs Fix |
| ESPACOS-05 | P1: Diálogo (AC 1, 2, 7) | Validate | Verified |
| ESPACOS-06 | P1: Diálogo (AC 3, 4, 5, 6) | Validate | Needs Fix |
| ESPACOS-07 | P1: Diálogo (AC 8) | Validate | Verified |
| ESPACOS-08 | P1: Equipamentos (AC 1, 4, 5, 6, 7, 8) | Validate | Verified |
| ESPACOS-09 | P1: Equipamentos (AC 2, 3) | Validate | Verified |
| ESPACOS-10 | P1: Equipamentos (AC 9, 10) | Validate | Needs Fix |
| ESPACOS-11 | P1: Acesso (AC 1, 2, 3) | Validate | Needs Fix |
| ESPACOS-12 | P2: Excluir (AC 3, 4, 5) | Validate | Needs Fix |
| ESPACOS-13 | P2: Excluir (AC 1, 2, 6, 7) | Validate | Verified |
| ESPACOS-14 | P2: Agenda (AC 1, 2, 3) | Validate | Verified |

**Coverage:** 14 total, 14 mapped to tasks, 0 unmapped. Validação de 2026-11-04 (`validation.md`): 8 Verified, 6 Needs Fix.

---

## Success Criteria

- [ ] Editar os equipamentos de uma sala leva no máximo 3 interações a partir de `/admin/espacos` (busca, "Editar", "Salvar"), sem contar o preenchimento dos campos.
- [ ] Em 360 px a página não rola na horizontal, nem com o diálogo aberto.
- [ ] Nenhum espaço existente perde dados na migração; todos aparecem com equipamentos "não informados".

## Próximo passo (fora desta feature)

Depois do merge com `visao-geral`: mostrar `equipment` no seletor de sala, em `/salas` e na reserva (RF-09), usando `describeEquipment` e respeitando o `[PENDENTE]` sobre o responsável pela atualização. Unificar a regra de andar de `room-selector.tsx` com `floorOf` do domínio.

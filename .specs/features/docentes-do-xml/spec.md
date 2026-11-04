# Docentes do XML: especificação

## Problem Statement

Das 2945 ocupações importadas, só 80 têm responsável, porque só 2 dos 45 docentes do XML têm conta. A agenda não mostra quem dá cada aula e o docente não consegue cancelar a própria aula. O usuário quer uma conta para cada docente do XML, com avatar na agenda, e resolver as contas reais depois na administração.

## Goals

- [ ] Toda aula importada com docente no XML passa a ter responsável.
- [ ] A agenda mostra o avatar com iniciais do responsável em cada aula, para quem está logado.
- [ ] O admin transforma uma conta fantasma em conta real, ou a funde numa conta existente, sem perder as aulas vinculadas.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Foto do docente | O usuário escolheu iniciais agora e foto depois. |
| Ler e-mail, celular, gênero ou cor do XML | Continuam fora pela AD-001; o XML real nem tem e-mail preenchido. |
| Enviar convite ou senha por e-mail | Não há canal de envio definido. |
| Vários responsáveis por aula | O modelo guarda um responsável (o primeiro docente vinculado, na ordem do XML). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Nome lido do XML | `name`; se vazio, `firstname` + `lastname`; se ambos vazios, a sigla | O XML real tem `name` nos 45 docentes | y |
| E-mail presumido | `primeiro.ultimo@ifsc.edu.br`, sem acentos e em minúsculas; colisão ganha sufixo `2`, `3`… | O usuário autorizou chutar porque ainda não é produção; o domínio segue o padrão do IFSC | y |
| Acesso da fantasma | Não entra: o login responde como senha errada | A fantasma não tem dono confirmado; ninguém deve entrar por ela | n |
| Quando cria fantasmas | No passo de docentes da importação, todo docente sem vínculo vem marcado como "Criar conta fantasma"; o usuário pode trocar por uma conta existente ou "Sem responsável" | O usuário pediu que os próximos XMLs também gerem fantasmas | y |
| Aulas já importadas | Ação "Atualizar responsáveis" na versão aplicada, que pede o mesmo XML de novo e reaplica os vínculos atuais às ocupações importadas ativas do semestre | O lote não guarda os docentes de cada aula, e reimportar o mesmo arquivo é reconhecido pelo hash e não replaneja | n |
| Sigla duplicada | A fantasma recebe a sigla como código só se nenhuma conta já usa esse código; senão fica sem código | `users.code` é único | n |
| Fusão | Fundir move as ocupações e os vínculos do XML da fantasma para a conta escolhida e apaga a fantasma | Evita contas duplicadas para a mesma pessoa | n |
| Avatar para visitante | Não aparece | Iniciais também identificam a pessoa | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Criar contas fantasmas na importação ⭐ MVP

**User Story**: Como responsável por horários, quero que cada docente do XML sem conta ganhe uma conta fantasma na importação, para que todas as aulas tenham responsável.

**Why P1**: Sem isso não há quem mostrar na agenda.

**Acceptance Criteria**:

1. WHEN o XML é lido THEN o sistema SHALL guardar no DTO de cada docente o `id`, a `short` e o nome, e SHALL descartar e-mail, celular, gênero e cor.
2. WHEN o passo de docentes abre THEN o sistema SHALL marcar como "Criar conta fantasma" todo docente sem vínculo salvo e sem sugestão por sigla ou código.
3. WHEN os vínculos de docentes são salvos com docentes marcados como "Criar conta fantasma" THEN o sistema SHALL criar uma conta por docente com o nome do XML, o e-mail presumido, a sigla como código, papel `docente` e a marca de fantasma, e SHALL salvar o vínculo do docente com essa conta.
4. WHEN dois docentes geram o mesmo e-mail presumido THEN o sistema SHALL usar sufixo numérico no segundo (`ana.silva2@ifsc.edu.br`).
5. IF o mesmo XML for importado de novo THEN o sistema SHALL reutilizar as fantasmas já vinculadas e SHALL NOT criar duplicatas.
6. IF salvar os vínculos falhar THEN o sistema SHALL NOT deixar nenhuma conta fantasma nem vínculo gravado daquele envio.

**Independent Test**: Importar o XML do 2º semestre numa base com só Ryan e Fabiana e conferir 43 contas fantasmas e todas as aulas com docente no XML com responsável.

---

### P1: Avatar do responsável na agenda ⭐ MVP

**User Story**: Como usuário logado, quero ver o avatar com as iniciais do responsável em cada aula da agenda para saber de quem é a aula sem abrir os detalhes.

**Why P1**: É o pedido visível do usuário.

**Acceptance Criteria**:

1. WHILE o usuário estiver logado the sistema SHALL mostrar no cartão de cada ocupação com responsável o avatar com as iniciais e a cor estável do componente `Avatar`.
2. WHEN o cartão é baixo demais para o nome (menos de 54 px) THEN o sistema SHALL mostrar só o avatar, com o nome completo no rótulo acessível.
3. WHILE o usuário for visitante the sistema SHALL NOT mostrar avatar, iniciais nem nome.
4. WHERE a ocupação é avulsa the sistema SHALL mostrar o avatar de quem fez a reserva.
5. WHEN o responsável é uma conta fantasma THEN o sistema SHALL mostrar o avatar normalmente e, nos detalhes da aula, a marca "conta não ativada".

**Independent Test**: Logado, abrir a agenda da A-202 e ver o avatar nas aulas; sair e confirmar que os avatares somem.

---

### P1: Atualizar responsáveis das aulas já importadas ⭐ MVP

**User Story**: Como admin, quero reaplicar os vínculos de docentes ao lote já aplicado para que as aulas atuais ganhem responsável sem reimportar.

**Why P1**: O semestre atual já está aplicado com só 80 aulas com responsável.

**Acceptance Criteria**:

1. WHEN o admin aciona "Atualizar responsáveis" na versão aplicada de um semestre e envia o mesmo XML dessa versão THEN o sistema SHALL definir o responsável de cada ocupação importada ativa do semestre conforme os vínculos atuais, aula por aula.
2. THE sistema SHALL NOT alterar reservas avulsas nem ocupações canceladas nessa ação.
3. WHEN a ação termina THEN o sistema SHALL mostrar quantas ocupações mudaram de responsável e quantas continuam sem responsável.
4. IF quem aciona não for admin nem responsável por horários THEN o sistema SHALL recusar com 403.
5. IF o XML enviado não tiver o mesmo hash da versão aplicada THEN o sistema SHALL recusar com "Envie o mesmo arquivo da versão aplicada" e SHALL NOT alterar nenhuma ocupação.
6. IF a ação for repetida THEN o sistema SHALL chegar ao mesmo resultado, sem efeito extra.

**Independent Test**: Na cópia de produção, acionar no lote do 2º semestre e ver o número de ocupações com responsável subir de 80 para perto de 2945.

---

### P2: Ativar ou fundir conta fantasma

**User Story**: Como admin, quero ativar uma conta fantasma com e-mail e senha reais, ou fundi-la numa conta existente, para que o docente entre e gerencie as próprias aulas.

**Why P2**: As fantasmas já resolvem a agenda; ativar é o passo seguinte.

**Acceptance Criteria**:

1. WHEN o admin abre Administração > Contas THEN o sistema SHALL marcar as fantasmas com "Não ativada" e permitir filtrar só elas.
2. WHEN o admin ativa uma fantasma informando e-mail e senha válidos THEN o sistema SHALL remover a marca de fantasma e permitir login com esses dados.
3. IF o e-mail informado já pertencer a outra conta THEN o sistema SHALL recusar com "Este e-mail já está em uso".
4. WHEN o admin funde uma fantasma numa conta existente THEN o sistema SHALL transferir para a conta escolhida as ocupações em que a fantasma é responsável e os vínculos do XML, e SHALL apagar a fantasma.
5. IF a conta escolhida para a fusão for outra fantasma ou estiver inativa THEN o sistema SHALL recusar a fusão.
6. WHILE uma conta for fantasma, IF alguém tentar entrar com o e-mail dela THEN o sistema SHALL responder com a mesma mensagem de credencial inválida.

**Independent Test**: Fundir a fantasma "RYAN" na conta do Ryan e ver as aulas dele mantidas com Ryan como responsável.

---

## Edge Cases

- IF o docente do XML não tiver nome nem sigla THEN o sistema SHALL usar "Docente sem nome" e o e-mail `docente.ID@ifsc.edu.br`.
- IF o nome tiver uma só palavra THEN o sistema SHALL usar `palavra@ifsc.edu.br` como e-mail presumido.
- WHEN o docente já tem vínculo salvo com uma conta real THEN o sistema SHALL manter esse vínculo e SHALL NOT criar fantasma.
- IF a aula tiver vários docentes THEN o sistema SHALL usar como responsável o primeiro docente com vínculo, na ordem do XML.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| DOC-01 | P1: Fantasmas (AC 1) | 1 | Done |
| DOC-02 | P1: Fantasmas (AC 2) | 2 | Done |
| DOC-03 | P1: Fantasmas (AC 3, 4) | 1-2 | Done |
| DOC-04 | P1: Fantasmas (AC 5, 6) | 2 | Done |
| DOC-05 | P1: Avatar (AC 1, 2, 4) | 3 | Done |
| DOC-06 | P1: Avatar (AC 3) | 3 | Done |
| DOC-07 | P1: Avatar (AC 5) | 3 | Done |
| DOC-08 | P1: Atualizar responsáveis (AC 1, 2, 3, 6) | 3 | Done |
| DOC-09 | P1: Atualizar responsáveis (AC 4, 5) | 3 | Done |
| DOC-10 | P2: Ativar ou fundir (AC 1, 2, 3, 6) | 1 | In Progress |
| DOC-11 | P2: Ativar ou fundir (AC 4, 5) | - | Pending |

**Coverage:** 11 total, 0 mapped to tasks, 11 unmapped ⚠️

---

## Success Criteria

- [ ] Depois de "Atualizar responsáveis", toda ocupação importada ativa cuja aula tem docente no XML tem responsável.
- [ ] Nenhuma conta fantasma consegue abrir sessão.
- [ ] Visitante não recebe nome, iniciais nem código de pessoas em nenhuma resposta.

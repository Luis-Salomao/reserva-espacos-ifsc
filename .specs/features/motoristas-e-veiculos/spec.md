# Motoristas e veículos: especificação

**Status**: Rascunho. Nenhuma regra desta spec tem fonte. O usuário disse que já descreveu esta necessidade antes, mas não há registro no repositório nem nas conversas acessíveis. Todos os defaults abaixo são NÃO confirmados e nada deve ser desenhado nem implementado antes de o usuário responder às perguntas abertas.

## Problem Statement

O campus precisa reservar veículos (carro, van, ônibus) e motoristas, hoje fora do sistema. [PENDENTE: como isso é feito hoje, por quem, e qual problema concreto o usuário quer resolver; não há entrevista nem documento sobre o assunto.] O usuário também citou "agendar computador na biblioteca" como recurso futuro, o que pede um modelo de recurso agendável que não seja só "espaço".

## Goals

- [ ] Cadastrar veículos e motoristas na administração, como hoje se cadastram espaços.
- [ ] Reservar um veículo (com ou sem motorista) para uma saída com data, horário de saída e de volta e destino, sem dupla reserva.
- [ ] Ver a agenda de cada veículo e de cada motorista.
- [ ] Deixar o modelo pronto para outros tipos de recurso agendável (ex.: computador da biblioteca) sem reescrever reservas.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Computadores da biblioteca | Citado como exemplo futuro; só o modelo precisa permitir |
| Controle de combustível, quilometragem e manutenção | Não citado |
| Integração com sistemas do IFSC (SUAP, frota) | Sem fonte; regra do projeto é não integrar login institucional nesta versão |
| Diárias, horas extras e escala de trabalho do motorista | Assunto de RH, não de reserva |
| Rastreamento do veículo | Não citado |
| Guardar número da CNH ou documentos do motorista | Dado pessoal sensível; só a categoria, se o usuário confirmar (pergunta 9) |

---

## Assumptions & Open Questions

Todos os itens abaixo são suposições do agente, sem fonte.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Quem cadastra veículos e motoristas | Só `admin` | Mesmo padrão dos espaços | n (NÃO confirmado) |
| Quem pode pedir reserva de veículo | Docente e admin (papéis atuais que reservam espaços) | Reaproveita RF-07 | n (NÃO confirmado) |
| Precisa de aprovação | Sim: o pedido nasce "pendente" e um aprovador confirma ou recusa | Veículo e motorista costumam ter custo e escala; a reserva de espaço não tem aprovação | n (NÃO confirmado) |
| Quem aprova | `admin` [PENDENTE: papel próprio, ex. "transporte"?] | Não há papel de transporte hoje | n (NÃO confirmado) |
| Motorista e veículo juntos | Reserva de veículo pede motorista por padrão; o aprovador escolhe o motorista | Ônibus e van exigem motorista do campus | n (NÃO confirmado) |
| Veículo sem motorista do campus (servidor dirige) | Permitido só para veículos marcados "pode ser dirigido pelo solicitante" | Comum em carros pequenos | n (NÃO confirmado) |
| Dados da saída | Data e hora de saída, data e hora de volta prevista, destino (texto), finalidade (texto), número de passageiros | Mínimo para decidir veículo e motorista | n (NÃO confirmado) |
| Viagem de vários dias | Permitida (volta em outro dia) | Visitas técnicas costumam durar mais de um dia | n (NÃO confirmado) |
| Capacidade de passageiros | Cada veículo tem lugares; o pedido recusa passageiros acima disso | Evita pedir ônibus para 60 numa van | n (NÃO confirmado) |
| Categoria de CNH | Motorista tem categoria (B, C, D, E); veículo exige categoria mínima; o sistema não deixa escalar motorista sem a categoria | Regra de trânsito; sem número de documento | n (NÃO confirmado) |
| Conflito | Veículo e motorista não podem ter duas reservas confirmadas que se sobreponham | Mesma regra das ocupações de espaço | n (NÃO confirmado) |
| Intervalo entre viagens | Nenhum intervalo mínimo | Sem regra conhecida | n (NÃO confirmado) |
| Cancelamento | Solicitante cancela a própria; admin cancela qualquer uma, com motivo | Mesma regra das reservas de espaço | n (NÃO confirmado) |
| Visitante | Não vê reservas de veículo nem nomes de motoristas | Dados de pessoas; mais restrito que a agenda de salas | n (NÃO confirmado) |
| Motorista tem conta no sistema | Não: motorista é um cadastro, não um usuário | Não se sabe se motoristas usam o sistema | n (NÃO confirmado) |
| Modelo genérico | Tabela `resources` (tipo: espaço, veículo, motorista, futuramente computador) e reservas apontando para recurso | Atende ao pedido de recurso agendável sem reescrever tudo depois | n (NÃO confirmado) |

**Open questions:** abertas; precisam de resposta do usuário antes do design.

1. Quem pode pedir veículo: qualquer docente, só coordenadores, técnicos administrativos também?
2. Precisa de aprovação? Se sim, quem aprova (admin, setor de transporte, direção)?
3. Motorista e veículo são reservados juntos, ou dá para reservar só motorista (com carro de outro lugar) ou só veículo (servidor dirige)?
4. Que dados a saída precisa: destino, finalidade, lista de passageiros, ponto de saída, horário de volta?
5. Existem viagens de vários dias? E viagens recorrentes (toda semana)?
6. Quais veículos existem (tipos e lugares) e quantos motoristas?
7. É preciso limitar passageiros pela capacidade do veículo?
8. Deve haver intervalo mínimo entre viagens do mesmo motorista ou veículo (descanso, limpeza)?
9. Precisa registrar a categoria de CNH do motorista e a exigida pelo veículo? Algo além disso (vencimento)?
10. Motorista deve ter conta no sistema para ver a própria agenda?
11. Quem vê a agenda de veículos e motoristas? Visitantes veem algo?
12. Como é feito hoje (planilha, e-mail, papel) e há dados a importar?
13. Para computadores da biblioteca no futuro: reserva por horário como sala, ou por empréstimo?

---

## User Stories

### P1: Cadastrar veículos ⭐ MVP

**User Story**: Como admin, quero cadastrar os veículos do campus com tipo, placa ou apelido e lugares, para que possam ser reservados.

**Why P1**: Sem cadastro não há o que reservar.

**Acceptance Criteria**:

1. WHEN o admin salva um veículo com nome (1 a 80 caracteres, único), tipo (carro, van, ônibus, outro) e lugares (inteiro de 1 a 99 ou não informado) THEN o sistema SHALL gravá-lo e listá-lo na administração.
2. IF quem chama não tem o papel `admin` THEN o sistema SHALL responder 403 sem gravar.
3. WHERE a categoria de CNH estiver habilitada the sistema SHALL guardar a categoria mínima exigida pelo veículo.

**Independent Test**: Cadastrar "Van 1", tipo van, 15 lugares, e vê-la na lista.

---

### P1: Cadastrar motoristas ⭐ MVP

**User Story**: Como admin, quero cadastrar os motoristas com nome e categoria de CNH, para escalá-los nas saídas.

**Why P1**: A reserva de veículo depende de motorista (default não confirmado).

**Acceptance Criteria**:

1. WHEN o admin salva um motorista com nome (1 a 120 caracteres) THEN o sistema SHALL gravá-lo e listá-lo na administração.
2. WHERE a categoria de CNH estiver habilitada the sistema SHALL guardar a categoria (B, C, D ou E) sem número de documento.
3. WHEN o admin desativa um motorista THEN o sistema SHALL impedir novas escalas dele e manter as saídas passadas.

**Independent Test**: Cadastrar "Motorista A", categoria D, e vê-lo na lista.

---

### P1: Pedir e confirmar uma saída de veículo ⭐ MVP

**User Story**: Como docente, quero pedir um veículo para uma saída com destino e horários, para levar uma turma ou ir a um compromisso.

**Why P1**: É o uso central.

**Acceptance Criteria**:

1. WHEN o docente envia um pedido com veículo, data e hora de saída, data e hora de volta, destino, finalidade e passageiros THEN o sistema SHALL gravá-lo como "pendente".
2. IF a volta não for depois da saída THEN o sistema SHALL recusar com "A volta precisa ser depois da saída.".
3. IF os passageiros passarem dos lugares do veículo THEN o sistema SHALL recusar com "O veículo tem N lugares.".
4. WHEN o aprovador confirma o pedido escolhendo um motorista THEN o sistema SHALL marcar a saída como "confirmada" só se veículo e motorista estiverem livres no intervalo inteiro, numa única instrução condicional.
5. IF o veículo ou o motorista já tiver saída confirmada sobreposta THEN o sistema SHALL recusar a confirmação e mostrar a saída que conflita.
6. IF o motorista não tiver a categoria exigida pelo veículo THEN o sistema SHALL recusar a escala.
7. WHEN o aprovador recusa o pedido THEN o sistema SHALL marcá-lo como "recusado" com motivo.

**Independent Test**: Pedir "Van 1" de 08:00 a 18:00 para 12 passageiros, confirmar com "Motorista A" e ver a saída confirmada; um segundo pedido sobreposto não pode ser confirmado com a mesma van.

---

### P2: Ver a agenda de veículos e motoristas

**User Story**: Como admin, quero ver a agenda da semana por veículo e por motorista, para planejar as saídas.

**Why P2**: Útil para planejar, mas o pedido e a confirmação já funcionam sem ela.

**Acceptance Criteria**:

1. WHEN o admin abre a agenda de um veículo THEN o sistema SHALL mostrar as saídas confirmadas e pendentes da semana, com estado em texto.
2. WHEN o admin abre a agenda de um motorista THEN o sistema SHALL mostrar as saídas confirmadas em que ele está escalado.
3. WHILE o usuário não está logado the sistema SHALL esconder a agenda de veículos e motoristas.

**Independent Test**: Abrir a agenda da "Van 1" e ver a saída confirmada da semana.

---

### P3: Outros recursos agendáveis

**User Story**: Como equipe do projeto, quero que veículo e motorista sejam casos de um "recurso agendável", para cadastrar depois computadores da biblioteca sem reescrever reservas.

**Why P3**: Não há pedido concreto ainda; é restrição de modelo.

**Acceptance Criteria**:

1. THE sistema SHALL registrar reservas de veículo e motorista contra um recurso com tipo, e não em tabelas de reserva separadas por tipo.
2. THE sistema SHALL permitir um tipo de recurso novo sem nova tabela de reservas.

**Independent Test**: Revisão do modelo de dados no design.

---

## Esboço de modelo de dados (não aprovado)

```text
resources            id, kind ('espaco' | 'veiculo' | 'motorista' | futuro 'computador'), name, active, created_at
resource_attributes  resource_id, key, value   -- ex.: veiculo.lugares, veiculo.categoria_cnh, motorista.categoria_cnh
                                               -- (ou a forma de space_equipment: resource_id, kind, quantity; ver AD-003)
trips                id, requested_by, starts_at, ends_at, destination, purpose, passengers, status ('pendente' | 'confirmada' | 'recusada' | 'cancelada'), decided_by, decided_at, reason
trip_resources       trip_id, resource_id      -- veículo e motorista da saída; conflito = mesmo resource_id com trip confirmada sobreposta
```

Caminhos possíveis para espaços: (a) `spaces` vira `resources` com `kind = 'espaco'` e `occupations.space_id` passa a `resource_id` (migração grande, risco alto com a importação do XML); (b) `spaces` fica como está e `resources` cobre só os tipos novos, com a agenda unindo as duas fontes. [PENDENTE: escolher no design depois das respostas; (b) é o default de menor risco.]

---

## Edge Cases

- IF o veículo for excluído ou desativado com saídas futuras confirmadas THEN o sistema SHALL recusar a desativação e listar as saídas.
- WHEN a saída atravessa a meia-noite THEN o sistema SHALL tratá-la como um intervalo único.
- IF dois aprovadores confirmam pedidos sobrepostos ao mesmo tempo THEN o sistema SHALL confirmar só um.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FROTA-01 | P1: Cadastrar veículos | - | Pending |
| FROTA-02 | P1: Cadastrar motoristas | - | Pending |
| FROTA-03 | P1: Pedir e confirmar saída (AC 1, 2, 3) | - | Pending |
| FROTA-04 | P1: Pedir e confirmar saída (AC 4, 5, 6, 7) | - | Pending |
| FROTA-05 | P2: Agenda de veículos e motoristas | - | Pending |
| FROTA-06 | P3: Outros recursos agendáveis | - | Pending |

**Coverage:** 6 total, 0 mapped to tasks (rascunho).

---

## Success Criteria

- [ ] [PENDENTE: definir com o usuário depois das respostas; ex. "pedir um veículo leva menos de 2 minutos" não tem base hoje.]

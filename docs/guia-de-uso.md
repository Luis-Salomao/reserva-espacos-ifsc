# Guia de uso

O que cada tela faz e como os fluxos principais funcionam. Instalação e publicação estão em [instalação e operação](instalacao-e-operacao.md).

## Prévia de importação do aSc Horários

```bash
bun run cli import-preview <arquivo.xml> [--json] [--full]
```

Lê o XML exportado pelo aSc Horários e imprime um resumo em português (contagens, horários semanais por situação de sala, sobreposições, durações usadas, avisos agrupados e salas). **Não grava nada** no banco. Com `--json` imprime a prévia sem a grade completa; `--full` inclui `timetable`, `slots` e `overlapsDetail`. O resumo não contém dados pessoais de docentes. Arquivos reais ficam em `data/real/` (fora do Git); o teste `src/import-asc/real-file.test.ts` os usa se existirem e imprime só contagens.

## Importação da grade (passo a passo)

Quem tem o papel `admin` ou `horarios` importa em **Importar grade** (`/importar`). Antes, cadastre o semestre (com as datas de cada duração) em **Semestres** e os espaços em **Administração**.

1. **Prévia**: envie o XML; nada é salvo e o arquivo nunca é guardado (o lote guarda só o hash e o resumo).
2. **Semestre**: escolha o semestre. O aviso mostra durações usadas pelo arquivo que não têm datas nele (essas aulas ficam "não aplicáveis").
3. **Salas**: vincule cada sala do arquivo a um espaço existente, crie um espaço com o nome dela ou ignore-a. Sala sem vínculo deixa suas aulas não aplicáveis. Vínculos salvos voltam pré-preenchidos.
4. **Docentes**: o responsável é a conta do primeiro docente da aula que tiver vínculo; a sugestão compara a sigla com o código da conta.
5. **Conferência**: prepara o lote em passos (com barra de progresso) e mostra as contagens por estado e motivo. Enviar o mesmo arquivo de novo no mesmo semestre é reconhecido: nada é duplicado.
6. **Aplicação**: cria as ocupações em passos; se for interrompida, aplique de novo e ela continua de onde parou. Conflitos com ocupações existentes são listados e nunca inseridos.

### Nova versão da grade

Se o semestre já tem um lote aplicado, enviar um arquivo diferente cria uma **nova versão**: a conferência compara o arquivo com as ocupações importadas vigentes e mostra "Nova versão da grade" com os cartões **Inclusões**, **Alterações**, **Bloqueadas**, **Remoções**, **Inalteradas**, **Canceladas mantidas** e **Troca de responsável**, além de "Responsáveis afetados" (nomes das contas locais, para avisar quem tiver aula mexida). Clique num cartão para ver só aquele tipo na tabela; as alterações aparecem lado a lado, "antes → depois", por aula e data.

- **Aplicar mudanças** cancela as ocupações removidas ou alteradas (status `cancelada`, motivo "nova versão"; nada é apagado) e cria as novas. Reservas avulsas nunca são alteradas; uma inclusão que cai sobre uma reserva avulsa vira conflito. Cancelamentos feitos à mão antes continuam cancelados.
- **Alteração bloqueada**: se a nova ocorrência conflita, a versão anterior daquela aula continua ativa e nada daquele grupo é cancelado.
- **Um lote em andamento por semestre.** Enquanto houver um lote `aplicando` ou interrompido (`falhou`), preparar ou aplicar outro é recusado com um aviso e um link para o lote em andamento, com **Retomar** ou **Descartar**. Se outra versão for aplicada depois do seu preparo, a conferência é recusada ("envie o arquivo novamente").
- **Descartar lote** (em `/importar/lotes`, no detalhe do lote e no aviso acima) apaga um lote ainda não aplicado, com confirmação. Vale para lotes preparando e aguardando aplicação, e para os interrompidos só se nada foi aplicado; senão, retome a aplicação.
- Depois de aplicar, o resultado mostra as ocupações canceladas e criadas, trocas de responsável, bloqueadas, conflitos e falhas. A lista de lotes mostra "Nova versão de <data>".

**Limitações conhecidas:** a identidade de uma aula entre versões é o **título (disciplina + turmas) e a data**; os ids do aSc não são usados. Por isso, uma disciplina ou turma renomeada aparece como remoção mais inclusão. Aulas com várias salas continuam "não aplicáveis". Nenhum aviso é enviado aos responsáveis afetados (só a lista); isso vem em fase futura. Se a aula já aplicada passa a ter, na nova versão, horário não aplicável (várias salas, sala sem vínculo, duração sem datas...), as ocupações dela são **seguradas** (não canceladas) e aparecem como alteração bloqueada; só a sala marcada para ignorar continua cancelando. **Voltar a uma versão anterior (rollback) ainda não é suportado:** reenviar o arquivo de uma versão já substituída apenas informa isso; para reaplicá-la, gere uma nova exportação.

O **resultado por linha** (cada aula/ocorrência com estado, motivo, conflito e falha, com filtros, busca e paginação) aparece ao fim e também em **Lotes anteriores** (`/importar/lotes`).

## Reservas: edição, seleção e horários parciais

Em **Minhas reservas**, o botão **Editar** permite alterar sala, data, início, fim e finalidade de uma reserva manual própria que ainda não começou. A edição preserva o identificador e, quando houver, o vínculo com a série; somente a ocorrência escolhida muda. Aulas importadas e reservas de outras pessoas não são editáveis por esse fluxo. Se o horário entrar em conflito, a reserva anterior permanece intacta.

Em **Minhas reservas** (celular), o texto ocupa a largura do card e as ações ficam abaixo dele. Uma série que atravessa meses aparece em cada mês, com contagem e "Próxima" próprias.

## Minha agenda

**Minha agenda** (`/minha-agenda`, para docentes e administradores) mostra numa grade semanal as ocupações da pessoa em todas as salas: aulas importadas em que ela é responsável e reservas que ela criou. O cartão mostra a sala.

- **Filtro "Disciplina":** agrupa as reservas futuras pelo título, sem diferenciar maiúsculas, acentos, espaços e tipos de traço (`-`, `–`, `—`). Escolhe-se, por exemplo, só "Cultura Digital - LAZ" para ver as datas daquela unidade curricular.
- **Semana / Todas as datas:** com uma disciplina escolhida, "Todas as datas" lista as ocorrências futuras (até cerca de seis meses) com **Desmarcar** em cada uma, para liberar os dias em que a sala ou o laboratório não será usado.
- **Clique numa ocorrência:** abre os detalhes. Reserva manual própria e futura pode ser editada (só esta data ou esta e as próximas, quando é série) ou cancelada. Aula importada só pode ser desmarcada naquela data; não é movida nem editada. Ocorrências passadas aparecem sem ações.
- Filtro, semana e modo ficam na URL (`semana`, `disciplina`, `modo`), então o link pode ser guardado.
- No celular a grade rola dentro do próprio quadro; a página não rola na horizontal.

Ainda não é possível arrastar ou redimensionar uma reserva na grade.

## Reservas recorrentes e visão geral

Na confirmação de uma reserva recorrente, as datas livres começam marcadas. Desmarque as datas que não deseja reservar; o botão mostra a quantidade escolhida. Um conflito em qualquer data escolhida impede a gravação de toda a seleção e atualiza a prévia.

Na visão geral, clicar ou arrastar destaca somente a sala em que a seleção começou. O painel lista alternativas para aquele intervalo. A cor de cada célula representa o horário realmente ocupado, do início no topo ao fim na base; os detalhes informam os horários ocupados e livres. Os blocos de aula são referências visuais: uma reserva das 15h às 16h permite outra a partir das 16h se não houver outra ocupação conflitante.

Na **Visão geral** o período é um intervalo de datas: o padrão vai de hoje até seis dias depois, e o seletor permite escolher outro (até 31 dias). As setas avançam e recuam pelo tamanho do intervalo. Dias e blocos que já passaram aparecem esmaecidos e continuam consultáveis, mas não aceitam reserva; o mesmo vale para os horários passados nas agendas de uma sala e de salas por horário.

## Avisos e pedidos de sala

Os avisos ficam no topo de **Minhas reservas**; o item do menu mostra um selo vermelho com o número de avisos não lidos e de pedidos pendentes.

- **Cancelamento pela administração:** quando um administrador cancela a reserva ou a aula de outra pessoa, o responsável recebe um aviso com a sala, a data, o horário e o motivo (opcional, escrito no cancelamento). Numa série, chega um aviso só, com o número de datas.
- **Pedido de sala:** nos detalhes de uma ocupação de outra pessoa, docentes e administradores podem usar **Pedir esta sala…**, informando a finalidade e, se quiserem, uma mensagem. O pedido vale para aquela data e horário.
- **Responder:** o responsável vê o pedido em **Pedidos para você** e escolhe **Aceitar** ou **Recusar…** (com motivo opcional). Ao aceitar, numa única operação a ocupação dele é cancelada e outra é criada no mesmo espaço e horário para quem pediu; os demais pedidos pendentes da mesma ocupação são encerrados.
- **Acompanhar:** quem pediu vê a situação em **Seus pedidos** (aguardando, aceito, recusado, encerrado ou não está mais disponível) e pode **Desistir** enquanto estiver pendente.

Abrir **Minhas reservas** marca os avisos como lidos. Avisos e pedidos não são enviados por e-mail.

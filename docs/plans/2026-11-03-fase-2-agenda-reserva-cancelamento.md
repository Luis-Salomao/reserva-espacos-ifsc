# Fase 2: agenda, reserva avulsa e cancelamento (direção visual A)

**Goal:** Completar os Must do MoSCoW de uso diário: consultar a ocupação por data e espaço (RF-02, RF-06), reservar fora da grade sem sobreposição (RF-03, RF-04), cancelar com permissões, inclusive aulas importadas (RF-05), tudo no celular (RNF-01), e demonstrar cópia e restauração (RO-01). Visual da direção "A, calendário limpo".

**Architecture:** Mesmo núcleo hexagonal. Ocupações (`occupations`) já existem para importadas; reservas avulsas usam a mesma tabela com `source = "manual"`. Conflito por um único `INSERT … SELECT … WHERE NOT EXISTS` (dois alvos). Cancelamento muda estado com `cancel_reason` de `CANCEL_REASONS` (nunca apaga).

**Spec:** `docs/specs/2026-11-01-reserva-espacos-design.md` (Must Have, §8 direção A, §11b, §11c, regras 4 e 7). **Protótipo de referência:** `docs/design/prototipo-agenda-a/` (dados fictícios).

## Global Constraints

- Intervalos meio-abertos `[início, fim)`; horário local de parede `YYYY-MM-DDTHH:MM` com fuso da env.
- **Quem reserva:** contas ativas com papel `docente`, `horarios` ou `admin`. **Quem cancela:** o criador da reserva avulsa; o responsável (`responsible_user_id`) de uma ocupação importada; `admin` qualquer uma. Checagem sempre no servidor. Visitante (sem login) só consulta quando `PUBLIC_READ=true`, e vê o título das ocupações mas nunca nomes de pessoas.
- **Reserva avulsa:** espaço, data, início, fim, finalidade (1 a 120 caracteres). Fim > início, dentro do mesmo dia, entre 06:00 e 23:00 (configurável depois), não no passado. Sobreposição com qualquer ocupação **ativa** do espaço (importada ou avulsa) → recusa com a ocupação conflitante identificada ("Conflita com MAT1 — ADM 2, 10:10–12:00"). Duas reservas simultâneas conflitantes → no máximo uma confirmada (teste de concorrência).
- **Cancelamento (regra 7):** uma data por padrão; série só com ação explícita e confirmação do intervalo afetado. Série de uma ocupação importada = ocupações ativas do mesmo lote, mesmo título, mesmo espaço, mesmo dia da semana e mesmo horário, de hoje em diante. Avulsa não tem série nesta fase (RF-08 recorrência é Should, fora).
- `cancel_reason`: `usuario` (pessoa cancelou) — nunca `nova_versao`. Cancelamento de importada pelo responsável é preservado por novas versões (já garantido pela 1c).
- **RF-06:** a data escolhida fica na URL (`?data=YYYY-MM-DD&espaco=<id>`) e se mantém ao trocar de espaço; após salvar, mostrar claramente sucesso (com "ver reserva") ou falha com motivo.
- **RNF-01:** consulta, reserva e cancelamento em 360 px sem modo computador nem rolagem horizontal da página.
- Visual: seguir o protótipo A (layout, hierarquia, folha inferior no celular) usando os componentes shadcn do projeto e os tokens laranja. Estados sempre com texto, nunca só cor.
- pt-BR; TDD; cobertura ≥ 90% em domain/application/infra/server; `bun run check` verde; nada de dados reais no Git.

## Review Focus

1. Reserva concorrente no mesmo horário: só uma entra (bun-sqlite e D1).
2. Docente tenta cancelar ocupação de outra pessoa pelo endpoint direto → 403.
3. Troca de espaço mantém a data (URL) e a semana visível.
4. Intervalos (09:50–10:10, almoço) aparecem livres e podem ser reservados.
5. Cancelar série de importada não toca outras aulas nem datas passadas.

---

### Task 1: Visual A no app shell e telas existentes

**Files:** `docs/design/prototipo-agenda-a/` (copiar `a.html`, `base.css`, `core.js`, `tokens.css` do protótipo, com nota de que é referência), `src/components/app-shell.tsx` e navegação, `src/styles/*`, ajustes visuais em `/entrar`, `/importar*`, `/semestres*`, `/admin*`.

- [ ] Novo cabeçalho/navegação no estilo A (marca, links por papel, usuário/sair, alternar tema), layout de página com largura e espaçamento do A; menu compacto no celular. Testes de componente da navegação por papel continuam.
- [ ] Padronizar cartões, tabelas, botões e formulários das telas existentes no estilo A (sem mudar comportamento). Lighthouse e contraste continuam passando.

### Task 2: Disponibilidade, reserva avulsa e cancelamento (núcleo)

**Files:** `src/domain/availability.ts` (+test), `src/application/bookings.ts` (+test), repositório de ocupações (+test em `src/infra/db/flow/`), `src/server/booking-actions.ts` (+test), migração se necessário (`occupations.created_by`, índice por `created_by`).

**Interfaces:**
- `dayAgenda({ spaceId, date }) → { occupations: AgendaItem[]; free: Array<{ start; end }> }` e `weekAgenda({ spaceId, weekStart })`; `AgendaItem = { id; start; end; title; source: "import" | "manual"; status; canCancel: boolean; mine: boolean }` (sem nomes para visitante).
- `createBooking(user, { spaceId, date, start, end, purpose }) → ok(booking) | failure(conflict com item conflitante | validation)`.
- `cancelOccupation(user, { occupationId, scope: "data" | "serie" }) → ok({ cancelled: number }) | failure`; `previewSeries(occupationId) → { dates: string[] }` para a confirmação.
- `myBookings(user, { from }) → próximas ocupações em que o usuário é criador ou responsável`.
- [ ] TDD de cada caso das Global Constraints e Review Focus 1, 2, 4, 5 (concorrência: duas inserções no mesmo `runAtomically`/sequência simulando corrida e via dois clientes do mesmo arquivo SQLite).

### Task 3: Agenda (RF-02, RF-06)

**Files:** `src/routes/index.tsx` (agenda vira a página inicial) ou `src/routes/agenda.tsx`, `src/components/agenda/*` (+tests).

- [ ] Desktop: semana de um espaço (seg a sex, sáb/dom se houver ocupação), mini calendário e lista de espaços ao lado; blocos com horário real; livres clicáveis para quem pode reservar. Celular: linha do tempo do dia com faixa semanal e chips de espaço. Data e espaço na URL; trocar de espaço mantém a data.
- [ ] Visitante (PUBLIC_READ) vê sem ações; PUBLIC_READ=false exige login.

### Task 4: Reservar, Minhas reservas e cancelar (RF-03, RF-04, RF-05, RF-10)

**Files:** `src/components/agenda/booking-sheet.tsx`, `src/routes/minhas-reservas.tsx`, componentes de cancelamento (+tests).

- [ ] Toque/clique num livre abre modal (folha inferior no celular) já preenchido; erro de conflito inline com a ocupação conflitante; sucesso com "ver reserva".
- [ ] Minhas reservas: próximas, com cancelar data ou série (confirmação mostra as datas), estado atualizado.
- [ ] Verificação manual em 360 px e desktop, claro e escuro.

### Task 5: Cópia e restauração (RO-01)

**Files:** `cli/backup.ts`, `cli/restore.ts` (+ planos puros testados), README "Cópia e restauração".

- [ ] Local/Docker: `cli backup --out <arquivo>` com `VACUUM INTO` (consistente com o servidor rodando); `cli restore --from <arquivo>` com o servidor parado (confere integridade com `PRAGMA integrity_check` e versão de migrações antes de substituir; mantém cópia do anterior).
- [ ] Cloudflare: documentar `wrangler d1 export` / `wrangler d1 execute --file` (sem executar no remoto).
- [ ] Demonstração registrada no relatório: banco de teste com dados sintéticos → backup → apagar → restaurar → conferir contagens e uma reserva específica (passos e resultado).

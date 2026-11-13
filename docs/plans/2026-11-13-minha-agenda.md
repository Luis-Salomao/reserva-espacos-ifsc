# Minha agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova tela "Minha agenda": grade semanal com as ocupações do usuário em todas as salas, filtro por disciplina e lista "Todas as datas" para desmarcar datas.

**Architecture:** Duas consultas novas no repositório (ocupações do usuário num intervalo, sem paginação; títulos futuros), três operações no serviço `bookings` (`myWeek`, `myDates`, `mySubjects`) reaproveitando as regras de `myBookings`, e uma rota `/minha-agenda` que reaproveita `WeekGrid`, `OccupationDetails`, `CancelDialog` e `EditBookingDialog`. A normalização do título da disciplina vive em `src/domain/text-match.ts`.

**Tech Stack:** Bun, TanStack Start/Router, Drizzle (SQLite/D1), React, Biome, `bun test`.

**Spec:** `docs/specs/2026-11-13-minha-agenda-design.md`

## Global Constraints

- Padrões do repo: `Result` com `ok`/`fail`, dependências injetadas, testes ao lado do código (`*.test.ts`) e em `test/`; mensagens ao usuário em português.
- Gate final: `bun run check` (lint, typecheck, knip, deps, testes com cobertura, secrets). Código sem uso quebra o knip: não exporte o que ninguém importa.
- "Minhas reservas" continua igual; mesmas regras de `canEdit`/`responsible`/`canCancel` de `myBookings`.
- Aula importada: só "Desmarcar esta data" (escopo `data`); nada de editar/mover.
- Reserva manual: Editar (série "só esta" / "esta e as próximas" via `EditBookingDialog` existente) e Cancelar.
- Intervalo da consulta com teto de um semestre: no máximo 190 dias.
- Layout mobile sem rolagem horizontal.
- Visão semanal e lista usam as mesmas ocupações de `listMine` (criadas por ele ou responsável), só ativas.
- Rótulos: "Minha agenda", "Disciplina", "Semana", "Todas as datas", "Desmarcar".
- `src/routeTree.gen.ts` é ignorado pelo git e gerado pelo plugin do Vite; após criar a rota, gere-o (`bunx vite build` ou `bun run dev` brevemente) se typecheck/testes reclamarem.

## Review Focus

- Disciplina com títulos que diferem só por traço (`-`, `–`, `—`), caixa ou espaços duplos: um único item do filtro (Task 1, Task 3).
- Usuário sem nenhuma reserva futura: filtro vazio e grade vazia, sem erro (Task 3, Task 7).
- Ocupação no limite da semana (começando às 00:00 da segunda seguinte ou terminando às 00:00): entra só na semana correta (Task 2).
- Reserva de outra pessoa e importada de outro responsável nunca aparecem (Task 2, Task 3).
- Ocupação passada na semana: aparece, mas sem "Desmarcar"/"Editar" (Task 3, Task 5).

---

### Task 1: Normalização de título de disciplina

**Files:**
- Modify: `src/domain/text-match.ts`
- Test: `src/domain/text-match.test.ts` (acrescentar se existir, senão criar)

**Interfaces:**
- Produces: `normalizeSubject(title: string): string` — usa `normalizeText`, troca `–` e `—` por `-`, colapsa espaços em branco e normaliza o espaçamento em volta de cada traço para `" - "` (`"Cultura Digital - LAZ"`, `"cultura  digital–LAZ"` e `" CULTURA DIGITAL — laz "` dão `"cultura digital - laz"`).

- [ ] **Step 1: Write the failing test**

```ts
test("normalizeSubject junta variantes de caixa, espaços e traço", () => {
  const keys = ["Cultura Digital - LAZ", "cultura  digital–LAZ", " CULTURA DIGITAL — laz "].map(normalizeSubject);
  expect(new Set(keys).size).toBe(1);
  expect(keys[0]).toBe("cultura digital - laz");
  expect(normalizeSubject("Física")).toBe("fisica");
  expect(normalizeSubject("Cálculo I")).not.toBe(normalizeSubject("Cálculo II"));
  expect(normalizeSubject("   ")).toBe("");
});
```

- [ ] **Step 2: Run** `bun test src/domain/text-match.test.ts` — Expected: FAIL (`normalizeSubject` não existe).
- [ ] **Step 3: Implement** `normalizeSubject` exportada em `src/domain/text-match.ts`.
- [ ] **Step 4: Run** `bun test src/domain/text-match.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): normalizeSubject para agrupar disciplinas` (com a linha Co-Authored-By usada no repo).

### Task 2: Repositório — ocupações e títulos do usuário

**Files:**
- Modify: `src/application/ports.ts` (interface `OccupationRepository`, junto de `listMine`, ~linha 468)
- Modify: `src/infra/db/repos/occupation-repository.ts` (junto de `listMine`, ~linha 509)
- Test: `src/infra/db/flow/occupation-repository.test.ts`

**Interfaces:**
- Produces:
  - `listMineInRange(userId: string, fromLocal: string, toLocal: string): Promise<OccupationWithSpace[]>` — ativas com `endsAt > fromLocal` e `startsAt < toLocal` (`"YYYY-MM-DDTHH:MM"`), criadas por `userId` ou com `responsibleUserId = userId`; ordem `startsAt, id`; sem limite.
  - `listMineTitles(userId: string, fromLocal: string): Promise<string[]>` — um título por ocupação ativa do usuário com `endsAt > fromLocal` (com repetição); mesma condição de posse.

- [ ] **Step 1: Write the failing test** (helpers de `test/booking-env.ts`, como os testes vizinhos de `listMine`): usuário A com uma manual, uma importada em que é responsável, uma cancelada, uma manual de B e uma importada de B. Asserções: `listMineInRange` devolve só as duas ativas de A dentro do intervalo; ocupação que termina exatamente em `fromLocal` fica fora; a que começa exatamente em `toLocal` fica fora; `listMineTitles` traz os títulos futuros de A, sem passadas, canceladas nem as de B.
- [ ] **Step 2: Run** `bun test src/infra/db/flow/occupation-repository.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** os dois métodos em `ports.ts` e no repositório, compartilhando com `listMine` a condição de posse (função local, sem duplicar).
- [ ] **Step 4: Run** o mesmo comando — Expected: PASS. Rode `bun run typecheck`: fakes de `OccupationRepository` em outros testes podem precisar dos novos métodos.
- [ ] **Step 5: Commit** `feat(repo): consultas de ocupações e títulos do usuário`.

### Task 3: Serviço — `myWeek`, `myDates`, `mySubjects`

**Files:**
- Modify: `src/application/bookings.ts` (tipos perto de `MyBooking`, ~linha 189; métodos perto de `myBookings`, ~linha 1075)
- Test: `src/application/bookings.test.ts` (novo `describe("minha agenda")` após `describe("myBookings")`)

**Interfaces:**
- Consumes: Task 1 `normalizeSubject`; Task 2 `listMineInRange`, `listMineTitles`.
- Produces (tipos exportados):
  - `MySubject = { key: string; label: string; count: number }` — `key = normalizeSubject(title)`; `label` = título original mais frequente do grupo (empate: o primeiro na ordem pt-BR de `byTitle`); `count` = reservas futuras.
  - `MyWeek = WeekAgenda & { items: MyBooking[] }` — `days[*].occupations` são os `MyBooking` do dia (com `spaceName`), `spaceId: ""`, `free: []`, `blocks` do semestre como em `weekAgenda`.
  - `MyDates = { now: string; items: MyBooking[] }`.
- Métodos do serviço:
  - `mySubjects(user: User): Promise<Result<{ subjects: MySubject[] }>>` — futuras (`endsAt > now`), ordenadas por `label`.
  - `myWeek(user: User, input: { weekStart: string; subject?: string }): Promise<Result<MyWeek>>` — mesmas validações de `weekAgenda` (data válida, segunda-feira, campo `weekStart`); `subject` filtra por `normalizeSubject(item.title) === normalizeSubject(subject)`.
  - `myDates(user: User, input: { subject: string }): Promise<Result<MyDates>>` — `subject` vazio após normalizar: `fail("validation", "Escolha uma disciplina.", "subject")`; de agora até +190 dias; ordenado por data e horário.
- Refatoração: extrair `toMyBooking(row, user, now, people): MyBooking` (mapeamento hoje inline em `myBookings`) e usar nos novos métodos e em `myBookings` (comportamento inalterado).

- [ ] **Step 1: Write the failing tests** (com `setup()` do arquivo): (a) `mySubjects` agrupa `"Cultura Digital - LAZ"` e `"Cultura Digital – LAZ"` em um item com `count: 2`, sem passadas, canceladas nem de outro docente; usuário sem reservas dá `{ subjects: [] }`; (b) `myWeek` da semana de 2026-11-02: inclui ocupações de duas salas com `spaceName`, exclui as de outra pessoa, ocupação passada aparece com `canCancel: false`, `subject` restringe à disciplina; `weekStart` numa terça ou data inválida dá `{ ok: false, field: "weekStart" }`; (c) `myDates`: só futuras da disciplina em ordem, importada com `canEdit: false`, manual com `canEdit: true`, `subject: "  "` dá `{ ok: false, field: "subject" }`, e `label` ou `key` retornam o mesmo resultado.
- [ ] **Step 2: Run** `bun test src/application/bookings.test.ts -t "minha agenda"` — Expected: FAIL.
- [ ] **Step 3: Implement** conforme Interfaces; `myWeek` monta os dias com `buildDay` e zera `free`.
- [ ] **Step 4: Run** `bun test src/application/bookings.test.ts` — Expected: PASS inteiro (`myBookings` sem regressão).
- [ ] **Step 5: Commit** `feat(bookings): myWeek, myDates e mySubjects`.

### Task 4: Ações e funções de servidor

**Files:**
- Modify: `src/server/booking-actions.ts` (perto de `myBookingsAction`, ~linha 352)
- Modify: `src/server/booking-fns.ts`
- Test: `src/server/booking-actions.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces (estilo de `myBookingsAction`: `asAccount`, 400 `BAD_REQUEST` para corpo inválido):
  - `mySubjectsAction(deps, request, data)` → `{ subjects: MySubject[] }`.
  - `myWeekAction(deps, request, data)`; `data: { weekStart: string; subject?: string }`.
  - `myDatesAction(deps, request, data)`; `data: { subject: string }`.
  - Fns: `mySubjectsFn`, `myWeekFn`, `myDatesFn` (`createServerFn({ method: "POST" }).validator(passthrough)`, como as vizinhas).

- [ ] **Step 1: Write the failing tests** (tokens `doca`/`docb`/`off`): sem token ou conta inativa dá `status: 401`; `myWeekAction` sem `weekStart` dá 400; `subject` não-string dá 400; docente A recebe só as próprias e B não vê as de A.
- [ ] **Step 2: Run** `bun test src/server/booking-actions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as três ações e as três fns.
- [ ] **Step 4: Run** o mesmo comando — Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): ações da Minha agenda`.

### Task 5: Cartão com a sala e Editar nos detalhes

**Files:**
- Modify: `src/components/agenda/agenda-blocks.tsx` (`OccupationCard`, ~linha 177; conferir `layoutEvents` em `layout-helpers.ts` para não perder campos extras)
- Modify: `src/components/agenda/occupation-details.tsx`
- Test: `src/components/agenda/occupation-details.test.tsx` e `src/components/agenda/occupation-card-room.test.tsx` (criar)

**Interfaces:**
- Produces:
  - `OccupationCard` aceita `ev: AgendaItem & { spaceName?: string }`; com `spaceName` mostra a sala numa linha truncada (mesmo critério de altura de `showPerson`) e inclui o nome no `aria-label`/`title`; sem `spaceName` nada muda.
  - `OccupationDetailsProps.onEdit?: (occupation: AgendaItem) => void`. O botão "Editar…" aparece quando `onEdit` existe, `item.source === "manual"` e `item.canCancel`. A regra fina de `canEdit` fica com o chamador (Task 7).

- [ ] **Step 1: Write the failing tests**: (a) cartão com `spaceName: "LAB 106A"` renderiza "LAB 106A" e o `aria-label` o contém; sem `spaceName` não há linha de sala; (b) detalhes de manual com `onEdit` mostram "Editar…" e o clique chama `onEdit(item)`; importada com `onEdit` não mostra "Editar…".
- [ ] **Step 2: Run** `bun test src/components/agenda/occupation-details.test.tsx src/components/agenda/occupation-card-room.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** as duas mudanças.
- [ ] **Step 4: Run** os dois arquivos e `bun test src/components test/components` — Expected: PASS (agenda "Uma sala" sem regressão).
- [ ] **Step 5: Commit** `feat(agenda): sala no cartão e Editar nos detalhes`.

### Task 6: CancelDialog de uma data só para aula importada

**Files:**
- Modify: `src/components/agenda/cancel-dialog.tsx`
- Test: `test/components/cancel-dialog.test.tsx`

**Interfaces:**
- Produces: `CancelDialogProps.dateOnly?: boolean` — com `true`, não oferece "esta e as próximas", não chama `previewFn`, rotula a confirmação "Desmarcar esta data" e envia `scope: "data"`. Sem a prop, comportamento atual idêntico.

- [ ] **Step 1: Write the failing test**: com `dateOnly` e alvo `source: "import"`, o `previewFn` mock não é chamado, não há opção de série, e confirmar chama `cancelFn` com `{ occupationId, scope: "data" }` e depois `onCancelled`.
- [ ] **Step 2: Run** `bun test test/components/cancel-dialog.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a prop.
- [ ] **Step 4: Run** o mesmo arquivo e `bun test test/components/series-cancel.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(agenda): cancelamento de uma data para aula importada`.

### Task 7: Rota `/minha-agenda`

**Files:**
- Create: `src/routes/minha-agenda.tsx` (rota, loader, página)
- Create: `src/components/agenda/my-agenda-view.tsx` (filtro, alternância Semana/Todas as datas, navegação de semana, lista de datas)
- Test: `test/routes/minha-agenda.test.tsx` e `src/components/agenda/my-agenda-view.test.tsx`

**Interfaces:**
- Consumes: Task 4 fns; Task 5 `onEdit`/`spaceName`; Task 6 `dateOnly`; `WeekGrid`, `EditBookingDialog`, `CancelDialog`, `OccupationDetails`, `listSpaces`.
- Produces:
  - `MinhaAgendaSearch = { semana?: string; disciplina?: string; modo?: "semana" | "todas" }` e `validateMinhaAgendaSearch(search: Record<string, unknown>): MinhaAgendaSearch` — `semana` só se for data válida, ajustada para a segunda-feira (reaproveite `getWeekStart` de `src/routes/index.tsx`, movendo-o para `#/domain/calendar` se necessário); `disciplina` string não vazia; `modo` só `"todas"` e só com `disciplina`.
  - `MyAgendaView` props: `{ subjects: MySubject[]; subject: string | undefined; mode: "semana" | "todas"; week: MyWeek; dates: MyDates | null; onSubjectChange(key: string | undefined): void; onModeChange(mode: "semana" | "todas"): void; onWeekChange(weekStart: string): void; onOpen(item: MyBooking): void; onDisable(item: MyBooking): void }`.
  - Rota: `beforeLoad` redireciona visitante para `/entrar` com `voltar: "/minha-agenda"` (como `minhas-reservas`); loader chama `mySubjectsFn`, `myWeekFn` (e `myDatesFn` só com `modo === "todas"` e `disciplina`) e `listSpaces()`; falha vira `throw new Error(message)` com `errorComponent` e `Notice`, como em `minhas-reservas`.
- Comportamento: clicar numa ocupação abre `OccupationDetails` (`spaceName = item.spaceName`); `onEdit` só é passado para `canEdit === true` e abre `EditBookingDialog` (target = o `MyBooking`); cancelar abre `CancelDialog` com `dateOnly` se `source === "import"`; na lista "Todas as datas" cada linha tem "Desmarcar" abrindo o mesmo `CancelDialog` (manual em série mantém as opções do diálogo); após salvar ou cancelar, `router.invalidate()`. Filtro, modo e semana persistem na URL via `navigate`. Sem rolagem horizontal da página em tela estreita.

- [ ] **Step 1: Write the failing tests**: (a) `validateMinhaAgendaSearch({ semana: "2026-11-05" })` dá `{ semana: "2026-11-02" }`; `{ semana: "x" }` dá `{}`; `{ modo: "todas" }` sem disciplina dá `{}`; (b) `MyAgendaView`: o seletor lista cada `label` com `count`; escolher uma disciplina chama `onSubjectChange(key)`; "Todas as datas" fica desabilitado sem disciplina; no modo "todas" cada item tem "Desmarcar" chamando `onDisable(item)`; lista vazia mostra "Nenhuma data futura para esta disciplina."; (c) página: item importado nos detalhes não mostra "Editar…" e seu cancelamento abre diálogo sem opção de série; item manual com `canEdit` mostra "Editar…".
- [ ] **Step 2: Run** `bun test test/routes/minha-agenda.test.tsx src/components/agenda/my-agenda-view.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a view e a rota; gerar `routeTree.gen.ts` (Global Constraints).
- [ ] **Step 4: Run** os dois arquivos e `bun run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(minha-agenda): rota, filtro de disciplina e lista de datas`.

### Task 8: Menu e verificação final

**Files:**
- Modify: `src/components/app-shell.tsx` (`NavItem.to`, `NAV_ICONS`, `SCREEN_HINTS`, `navItems`)
- Test: `test/routes/minhas-reservas.test.tsx` (onde `navItems` já é testado)

**Interfaces:**
- Produces: item `{ to: "/minha-agenda", label: "Minha agenda" }` logo depois de "Minhas reservas", para `MY_BOOKINGS_ROLES` (`admin`, `docente`); ícone `CalendarClock` (lucide); dica `"Organize suas aulas e reservas por disciplina"`.

- [ ] **Step 1: Write the failing test**: `navItems` de docente e de admin contém "Minha agenda" logo após "Minhas reservas"; visitante e `manutencao` não.
- [ ] **Step 2: Run** `bun test test/routes/minhas-reservas.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a entrada de menu.
- [ ] **Step 4: Verify** `bun run check` — Expected: tudo verde. Corrija o knip se algo exportado ficou sem uso.
- [ ] **Step 5: Verificação visual** com `bun run dev` e a skill `playwright-cli`: docente com aula importada abre `/minha-agenda`, filtra a disciplina, alterna "Todas as datas", desmarca uma data, e em viewport 390px confere `document.documentElement.scrollWidth <= innerWidth`.
- [ ] **Step 6: Commit** `feat(app-shell): item Minha agenda no menu`.

---

## Self-review

- Spec: rota/menu (T8); grade com sala (T3, T5, T7); filtro normalizado (T1, T3); Semana/Todas as datas (T7); detalhes manual/importado (T5, T6, T7); consultas sem paginação e com teto (T2, T3); permissões inalteradas (reuso de `cancelOccupation` e `updateBooking`).
- Nomes consistentes: `MySubject`, `MyWeek`, `MyDates`, `normalizeSubject`, `listMineInRange`, `listMineTitles`, `dateOnly`, `onEdit`.

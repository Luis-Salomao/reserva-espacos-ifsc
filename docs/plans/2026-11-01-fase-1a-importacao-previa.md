# Fase 1a — Importação do XML de horários: leitura tolerante e prévia

**Goal:** Ler qualquer exportação XML do aSc TimeTables sem quebrar, normalizar a grade semanal e mostrar uma prévia (tela e CLI) com contagens, avisos e grade por sala, sem gravar nada.

**Architecture:** Módulo puro `src/import-asc/` (só depende de `src/domain` e `fast-xml-parser`, regra `import-asc-is-pure`). Três estágios puros: `readAscXml` (bytes → árvore segura) → `normalizeAsc` (árvore → `AscTimetable` + avisos) → `buildWeeklySlots` / `buildImportPreview`. A UI chama via `src/server/import-preview.ts` (server fn com upload em memória). CLI `import-preview <arquivo>` usa as mesmas funções.

**Tech Stack:** fast-xml-parser 5.x (fixar versão), Bun test, TanStack Start server fn.

**Spec:** `docs/specs/2026-11-01-reserva-espacos-design.md` (§7.1, §7.2, §7.3 passo 1, §11c)

## Global Constraints

- Parser e normalização **nunca lançam** por conteúdo; só `readAscXml` pode rejeitar o arquivo inteiro, e apenas por: tamanho > 10 MB (`MAX_XML_BYTES = 10 * 1024 * 1024`), codificação não suportada, `<!DOCTYPE` ou `<!ENTITY`, XML malformado, raiz diferente de `timetable` (case-insensitive).
- Nada de inventar: sem data de calendário, sem sala escolhida para card com várias salas, sem docente inferido.
- Campos pessoais de docente (nome completo, firstname, lastname, e-mail, celular, gênero, cor) e qualquer dado de `students`/`groups.studentids`/`studentsubjects` **não entram no DTO**. Docente = `{ id, short }`.
- Atributos sempre lidos como string (sem conversão automática numérica), nomes de atributo case-insensitive.
- `src/import-asc/` não importa `src/infra`, `src/server`, rotas, componentes, `node:*` ou `bun:*`.
- Fixtures em `test/fixtures/asc/` são **sintéticas** (IDs e nomes inventados). O XML real em `data/real/` só é lido por um teste opcional que pula se o arquivo não existir e imprime apenas contagens.
- Mensagens e avisos em pt-BR; identificadores em inglês. Cobertura ≥ 90% em `src/import-asc` e `src/domain`.

## Review Focus

1. XML exportado por outra versão/câmpus com seções ausentes (sem `cards`, sem `termsdefs`, sem `periods`) → prévia com avisos, nunca exceção. Teste em T2/T3 com fixture `minimal.xml` e `lessons-without-cards.xml`.
2. Card com `period` inexistente ou `periodspercard` que ultrapassa o último período → aviso, card não aplicável. Teste em T3.
3. Arquivo UTF-16 ou com BOM, e arquivo em Windows-1252 → os dois primeiros funcionam; o terceiro é rejeitado com mensagem clara. Teste em T1.
4. Upload de arquivo não-XML ou enorme pela tela → mensagem amigável, sem stack. Teste em T5.
5. IDs com espaços/vírgulas extras (`"A, B,"`) → normalizados para `["A","B"]`. Teste em T2.

---

### Task 1: Leitura segura (`readAscXml`)

**Files:** Create `src/import-asc/read.ts`, `src/import-asc/read.test.ts`, `src/import-asc/errors.ts`, `test/fixtures/asc/` (fixtures criadas aqui conforme necessário).

**Interfaces:**
- `type ImportRejection = { code: "too_large" | "unsupported_encoding" | "dtd_forbidden" | "malformed" | "not_timetable"; message: string }` (message pt-BR, sem trechos do arquivo).
- `type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[] }` (nomes em minúsculas; atributos com chave minúscula).
- `readAscXml(bytes: Uint8Array): { ok: true; root: XmlNode } | { ok: false; error: ImportRejection }`.

- [ ] Testes (RED): `too_large` com 10 MB + 1 byte; `dtd_forbidden` para `<!DOCTYPE timetable [<!ENTITY x SYSTEM "file:///etc/passwd">]>` e não contém "passwd" na mensagem; `malformed` para `<timetable><a></timetable>`; `not_timetable` para `<foo/>`; UTF-8 com BOM e UTF-16LE com BOM lidos (`root.name === "timetable"`); bytes inválidos em UTF-8 sem BOM (ex. `0xE9` isolado) → `unsupported_encoding`; atributo `Name="X"` vira `attrs.name === "X"`; valor `"007"` permanece string `"007"`.
- [ ] Implementar com `TextDecoder(..., { fatal: true })`, checagem de DOCTYPE/ENTITY por regex case-insensitive antes do parse, `XMLValidator.validate` + `XMLParser` (fast-xml-parser) com `ignoreAttributes:false`, `attributeNamePrefix:""`, `parseAttributeValue:false`, `parseTagValue:false`, `processEntities:false`, `preserveOrder:true`, convertendo para `XmlNode`.
- [ ] `bun run check` verde. Commit `feat(import): leitura segura do XML de horários`.

### Task 2: Normalização tolerante (`normalizeAsc`)

**Files:** Create `src/domain/timetable.ts`, `src/import-asc/normalize.ts`, `src/import-asc/normalize.test.ts`, `src/import-asc/warnings.ts`, fixtures `test/fixtures/asc/{complete,minimal,messy-attrs}.xml`.

**Interfaces (em `src/domain/timetable.ts`):**
```ts
type Period = { number: number; name: string; short: string; start: string /*HH:MM*/; end: string };
type DayDef = { id: string; name: string; masks: string[] };          // "10000"
type TermDef = { id: string; name: string; short: string; masks: string[] }; // "1100"
type WeekDef = { id: string; name: string; masks: string[] };
type Classroom = { id: string; name: string; short: string; capacity: number | null };
type Teacher = { id: string; short: string };
type Subject = { id: string; name: string; short: string };
type SchoolClass = { id: string; name: string; short: string };
type Lesson = { id: string; subjectId: string | null; classIds: string[]; teacherIds: string[];
  classroomIds: string[]; periodsPerCard: number; termsDefId: string | null; weeksDefId: string | null; daysDefId: string | null };
type Card = { lessonId: string; period: number | null; days: string | null; weeks: string | null; terms: string | null; classroomIds: string[] };
type AscTimetable = { periods: Period[]; days: DayDef[]; terms: TermDef[]; weeks: WeekDef[]; classrooms: Classroom[];
  teachers: Teacher[]; subjects: Subject[]; classes: SchoolClass[]; lessons: Lesson[]; cards: Card[] };
```
- `type ImportWarning = { code: WarningCode; section: string; ref?: string; detail?: string }` com `WarningCode` união de strings em `warnings.ts` (ao menos: `section_missing`, `invalid_time`, `invalid_number`, `invalid_mask`, `duplicate_id`, `unknown_reference`, `missing_attribute`).
- `normalizeAsc(root: XmlNode): { timetable: AscTimetable; warnings: ImportWarning[] }`.

- [ ] Testes (RED): `complete.xml` produz contagens exatas da fixture; teacher só tem `id` e `short` (`Object.keys` exato) mesmo com firstname/email/mobile/gender no XML; `capacity="*"` → `null`, `"30"` → `30`; horário `"8:00"` → `"08:00"`, `"25:00"` → período omitido + `invalid_time`; `classroomids="A, B,"` → `["A","B"]`; `minimal.xml` (só `<timetable/>`) → todas as listas vazias e um `section_missing` por seção ausente, sem lançar; atributos em maiúsculas (`ID`, `Short`) lidos; elemento desconhecido ignorado; ID duplicado → primeiro vence + `duplicate_id`; referência de card a lesson inexistente → `unknown_reference`; `periodspercard` ausente/inválido → `1` + `invalid_number`.
- [ ] Implementar com helpers pequenos (`attr(node, name)`, `idList(value)`, `parseTime(value)`, `section(root, "cards", "card")`). Nada de dados de `students`, `groups`, `studentsubjects`.
- [ ] `bun run check` verde. Commit `feat(import): normalização tolerante da grade`.

### Task 3: Grade semanal e alertas internos (`buildWeeklySlots`)

**Files:** Create `src/import-asc/slots.ts`, `src/import-asc/slots.test.ts`, fixtures `test/fixtures/asc/{edge-cards,lessons-without-cards}.xml`.

**Interfaces:**
```ts
type WeeklySlot = { lessonId: string; weekday: number /*0=seg..6*/; start: string; end: string;
  periodFrom: number; periodTo: number; classroomIds: string[]; termsMask: string | null; weeksMask: string | null;
  status: "applicable" | "no_room" | "multiple_rooms" };
type SlotIssue = { code: "missing_period" | "period_overflow" | "invalid_days" | "lesson_without_cards" | "unknown_lesson"; ref: string };
type InternalOverlap = { classroomId: string; weekday: number; a: WeeklySlot; b: WeeklySlot };
buildWeeklySlots(tt: AscTimetable): { slots: WeeklySlot[]; issues: SlotIssue[]; overlaps: InternalOverlap[] };
```
- Card com `days` máscara de N posições → um slot por posição `1` (posição i = weekday i). `periodspercard = n` → ocupa de `period` até o n-ésimo período seguinte **na ordem numérica dos períodos existentes**; `start` do primeiro, `end` do último. Se não houver n períodos → `period_overflow`, sem slot.
- `classroomIds` do card; se vazio, herda da lesson; vazio nos dois → `no_room`; >1 → `multiple_rooms` (sem escolher).
- Sobreposição interna: mesma sala, mesmo weekday, intervalos `[start,end)` com interseção e máscaras de terms com algum `1` em comum (null = todos); apenas slots `applicable`. Comparar por horário real (N123 × N12 conflita).
- [ ] Testes (RED) cobrindo cada regra acima, incluindo: adjacentes (09:50/10:10) não conflitam; N123 (19:00–22:00) conflita com N12 (18:00–19:50) na mesma sala e terms; terms `1100` × `0011` não conflitam; lesson sem card → `lesson_without_cards`.
- [ ] `bun run check` verde. Commit `feat(import): grade semanal e sobreposições internas`.

### Task 4: Prévia agregada (`buildImportPreview`) e CLI

**Files:** Create `src/import-asc/preview.ts`, `src/import-asc/preview.test.ts`, `src/import-asc/index.ts` (API pública: `previewAscXml(bytes)`), `src/import-asc/real-file.test.ts`, `cli/import-preview.ts`; Modify `cli/index.ts`, `README.md`.

**Interfaces:**
```ts
type ImportPreview = {
  counts: { periods: number; classrooms: number; teachers: number; subjects: number; classes: number; lessons: number; cards: number; slots: number };
  slotsByStatus: { applicable: number; no_room: number; multiple_rooms: number };
  warnings: Array<{ code: string; count: number; examples: string[] /*até 5 refs*/ }>;
  overlaps: number;
  termsUsed: Array<{ mask: string; label: string; cards: number }>;
  periods: Period[];
  classrooms: Array<{ id: string; short: string; name: string; slots: number }>;
  timetable: AscTimetable; slots: WeeklySlot[]; overlapsDetail: InternalOverlap[];
};
previewAscXml(bytes: Uint8Array): { ok: true; preview: ImportPreview } | { ok: false; error: ImportRejection };
```
- [ ] Testes de `buildImportPreview` com `complete.xml` (contagens e agrupamento de avisos). `real-file.test.ts`: se `data/real/*.xml` existir, `previewAscXml` retorna `ok: true`, `counts.cards > 0`, e o teste imprime só `counts` e `slotsByStatus`; senão `test.skip`.
- [ ] CLI `bun run cli import-preview <arquivo> [--json]` imprime resumo legível (contagens, avisos agrupados, salas com nº de slots, sobreposições); rejeição → mensagem + exit 1. Coverage: CLI de IO excluído como os demais.
- [ ] Rodar no XML real e colar a saída resumida no relatório. `bun run check` verde. Commit `feat(import): prévia agregada e comando import-preview`.

### Task 5: Tela de prévia `/importar`

**Files:** Create `src/server/import-preview.ts`, `src/server/import-preview.test.ts`, `src/routes/importar.tsx`, `src/components/import/{import-upload,import-summary,weekly-grid,warning-list}.tsx` (+ testes de componente para `weekly-grid` e `warning-list`); Modify `src/components/app-shell.tsx` (link "Importar grade").

**Interfaces:**
- Server fn `previewImport(formData: FormData): Promise<{ ok: true; preview: PreviewView } | { ok: false; message: string }>` — lê o arquivo do campo `file`, recusa > 10 MB antes de ler tudo, chama `previewAscXml`, devolve `PreviewView` (= `ImportPreview` sem `timetable` bruto: só o necessário para a tela). Nunca persiste nem loga conteúdo.
- [ ] Teste do server fn com bytes da fixture (ok) e com arquivo não-XML (mensagem amigável, sem stack).
- [ ] Tela mobile-first (360 px): upload → resumo (cartões de contagem), avisos agrupados e recolhíveis, grade semanal por sala (seletor de sala; dia × bloco com horário real; cores `--occ-*`; card sem sala e várias salas listados à parte), seção "Durações" mostrando máscaras e rótulos com o texto "ainda sem datas: serão definidas na configuração do semestre". Sem nomes de docentes (só sigla).
- [ ] Verificação manual com fixture e XML real em `bun run dev` (desktop e 360 px), Lighthouse da página inicial continua passando. `bun run check` verde. Commit `feat(import): tela de prévia da grade`.

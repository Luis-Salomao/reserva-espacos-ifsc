# Fase 1b: login, semestre, de-para e aplicação da grade

**Goal:** Contas locais com papéis e sessão segura nos dois alvos; configuração do semestre; de-para de salas e docentes; aplicar a prévia da grade gerando ocupações concretas no banco, sem sobrescrever nada e sem duplicar.

**Architecture:** Mesma hexagonal. Domínio puro em `src/domain` (usuário, papel, semestre, ocupação, expansão de datas). Casos de uso em `src/application` dependendo de portas (`UserRepository`, `SessionRepository`, `PasswordHasher`, `SemesterRepository`, `MappingRepository`, `ImportBatchRepository`, `OccupationRepository`, `Clock`). Implementações Drizzle em `src/infra/db/repos`, hasher em `src/infra/auth`. Web chama via `src/server`.

**Spec:** `docs/specs/2026-11-01-reserva-espacos-design.md` (§7.3, §11b, §11c, regras de importação 1 a 8)

## Global Constraints

- Mesmo código em Bun+SQLite e Workers+D1. Sem `db.transaction()`; operações multi-linha usam `db.batch` (D1) ou sequências idempotentes; inserção com checagem de conflito é um único `INSERT ... SELECT ... WHERE NOT EXISTS`.
- **Senha**: porta `PasswordHasher { hash(pw): Promise<string>; verify(pw, stored): Promise<boolean>; needsRehash(stored): boolean }`. Implementação padrão **scrypt via `node:crypto`** (N=16384, r=8, p=1, salt 16 bytes, chave 32 bytes), formato autodescritivo `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`; comparação com `timingSafeEqual`. Alternativa `pbkdf2-sha256` (100 000 iterações, limite de produção do Workers) com formato `pbkdf2$100000$<saltB64>$<hashB64>`. `verify` aceita os dois formatos; `needsRehash` true quando formato/parâmetros diferem do configurado. Algoritmo e N configuráveis por env (`PASSWORD_HASH=scrypt|pbkdf2`, `PASSWORD_SCRYPT_N`). Pepper opcional `PASSWORD_PEPPER` (secret; HMAC-SHA-256 da senha antes do hash). Nunca JS puro (bcryptjs, noble) para senha.
- **Sessão**: token aleatório 32 bytes (base64url) no cookie `sid` com `HttpOnly; Secure` (exceto `http://localhost`); `SameSite=Lax; Path=/`; no banco só `SHA-256(token)`; expira em 7 dias, renovada quando faltar menos de 1 dia; logout revoga. POST/PUT/DELETE exigem header `Origin` igual ao host (CSRF), testado.
- **Papéis globais**: `admin`, `horarios`, `docente`. Importar/aplicar: `admin` ou `horarios`. Gerir contas, espaços e semestres: `admin` (semestre também `horarios`). Checagem sempre no servidor.
- Consulta pública continua (PUBLIC_READ); `/importar` e `/api/import-preview` passam a exigir login com papel de importação.
- Headers de segurança em todas as respostas HTML: `Content-Security-Policy` (script-src self + hash do script inline de tema), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `frame-ancestors 'none'`.
- Datas e horas: horário local de parede `YYYY-MM-DDTHH:MM` com fuso da env; comparação lexicográfica (§11b).
- Ocupações importadas nunca são apagadas: cancelamento muda estado. Conflito com ocupação ativa existente é listado e **não** inserido.
- Dados de docente do XML: só `id` e `short` (sigla). Conta local tem `code` (sigla) opcional usado para sugerir vínculo.
- pt-BR na UI e commits; testes com fixtures sintéticas; cobertura ≥ 90% em domain/application/infra/server.

## Review Focus

1. Senha/sessão nos dois runtimes: scrypt precisa funcionar no `workerd` (verificar com `wrangler dev`) e no Bun; documentar custo de CPU (plano Free do Workers tem 10 ms) e quando usar pbkdf2.
2. Login com usuário inexistente vs senha errada: mesma resposta e tempo semelhante (sem enumeração); limite simples de tentativas por conta (5 em 15 min → atraso/recusa), testado.
3. Aplicar duas vezes o mesmo arquivo e semestre: reconhecido, nada duplicado. Aplicar interrompido no meio: reaplicar completa.
4. Duração sem data configurada, aula sem sala mapeada, sala marcada "ignorar": aulas ficam não aplicáveis com motivo, nunca inventadas.
5. Intervalos/almoço continuam livres: ocupações geradas por `segments`, nunca pelo bloco mesclado.

---

### Task 1: Contas, senha e sessão (núcleo)

**Files:** `src/domain/user.ts`, `src/application/ports.ts` (+portas), `src/application/auth.ts` (+test), `src/infra/auth/password-hasher.ts` (+test), `src/infra/db/schema.ts` (+`users`, `sessions`, `login_attempts`), `src/infra/db/repos/{user,session}-repository.ts` (+tests), migração, `cli/create-admin.ts` + entrada em `cli/index.ts`, `.env.example`.

**Interfaces:**
- `type Role = "admin" | "horarios" | "docente"`; `type User = { id; email; name; code: string | null; roles: Role[]; active: boolean }`.
- `createAuthService(deps: { users; sessions; hasher; attempts; clock; random })` com `login(email, password) → { ok: true; token; user } | { ok: false; reason: "invalid" | "locked" }`, `authenticate(token) → User | null` (renova), `logout(token)`.
- `cli create-admin --email --name [--code]` pede senha sem eco (ou `--password-stdin`), grava no alvo local; com `--target cloudflare` imprime o comando `wrangler d1 execute DB --remote --command "INSERT ..."` com hash já calculado (nunca a senha).
- [ ] TDD dos testes: hash/verify scrypt e pbkdf2, formatos inválidos → false, `needsRehash`, pepper; login ok, senha errada e email inexistente → mesmo `invalid`; bloqueio após 5 falhas em 15 min; sessão expira e renova; token guardado só como hash; logout revoga.
- [ ] Verificar scrypt no `workerd`: rota temporária NÃO commitada em `wrangler dev` que faz hash+verify; registrar resultado e tempo no relatório. Se não funcionar, padrão vira `pbkdf2` (documentar).
- [ ] `bun run check` verde. Commit.

### Task 2: Login na web e proteção

**Files:** `src/server/session.ts` (cookie, `getCurrentUser`, `requireRole`, verificação de Origin) (+test), `src/routes/entrar.tsx`, `src/routes/sair.ts` (POST), `src/components/app-shell.tsx` (usuário logado, sair), middleware/headers de segurança (+test), proteção de `/importar` e `/api/import-preview`.

- [ ] Testes: cookie com flags certas; `requireRole` recusa papel errado (403) e sem sessão (401/redirect); POST sem Origin válido → 403; headers presentes com hash do script de tema correto (calculado do mesmo texto que o `__root` injeta).
- [ ] Tela `/entrar` (pt-BR, acessível, mobile), mensagens genéricas; redireciona de volta. AppShell mostra nome e "Sair".
- [ ] Verificação manual em `dev` e `dev:cf`. `bun run check` verde. Commit.

### Task 3: Administração mínima de contas e espaços

**Files:** `src/application/{users,spaces}.ts` (+tests), repos (+tests), `src/server/admin.ts`, rotas `/admin/contas`, `/admin/espacos`.

- [ ] Admin cria conta (email, nome, sigla, papéis, senha inicial), desativa, redefine senha; cria/edita espaço (nome único, capacidade opcional `null` = não informada). Validações no servidor, testadas; não-admin recebe 403.
- [ ] Telas simples, mobile-first. `bun run check` verde. Commit.

### Task 4: Configuração do semestre

**Files:** `src/domain/semester.ts` (+test), `src/application/semesters.ts` (+test), schema `semesters`, `semester_terms`, `semester_blocks`, repo (+test), rotas `/semestres`, `/semestres/$id`.

**Interfaces:** `Semester = { id; name; start: "YYYY-MM-DD"; end; terms: Array<{ position: 1..4; start; end }>; blocks: Array<{ number; name; start: "HH:MM"; end }> }`. `validateSemester(s) → string[]` (fim > início; durações dentro da vigência; blocos com fim > início).
- [ ] Testes de validação e persistência. Blocos podem ser pré-carregados a partir dos `periods` de uma prévia (botão "usar blocos do XML").
- [ ] Telas (admin/horarios). `bun run check` verde. Commit.

### Task 5: De-para e aplicação (núcleo)

**Files:** `src/domain/occupation.ts`, `src/domain/expand.ts` (+test), `src/application/import-apply.ts` (+test), schema `room_mappings`, `teacher_mappings`, `import_batches`, `occupations`, repos (+tests).

**Interfaces:**
- `expandSlotDates(slot: WeeklySlot, semester: Semester) → Array<{ date; start; end; period }>`: para cada `segment`, cada data entre início e fim da vigência no `weekday`, e só se a data cair numa Duração cuja posição tem `1` em `termsMask` (null = todas). Duração sem datas → slot não aplicável `term_without_dates`.
- `planImport({ preview, semester, roomMap, teacherMap, existing }) → { toInsert: OccupationDraft[]; notApplicable: Array<{ lessonId; reason }>; conflicts: Array<{ draft; existingId }> }` (puro).
- `applyImport(batchId)`: estados `rascunho → aplicando → aplicado`; insere em blocos com chave única `(batch_id, lesson_id, space_id, starts_at)` e `INSERT ... SELECT ... WHERE NOT EXISTS (ocupação ativa sobreposta no espaço)`; conflitos surgidos durante a aplicação vão para a lista. Reaplicar completa sem duplicar. Hash do lote = SHA-256(bytes do XML) + id do semestre; mesmo hash aplicado → reconhecido, não duplica.
- Ocupação: `{ id; spaceId; startsAt; endsAt; source: "import"; batchId; lessonId; responsibleUserId: string | null; status: "ativa" | "cancelada"; title }` (título = sigla da disciplina + turmas).
- [ ] Testes: expansão em semestre curto com feriado nenhum (não inventar), Duração parcial, segmento por bloco (intervalo livre), conflito com ocupação existente, idempotência, retomada após falha simulada no meio.
- [ ] `bun run check` verde. Commit.

### Task 5b: Novo tema laranja e componentes prontos

Pedido do autor em 02/11/2026: usar componentes prontos de registros que entregam o código (shadcn, Magic UI, Watermelon UI) e personalizar com as cores do projeto: claro = branco e preto com destaque laranja; escuro = preto e branco com o mesmo laranja.

**Files:** `src/styles/tokens.css`, `src/styles/tokens.test.ts`, `docs/design-system.md`, `src/components/ui/{calendar,popover,date-picker}.tsx` (via `bunx shadcn@latest add`), formulário de semestre.

- [ ] Tokens: `--accent` laranja (#F38020 ou próximo) com `--accent-contrast` preto; texto/link laranja sobre fundo claro usa um tom mais escuro que passe 4.5:1; cores de ocupação revistas. Teste de contraste continua verde nos três blocos.
- [ ] Adicionar Calendar/Popover/DatePicker do registro shadcn (pt-BR, segunda como início da semana, sem horário de verão), substituir os campos de data do semestre. Teste de componente.
- [ ] Nenhuma marca citada em docs ou código. Lighthouse continua passando. Commit.

### Task 6: Fluxo de importação na tela

**Files:** `src/server/import-flow.ts` (+test), rotas `/importar` (passos), `/importar/lotes`, componentes de de-para.

- [ ] Resultado por linha (pedido do autor): tabela filtrável com cada aula/ocorrência e seu estado (aplicada, não aplicável com motivo, conflito com qual ocupação, falha ao gravar com mensagem), também ao reabrir um lote.
- [ ] Depois da prévia: escolher semestre; de-para de salas (espaço existente / criar / ignorar; vínculos salvos e pré-preenchidos); de-para de docentes (sugestão por sigla = `code` da conta; manual; sem vínculo); conferência (aplicáveis, não aplicáveis com motivo, conflitos); aplicar; resultado; lista de lotes com estado.
- [ ] O XML não é guardado: o lote guarda o hash e o resumo; a prévia é reenviada pelo cliente na etapa de aplicar e verificada pelo hash.
- [ ] Verificação manual com fixture e XML real em `dev`; 360 px sem rolagem. `bun run check` verde. Commit.

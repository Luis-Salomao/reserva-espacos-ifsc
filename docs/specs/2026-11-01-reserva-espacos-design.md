# Reserva de espaços IFSC — design da ferramenta

Data: 2026-11-01. Autor das decisões: Luis Salomão. Redação: Claude (orquestrador).
Marcações: **[Luis]** = decidido pelo autor; **[Claude]** = decisão do orquestrador, revisável.

## 1. Intenção

Ferramenta web de consulta e reserva de espaços físicos do IFSC Câmpus Garopaba, artefato do TCC.
O primeiro e mais importante fluxo é **importar a grade de horários exportada do aSc TimeTables (XML)**,
para que aulas regulares ocupem os espaços sem recadastro manual. O projeto será **aberto e revisado
por terceiros**: código limpo, modular, fácil de manter, e nunca vazar segredos.

## 2. Objetivos

- Cumprir os **Must Have** da matriz MoSCoW do TCC (abaixo), começando pela importação XML. [Luis]
- **Dois alvos de produção com o mesmo código** [Luis]:
  - **Local/self-host**: container ou servidor rodando Bun, banco SQLite em arquivo.
  - **Cloudflare Workers**: banco D1.
  Funcionar nos dois **desde o primeiro commit**.
- Importação XML **tolerante a variações** do formato: não quebrar por seção ausente, atributo extra,
  ordem diferente, IDs com prefixo, etc. Degradar com avisos, não com exceção. [Luis]
- CLI de instalação (`init`) para os dois alvos. [Luis]
- Qualidade automatizada desde o início, rodando localmente (sem GitHub Actions). [Luis]
- Design system com tokens: claro (fundo branco, cinzas neutros frios, destaque azul) e escuro (grafite quase preto, bordas sutis, destaque índigo). [Luis]

### Must Have (matriz MoSCoW do TCC, 31/10/2026)

| ID | Resumo |
|---|---|
| RF-01 | Ler XML, conferir correspondência de salas, mostrar divergências sem sobrescrever reservas silenciosamente |
| RF-02 | Escolher data + espaço e ver horários ocupados/disponíveis |
| RF-03 | Reserva avulsa (espaço, finalidade, data, início, fim); rejeitar fim <= início |
| RF-04 | Não confirmar reserva sobreposta a outra ativa ou a ocupação importada; adjacentes ok; concorrência: no máximo uma |
| RF-05 | Docente responsável e admin cancelam uso (inclusive importado), com permissão |
| RF-06 | Preservar data ao trocar de espaço; distinguir sucesso/falha ao salvar |
| RF-07 | Papéis: consulta, reserva, administra; servidor valida permissões |
| RNF-01 | Consultar, reservar e cancelar no celular (viewport 360 px) sem rolagem horizontal |
| RO-01 | Cópia e restauração documentadas e demonstradas |

Should/Could ficam fora deste design (RF-08..RF-14). Won't: RF-15, RF-16, **RF-17 login institucional**.

### Regras de importação decididas pelo autor (regras de importação do TCC, 31/10/2026)

1. Salas: de-para conferido na primeira vez, vínculos confirmados são guardados e reutilizados; **nunca** casar por nome parecido.
2. Docentes: vincular a uma conta local; tentar por código (`short`/id), seleção manual quando falhar. ID do XML não é matrícula.
3. Vigência: o usuário informa início e fim (o XML não traz datas de calendário).
4. Conflitos: confirmar as entradas válidas e separar os conflitos; nunca sobrescrever automaticamente. Afetado deve ser avisado (canal indefinido → registrar, não enviar).
5. Mesmo arquivo de novo: reconhecer (conteúdo + vigência, não nome do arquivo) e não duplicar.
6. Arquivo alterado: mostrar inclusões/alterações/remoções antes de aplicar; preservar reservas avulsas e cancelamentos anteriores.
7. Quem cancela: docente responsável e admin. Alcance padrão: uma data; série exige ação explícita.
8. Quem importa: responsáveis pelos horários e admin.

## 3. Não objetivos (nesta versão)

- Login institucional/SSO (RF-17). **Contas locais criadas pelo admin**; autenticação atrás de uma
  interface para permitir provedor futuro. [Luis]
- Notificação por e-mail/WhatsApp (canal não definido): apenas registrar quem seria afetado.
- Recorrência de reservas avulsas (RF-08, Should), agenda pessoal, subespaços.
- GitHub Actions/CI remoto. Tudo roda local via hooks e scripts. [Luis]

## 4. Anti-objetivos (falha mesmo que "funcione")

- Vazar `.env`, token, chave ou banco no Git. Betterleaks bloqueia no pre-commit. [Luis]
- Versionar o XML real ou dados derivados dele (decisão [Claude]: o autor liberou usar o XML real
  em testes locais, mas ele não entra no repositório público; fica em `data/real/`, ignorado).
- Importação que quebra inteira por um detalhe do XML.
- Parser ou regra de negócio acoplado a banco, a framework web ou a um alvo de deploy.
- Inventar datas, salas ou vínculos que a entrada não fornece.
- Citar ferramentas de terceiros usadas como referência no repo público. [Luis]

## 5. Restrições e stack

| Tema | Escolha | Origem |
|---|---|---|
| Runtime/gerenciador/testes | Bun (local 1.4.x); `bun test` com cobertura | [Luis] |
| Web | TanStack Start (`@tanstack/react-start` 1.169.x) + React 19, criado via `@tanstack/cli` com toolchain biome e add-ons `tanstack-query`, `t3env`, `form` | [Luis] stack; add-ons [Claude] |
| UI kit | shadcn/ui (add-on do CLI) com tokens próprios | [Claude] |
| ORM | Drizzle 0.45.x estável, schema `sqlite-core` único; drivers `bun:sqlite` (local) e `d1` (Workers). **Não** usar `better-sqlite3` do add-on | [Luis] Drizzle; drivers [Claude] |
| Deploy local | Nitro (`nitro/vite`), preset `bun` (ou `node-server`), Dockerfile | [Luis] |
| Deploy Cloudflare | `@cloudflare/vite-plugin` + wrangler, binding D1 | [Claude], via pesquisa |
| Seleção do alvo | variável `DEPLOY_TARGET=local|cloudflare` no `vite.config.ts` | [Claude]; **sem exemplo oficial → provar na Fase 0** |
| Env | `@t3-oss/env-core` + zod, função `getEnv()` lazy (Workers só tem env por request) | [Luis] validador; forma [Claude] |
| XML | `fast-xml-parser` 5.x (JS puro, roda em Bun e Workers); DOCTYPE/ENTITY rejeitados antes do parse; limite de bytes antes do parse | [Claude] |
| Senhas | hash via WebCrypto PBKDF2-SHA256 (disponível em Bun e Workers) | [Claude] |
| Lint/format | Biome 2.6 (sem ESLint/Prettier) | [Luis] |
| Tipos | `tsc --noEmit`, TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | [Luis] strict; flags extras [Claude] |
| Código morto | Knip | [Luis] |
| Camadas | dependency-cruiser (UI não importa infra; domínio não importa nada externo) | [Claude] |
| Segredos | Betterleaks (sucessor do gitleaks, `winget install Betterleaks.Betterleaks`) no pre-commit (staged) e sobre o histórico no `check` | [Luis] |
| Hooks | lefthook | [Claude] |
| Performance/acessibilidade | Lighthouse CI local (`@lhci/cli`), metas: a11y ≥ 95, best-practices ≥ 95, performance ≥ 90 (mobile) | [Luis] ferramenta; metas [Claude] |
| DB tooling | scripts `db:generate`, `db:migrate`, `db:studio` (local) e `db:studio:d1`, `db:migrate:d1` | [Luis] |

## 6. Arquitetura

Hexagonal simples. Regra de dependência: `domain` ← `application` ← (`infra`, `web`). Imposta por dependency-cruiser.

```
src/
  domain/           # tipos e regras puras: Space, Booking, Occupation, intervalos, sobreposição
  import-asc/       # parser aSc TimeTables: bytes -> AscTimetable (DTO) + avisos; expansão p/ ocorrências
  application/      # casos de uso (previewImport, applyImport, listAvailability, createBooking, cancel...)
                    # dependem só de portas (interfaces): SpaceRepo, BookingRepo, ImportRepo, UserRepo, Clock, PasswordHasher
  infra/
    db/schema.ts    # Drizzle sqlite-core (único)
    db/repos/       # implementações Drizzle das portas (servem p/ os dois drivers)
    db/client.local.ts      # bun:sqlite
    db/client.cloudflare.ts # D1 via `cloudflare:workers`
    auth/           # sessão por cookie + PBKDF2; interface AuthProvider p/ futuro SSO
  web/ (app/)       # rotas TanStack Start, componentes, design system
cli/                # `init`, `create-admin`, `backup`, `restore`
```

- Cliente de banco escolhido por import condicionado ao alvo (alias de módulo no build), para o bundle
  Workers nunca puxar `bun:sqlite`.
- Sem `db.transaction()` no código compartilhado (D1 não tem transação interativa). Operações
  multi-statement usam `batch`; **criação de reserva** é um único `INSERT ... SELECT ... WHERE NOT EXISTS
  (sobreposição)` checando `changes`, atômico nos dois drivers (RF-04 concorrência).
- Intervalos meio-abertos `[início, fim)`: adjacentes não conflitam.
- Horários armazenados como texto ISO local + fuso fixo da instituição configurado em env (`America/Sao_Paulo`). [Claude]

## 7. Importação aSc TimeTables (foco da primeira entrega)

### 7.1 Formato conhecido (amostra real, aSc 2012)

Raiz `timetable`; seções `periods/period` (`period,starttime,endtime`), `daysdefs/daysdef` (`days` máscara binária),
`weeksdefs/weeksdef`, `termsdefs/termsdef` (`terms` máscara de 4 posições), `subjects`, `teachers` (contém nome,
e-mail, celular, gênero), `classrooms` (`capacity="*"`), `classes`, `groups`, `lessons/lesson`
(`classids,subjectid,periodspercard,teacherids,classroomids,groupids,termsdefid,weeksdefid,daysdefid`),
`cards/card` (`lessonid,classroomids,period,weeks,terms,days`). IDs múltiplos separados por vírgula.

### 7.2 Tolerância (requisito central)

Parser em duas camadas:
1. **Leitura segura**: decodifica (UTF-8, UTF-8 com BOM, UTF-16 via BOM; outros → erro claro), rejeita
   `<!DOCTYPE`/`<!ENTITY`, rejeita > 10 MB [Claude], parse com `fast-xml-parser` sem processar entidades externas.
   Só aqui o arquivo inteiro pode ser rejeitado (XML malformado, DTD, tamanho, raiz não reconhecida).
2. **Normalização leniente**: cada seção é opcional; atributos acessados por nome, case-insensitive; aceita
   elemento único ou lista; IDs aparados, listas vazias viram `[]`; horários `H:MM`/`HH:MM`; máscaras validadas.
   Cada problema vira um **aviso estruturado** `{code, section, ref?, count}` e o item afetado fica "não aplicável",
   sem derrubar o resto. Casos já conhecidos que viram aviso: card sem sala, card com várias salas, lesson sem
   turma, referência quebrada, período inexistente, card sem horário (há exportações em que lessons existem sem cards).
3. **Fixtures**: conjunto de XMLs sintéticos cobrindo cada variação + teste opcional com o XML real em
   `data/real/` (pulado se ausente; imprime só contagens).

Do docente entram no DTO só `id`, `short` (sigla) e o nome (`name`, senão `firstname` + `lastname`, senão a
sigla), usados para sugerir vínculo e criar a conta fantasma do docente sem conta. E-mail, celular, gênero e cor
**não entram no DTO**. O nome só aparece para quem está logado. [AD-001 em `docs/specs/STATE.md`, 2026-11-04, que
substitui a regra anterior de usar apenas `id` e `short`]

### 7.3 Fluxo na UI (quem importa: admin e responsável por horários)

1. Enviar arquivo → **prévia**: contagens, avisos agrupados, grade semanal (dia × período com horário real).
2. **De-para de salas**: cada `classroom` do XML → espaço cadastrado, ou "criar espaço", ou "ignorar".
   Vínculos confirmados ficam salvos e pré-preenchem a próxima importação.
3. **De-para de docentes**: tenta por sigla/código, senão seleção manual; pode ficar sem vínculo (ocupação
   importada sem responsável → só admin cancela).
4. **Vigência**: início e fim obrigatórios.
5. **Conferência**: entradas aplicáveis, não aplicáveis (com motivo) e **conflitos** com reservas existentes.
   Usuário confirma; conflitos nunca sobrescrevem: ficam listados e registrados.
6. **Aplicar**: gera ocupações concretas (datas) dentro da vigência, ligadas ao lote de importação.
   Reimportação idêntica (hash do conteúdo + vigência) é reconhecida e não duplica.

Diff de arquivo alterado (regra 6) é **Fase 1b**: implementado após o fluxo básico estar estável.

## 8. Design system

Tokens CSS (variáveis) em `light` e `dark`, consumidos por Tailwind/shadcn. Atualizado em 02/11/2026 [Luis]:
claro = branco e preto com destaque laranja; escuro = preto e branco com o mesmo laranja; componentes
prontos de registros que entregam o código (shadcn e afins), personalizados. Cores por estado de ocupação
(livre, reservado, importado, conflito) com contraste AA nos dois temas, sempre com rótulo de texto.
Mobile-first (360 px). Identidade visual própria.

**Direção visual escolhida em 03/11/2026 [Luis]: "A, calendário limpo"** (protótipo em
`docs/design/prototipo-agenda-a/`): calmo e arejado; no desktop, semana de uma sala com mini calendário e
lista de salas ao lado; no celular, linha do tempo do dia com faixa semanal e chips de sala; reservar e
cancelar em modal (folha inferior no celular); intervalos e almoço aparecem livres.

## 9. Qualidade e segurança

`bun run check` = `biome check` + `tsc --noEmit` + `knip` + `depcruise` + `bun test --coverage`
(limite 90% linhas/funções em `domain`, `import-asc`, `application`) [Claude] + Betterleaks no diff.
Pre-commit (lefthook): biome nos arquivos staged + Betterleaks nos staged. Pre-push: `bun run check`.
`bun run lighthouse` separado (precisa do app rodando). `.gitignore` cobre `.env*` (exceto `.env.example`),
`*.sqlite*`, `.wrangler/`, `data/`, `coverage/`, `.lighthouseci/`.

## 10. Organização do repositório e histórico [Luis]

- Material de análise anterior fica fora deste repositório, apenas para consulta local.
- Repositório com `git init` limpo; docs públicos sem citar ferramentas de referência. O remote
  `github.com/Luis-Salomao/reserva-espacos-ifsc` recebe **force-push** (autorizado pelo autor; confirmar no momento da execução).

## 11. Fases

- **Fase 0 — Base**: mover pastas, scaffold via CLI, configs (TS strict, Biome, Knip, depcruise, lefthook,
  betterleaks, bunfig coverage, lhci, env), tokens do design system, "olá mundo" com uma consulta ao banco
  **rodando nos dois alvos** (`bun run dev`, build local em Docker, `wrangler dev` com D1 local), CLI `init` mínima.
- **Fase 1 — Importação XML**: `import-asc` + fixtures; prévia; de-para; vigência; aplicar; idempotência.
- **Fase 1b**: diff de reimportação.
- **Fase 2**: contas locais + papéis (RF-07), consulta de disponibilidade (RF-02, RF-06), reserva avulsa
  com conflito atômico (RF-03, RF-04), cancelamento (RF-05), mobile (RNF-01).
- **Fase 3**: backup/restauração documentados e demonstrados nos dois alvos (RO-01).

Observação de ordem [Claude]: aplicar a importação exige espaços e um usuário admin; a Fase 1 inclui um
admin semeado pela CLI e o cadastro mínimo de espaços, sem a tela completa de contas.

## 11b. Decisões complementares [Claude] (após revisão do construtor)

- **Contas e sessão**: tabela `users` e `sessions` no próprio banco (funciona igual em SQLite e D1); cookie
  `HttpOnly; Secure; SameSite=Lax` com token aleatório, guardado só como hash. Primeiro admin: `cli create-admin`
  (local: direto no arquivo; Cloudflare: via `wrangler d1 execute` gerado pela CLI). `AuthProvider` é a porta para SSO futuro.
- **Papéis globais** (não por espaço): `admin`, `horarios` (importa grade), `docente` (reserva e cancela as próprias,
  inclusive ocupações importadas vinculadas à sua conta). Ocupação importada sem docente vinculado: só admin cancela.
- **Ocupações importadas são materializadas** como linhas (uma por data), ligadas ao lote e ao card de origem.
  Cancelar uma data muda o estado da linha para `cancelada` (nunca apaga), o que permite à Fase 1b preservar cancelamentos.
- **Aplicação do lote no D1**: sem transação interativa. O lote tem estado (`rascunho → aplicando → aplicado`); as linhas
  são inseridas em `batch` por blocos com chave única `(lote, card, data)` e `INSERT ... WHERE NOT EXISTS` de conflito,
  então reaplicar um lote interrompido completa o que falta sem duplicar. Conflitos surgidos durante a aplicação vão para a lista de conflitos.
- **Datas**: armazenadas como horário local de parede `YYYY-MM-DDTHH:MM` com fuso institucional fixo em env; comparação
  lexicográfica é válida porque o Brasil não tem horário de verão vigente. Fuso usado para "agora" e exibição.
- **Migrações**: mesmo SQL do `drizzle-kit generate`; local aplica no boot/CLI, Cloudflare via `wrangler d1 migrations apply`
  chamado pela CLI (usuário precisa estar logado no wrangler).
- **Backup D1 (RO-01)**: `wrangler d1 export` + restauração em banco de teste; local: cópia consistente do arquivo (`VACUUM INTO`).

## 11c. Configuração do semestre e acesso público [Luis]

- **Configuração do semestre** feita uma vez no início e válida para todas as importações daquele semestre [Luis]:
  - vigência (início e fim);
  - datas de cada **Duração** (posições 1–4 de `terms`; na amostra parecem bimestres) [Luis confirmou o modelo de
    "configurar no começo"; a correspondência exata com bimestres é palpite a confirmar com quem faz a grade];
  - grade de **blocos de horário** (pré-carregada dos `period` do XML: M12 8:00–9:50, M34 10:10–12:00, T12, T34, N12,
    N34, N123 19:00–22:00), editável. Intervalos entre blocos (manhã, almoço, tarde) ficam livres para reserva avulsa.
  - Blocos se sobrepõem (N123 × N12/N34): conflito sempre calculado por horário real, nunca pelo número do período.
  - Divisão de um bloco em duas aulas (comum no ensino médio): o XML só traz o bloco; a ocupação importada cobre o bloco
    inteiro. Subdividir é opcional na configuração e fica para depois se não vier no XML. [Claude]
  - Aula com Duração sem data configurada → "não aplicável" com aviso, nunca inventada.
- **Consulta pública**: a agenda (ocupação das salas) pode ser vista sem login;
  reservar, cancelar e importar exigem conta. Uma opção de configuração permite exigir login também para consultar. [Luis + Claude]
- **Público e manutenção**: substituir a ferramenta PHP antiga com algo moderno, mobile-first, que estudantes consigam
  manter e contribuir (código legível, modular, bem testado, documentação de contribuição). [Luis]

## 12. Deixado ao construtor

Nomes de arquivos/funções, estrutura interna das tabelas, componentes de UI, mensagens, formato exato dos
avisos, escolha entre preset Nitro `bun` e `node-server` (preferir `bun` se estável), detalhes do Dockerfile.

## 13. Pendências reais (não inventar)

- Semântica das 4 posições de `terms` em relação ao calendário (D1..D4). Até definir: [ver pergunta ao autor].
- Semântica de card com várias salas (todas ocupadas ou alternativas?). Até definir: não aplicável, com aviso.
- Canal de notificação de afetados.

# Design system

Base visual do sistema. Os tokens ficam em `src/styles/tokens.css` e são mapeados para o tema do shadcn/Tailwind 4 em `src/styles.css` (`@theme inline`). Componentes devem usar as classes do Tailwind (`bg-background`, `text-muted-foreground`, `bg-occ-booked`...) e nunca cores fixas.

## Direção

- **Claro:** agenda clara e calma. Fundo branco, cinzas frios neutros, destaque azul.
- **Escuro:** grafite sóbrio. Quase preto, bordas sutis, destaque índigo.
- Apenas o clima visual é referência. Não há logotipos, nomes ou ativos de terceiros.
- Fonte do sistema (`ui-sans-serif, system-ui, ...`): sem requisições externas.

## Tokens

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#08090a` | Fundo da página |
| `--surface` | `#f8f9fa` | `#101113` | Cabeçalho, cartões |
| `--surface-2` | `#f1f3f4` | `#17181b` | Hover, áreas secundárias |
| `--border` | `#dadce0` | `#23252a` | Bordas |
| `--text` | `#1f1f1f` | `#f7f8f8` | Texto principal |
| `--text-muted` | `#5f6368` | `#8a8f98` | Texto secundário |
| `--accent` | `#1a73e8` | `#5e6ad2` | Ação principal |
| `--accent-contrast` | `#ffffff` | `#ffffff` | Texto sobre o destaque |
| `--occ-free` | `#e6f4ea` | `#123524` | Ocupação: livre (verde) |
| `--occ-booked` | `#d2e3fc` | `#1e2a5a` | Ocupação: reservado (azul) |
| `--occ-imported` | `#fde7b8` | `#4a3a0f` | Ocupação: importado (âmbar) |
| `--occ-conflict` | `#fad2cf` | `#5a1f22` | Ocupação: conflito (vermelho) |
| `--focus` | `#1a73e8` | `#8f98f5` | Anel de foco |

As cores de ocupação são fundos suaves: o texto (`--text`) sobre elas tem contraste de pelo menos 10:1. Como a cor sozinha não basta para distinguir estados, telas futuras devem acompanhar cada estado com rótulo ou ícone.

## Contraste (WCAG)

`src/styles/tokens.test.ts` lê o `tokens.css` e exige razão mínima de 4.5:1 para `text/bg`, `text-muted/bg`, `text-muted/surface`, `accent-contrast/accent` e `text` sobre cada `--occ-*`, e 3:1 para `--focus/bg`, nos dois temas. Também garante que o tema escuro por preferência do sistema é idêntico ao definido por atributo.

## Tema claro/escuro

1. Um script mínimo no `<head>` (`src/routes/__root.tsx`) define `data-theme` antes da primeira pintura, a partir de `localStorage["theme"]` ou de `prefers-color-scheme`.
2. `ThemeToggle` alterna `data-theme` em `<html>` e grava a escolha (com `try/catch`, pois o armazenamento pode estar bloqueado).
3. Sem JavaScript, `@media (prefers-color-scheme: dark)` aplica o tema escuro, a menos que `data-theme="light"` esteja definido.
4. A variante `dark:` do Tailwind segue `data-theme="dark"`.

## Layout

Mobile-first: conteúdo em coluna única, margens de 16 px, largura máxima de `3xl`. Nenhuma página deve ter rolagem horizontal em 360 px.

## Lighthouse

`bun run build:local && bun run lighthouse` mede a página inicial em modo móvel (padrão do Lighthouse CI) contra `bun run start:local`. Metas: acessibilidade e boas práticas >= 0.95, desempenho >= 0.9. Se o Chrome não for encontrado, defina `CHROME_PATH` (no Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`). Relatórios ficam em `.lighthouseci/` (ignorado pelo Git).

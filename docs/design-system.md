# Design system

Base visual do sistema. Os tokens ficam em `src/styles/tokens.css` e são mapeados para o tema do shadcn/Tailwind 4 em `src/styles.css` (`@theme inline`). Componentes devem usar as classes do Tailwind (`bg-background`, `text-muted-foreground`, `bg-occ-booked`...) e nunca cores fixas.

## Direção

- **Claro:** branco e preto com destaque laranja. Fundo branco, texto quase preto, cinzas neutros.
- **Escuro:** preto e branco com o mesmo laranja.
- Apenas o clima visual é referência. Não há logotipos, nomes ou ativos de terceiros.
- Fonte do sistema (`ui-sans-serif, system-ui, ...`): sem requisições externas.
- O laranja (`--accent`) é **preenchimento** (botões, dia selecionado) com texto `--accent-contrast` quase preto. Para **texto ou link** laranja use `--accent-text`, que no claro é um tom mais escuro (contraste >= 4.5 sobre `--bg`, `--surface` e `--surface-2`).

## Tokens

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0a0a0a` | Fundo da página |
| `--surface` | `#fafafa` | `#141414` | Cabeçalho, cartões |
| `--surface-2` | `#f4f4f5` | `#1c1c1c` | Hover, áreas secundárias |
| `--border` | `#e4e4e7` | `#2e2e2e` | Bordas |
| `--text` | `#0a0a0a` | `#fafafa` | Texto principal |
| `--text-muted` | `#52525b` | `#a1a1aa` | Texto secundário |
| `--accent` | `#f38020` | `#f38020` | Ação principal (preenchimento) |
| `--accent-contrast` | `#111111` | `#111111` | Texto sobre o destaque |
| `--accent-text` | `#b54708` | `#f38020` | Texto e links laranja |
| `--occ-free` | `#dcf2e3` | `#14391f` | Ocupação: livre (verde) |
| `--occ-booked` | `#ffe3c9` | `#5a2d08` | Ocupação: reservado (laranja) |
| `--occ-imported` | `#dde8f6` | `#1d2f4a` | Ocupação: importado (azul) |
| `--occ-conflict` | `#fcd5d3` | `#5c1d1f` | Ocupação: conflito (vermelho) |
| `--focus` | `#c2410c` | `#f38020` | Anel de foco |

As cores de ocupação são fundos suaves: o texto (`--text`) sobre elas tem contraste de pelo menos 10:1. Como a cor sozinha não basta para distinguir estados, telas futuras devem acompanhar cada estado com rótulo ou ícone.

## Contraste (WCAG)

`src/styles/tokens.test.ts` lê o `tokens.css` e exige razão mínima de 4.5:1 para `text/bg`, `text-muted/bg`, `text-muted/surface`, `text-muted/surface-2`, `accent-contrast/accent`, `accent-text` sobre `bg`/`surface`/`surface-2` e `text` sobre cada `--occ-*`, e 3:1 para `--focus` sobre `bg` e `surface`, nos dois temas. Também garante que o tema escuro por preferência do sistema é idêntico ao definido por atributo.

## Tema claro/escuro

1. Um script mínimo no `<head>` (`src/routes/__root.tsx`) define `data-theme` antes da primeira pintura, a partir de `localStorage["theme"]` ou de `prefers-color-scheme`.
2. `ThemeToggle` alterna `data-theme` em `<html>` e grava a escolha (com `try/catch`, pois o armazenamento pode estar bloqueado).
3. Sem JavaScript, `@media (prefers-color-scheme: dark)` aplica o tema escuro, a menos que `data-theme="light"` esteja definido.
4. A variante `dark:` do Tailwind aplica com `data-theme="dark"` ou, sem `data-theme="light"`, com `prefers-color-scheme: dark` (mesma regra dos tokens).

## Componentes prontos

Componentes vêm do registro do shadcn (código copiado para `src/components/ui/`) e usam só os tokens acima. `Calendar` (react-day-picker, locale `pt-BR` importado por idioma) e `Popover` sustentam o `DatePicker` (`src/components/ui/date-picker.tsx`): botão rotulado, valor em `"AAAA-MM-DD"` (datas locais construídas pelas partes, sem `new Date("AAAA-MM-DD")`), semana iniciando na segunda e foco devolvido ao botão ao fechar. Nenhum recurso externo é carregado.

## Layout

Mobile-first: conteúdo em coluna única, margens de 16 px, largura máxima de `3xl`. Nenhuma página deve ter rolagem horizontal em 360 px.

## Lighthouse

Não faz parte do gate. Para medir acessibilidade e desempenho, rode `bun run build:local && bun run start:local` e use o painel Lighthouse do Chrome DevTools na página inicial, em modo móvel. Metas: acessibilidade e boas práticas >= 0.95, desempenho >= 0.9.

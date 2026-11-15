# Sistema de Reserva de Espaços — IFSC Câmpus Garopaba

[![Verificação](https://github.com/Luis-Salomao/reserva-espacos-ifsc/actions/workflows/check.yml/badge.svg)](https://github.com/Luis-Salomao/reserva-espacos-ifsc/actions/workflows/check.yml)

Aplicação web de código aberto para consultar a ocupação das salas e laboratórios do IFSC Câmpus
Garopaba, reservar espaços e importar a grade de aulas. Versão de demonstração publicada em
**<https://reservas-ifsc.luissalomao.dev>**.

## Sobre o trabalho

Este repositório é o produto do Trabalho de Conclusão de Curso **"Desenvolvimento de ferramenta de
apoio à reserva e gestão de espaços físicos no IFSC Câmpus Garopaba"**, de Luis Salomão dos Santos,
no Curso Superior de Tecnologia em Sistemas para Internet do Instituto Federal de Santa Catarina,
Câmpus Garopaba (2026).

O trabalho partiu da pergunta: *quais características deve apresentar um sistema de reserva de
espaços físicos para atender às limitações do processo adotado no câmpus, na percepção dos
servidores envolvidos?* Para respondê-la, a pesquisa:

1. caracterizou o processo de consulta, reserva e gestão dos espaços a partir de documentos
   institucionais (as páginas públicas de horários e da agenda das salas, que orientam o pedido de
   reserva por e-mail à direção) e de seis entrevistas com servidores, entre setembro e outubro de
   2026;
2. comparou sistemas e estudos sobre reserva de espaços em instituições de ensino;
3. especificou os requisitos e os priorizou com a técnica MoSCoW;
4. projetou e implementou este protótipo, verificado por testes automatizados;
5. prevê a avaliação de usabilidade com usuários do processo, por tarefas práticas, observação e a
   System Usability Scale (SUS).

O objetivo é reunir num só lugar a consulta de ocupação, a reserva e a grade de aulas, aproveitando a
grade já produzida em vez de redigitá-la. A implantação institucional e os efeitos do uso no dia a
dia ficam fora do escopo do TCC.

## O que a ferramenta faz

- **Agenda:** quatro formas de ver a ocupação: uma sala por dia ou semana, salas por horário, salas
  livres num horário e a visão geral de todas as salas num intervalo de datas.
- **Reservas:** avulsas e recorrentes, com prevenção de conflitos no servidor, edição e cancelamento
  de uma data ou da série.
- **Importação da grade:** leitura do XML do aSc Horários com prévia, vínculo de salas e docentes,
  conferência e aplicação em lote; uma nova versão da grade mostra o que muda antes de aplicar.
- **Minhas reservas e Minha agenda:** as reservas e aulas de cada pessoa, com avisos de cancelamento
  e pedidos de sala entre professores (pedir, aceitar ou recusar).
- **Administração:** contas e papéis (administração, horários, docente, manutenção), espaços e seus
  equipamentos, semestres e blocos de horário.
- **Leitura pública opcional**, recuperação de senha por e-mail, tema claro e escuro, layout para
  celular e acessibilidade (rótulos, foco visível e contraste verificado por testes).

O passo a passo de cada tela está no [guia de uso](docs/guia-de-uso.md).

## Como foi construído

- **TanStack Start** (React 19 com renderização no servidor) e **Bun**, num único projeto com
  interface e servidor.
- **Drizzle ORM** com dois alvos a partir do mesmo código: servidor Bun com **SQLite** (ou Docker) e
  **Cloudflare Workers** com **D1**.
- **Tailwind CSS 4** e componentes **shadcn/ui** (Radix), com as cores do Manual da Marca do IFSC.
- **Arquitetura hexagonal:** regras de negócio no domínio, casos de uso na aplicação e banco, e-mail
  e autenticação nas bordas. As dependências entre camadas são checadas automaticamente. O mapa das
  pastas está em [CONTRIBUTING](CONTRIBUTING.md#arquitetura).

## Qualidade

Cada alteração passa pelo mesmo gate, localmente (antes do push) e no GitHub Actions: formatação e
lint (Biome), tipos (TypeScript), código sem uso (knip), regras de arquitetura (dependency-cruiser),
testes com cobertura e varredura de segredos (Betterleaks).

Na versão de entrega (novembro de 2026):

- 2.147 testes passando em 167 arquivos, entre testes de unidade, de componente, de fluxo no banco e
  de ponta a ponta;
- cobertura de 99,6% das linhas e 99,7% das funções nas camadas sem interface (domínio, aplicação,
  infraestrutura, importação e ações do servidor). A interface tem testes próprios, mas fica fora da
  métrica; o recorte exato está em [CONTRIBUTING](CONTRIBUTING.md#qualidade-e-testes).

## Rodar localmente

Requer [Bun](https://bun.sh) 1.4 ou superior.

```bash
bun install
bun run db:migrate   # cria o banco SQLite de desenvolvimento em ./data/dev.sqlite
bun run cli create-admin --email voce@exemplo.com --name "Seu Nome"
bun dev              # http://localhost:3000
```

`bun run check` roda o gate completo.

## Documentação

| Documento | Conteúdo |
|---|---|
| [Guia de uso](docs/guia-de-uso.md) | Telas e fluxos: importação da grade, reservas, Minha agenda, avisos e pedidos. |
| [Instalação e operação](docs/instalacao-e-operacao.md) | Instalação nos dois alvos, e-mail, segurança, primeiro administrador, cópia e restauração, Docker. |
| [Desenvolvimento e contribuição](CONTRIBUTING.md) | Ambiente de desenvolvimento, arquitetura, testes e convenções. |
| [docs/](docs/README.md) | Especificações, decisões de projeto, design system e planos de cada fase. |

## Licença

[0BSD](LICENSE) (BSD Zero Clause): uso, cópia, modificação e distribuição livres, sem exigir
atribuição.

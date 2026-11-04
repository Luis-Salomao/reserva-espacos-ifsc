# Estado do projeto

## Decisions

### AD-001: o import lê o nome do docente do XML

- **Status**: active
- **Data**: 2026-11-04
- **Decisão**: o DTO do import passa a ler o nome do docente (`name`, ou `firstname` + `lastname` quando `name` falta) além de `id` e `short`. E-mail, celular, gênero e cor continuam fora do DTO.
- **Motivo**: o usuário pediu contas para todos os docentes do XML, com o nome real, para que a agenda mostre quem é responsável por cada aula. Isso substitui a regra de minimização da seção 7.2 de `docs/specs/2026-11-01-reserva-espacos-design.md`, que só permitia `id` e `short`.
- **Limite**: o nome só aparece para quem está logado. Visitante continua sem ver nomes nem iniciais.

### AD-002: contas fantasmas para docentes sem vínculo

- **Status**: active
- **Data**: 2026-11-04
- **Decisão**: docente do XML sem conta vinculada ganha uma conta fantasma (nome do XML, sigla, e-mail presumido, papel `docente`) que não consegue entrar. O admin depois ativa a fantasma (define e-mail e senha reais) ou a funde numa conta existente.
- **Motivo**: o usuário prefere ter todas as aulas com responsável desde a importação e resolver as contas reais na administração. O sistema ainda não está em produção real, então o e-mail presumido é aceitável.

## Handoff

- **Data**: 2026-11-04
- **Situação**: specs aprovadas; desenho e tarefas de `docentes-do-xml` (16), `todas-as-salas` (10) e `materia-na-reserva` (6) escritos e aguardando aprovação. Nada implementado.
- **Paralelismo planejado**: `docentes-do-xml` e `todas-as-salas` em worktrees separadas; `materia-na-reserva` depois do merge de `docentes-do-xml`. Conflitos esperados em `ports.ts`, `bookings.ts`, `occupation-repository.ts` e `booking-actions.ts` (métodos novos lado a lado).
- **Próxima spec**: `visao-geral` (salas × semana por bloco, cor por matéria, filtros recolhidos) escrita; implementar depois do merge de `todas-as-salas` e `docentes-do-xml`.
- **Em andamento por outra pessoa**: `src/components/agenda/room-selector.tsx` (seletor com busca e agrupamento por bloco), não commitado.

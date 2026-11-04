# Reserva recorrente: tarefas

Modo rápido: quatro tarefas, um commit cada. Sem design.md (o desenho cabe nas tarefas).

## T1: Regra de repetição no domínio

- **What**: `src/domain/recurrence.ts` gera as datas (dia útil, semanal com dias e intervalo, mensal por dia, mensal por Nª semana), aplica término por data ou contagem, os limites (120 datas, 365 dias, intervalo 1–12) e monta o resumo em texto.
- **Requirements**: REC-04 (texto), REC-05, REC-06
- **Tests**: `src/domain/recurrence.test.ts` (virada de mês e ano, dia 31, 5ª semana inexistente, data inicial fora da regra, fim por data e por contagem, cada limite)
- **Gate**: `bun test src/domain/recurrence.test.ts`
- **Done when**: testes passam; nenhuma dependência fora do domínio.
- **Status**: [ ]

## T2: Série no servidor

- **What**: migração com `series_id` anulável e índice; `insertSeriesIfFree` atômico no repositório; `previewRecurring` e `createRecurring` no serviço; ações e server functions.
- **Requirements**: REC-07, REC-08, REC-09, REC-10
- **Tests**: repositório (todas ou nenhuma, falha forçada na última instrução), serviço (parcial, nenhuma livre, prévia mudou, permissão, privacidade, validação por data), ações (401/403/400)
- **Gate**: `bun test src/application/bookings.test.ts src/server/booking-actions.test.ts src/infra/db/flow`
- **Done when**: testes passam; depcruise sem violação.
- **Status**: [ ]

## T3: "Repetir" no formulário

- **What**: seção recolhida "Repetir" no `BookingSheet` com regra, dias, intervalo, término, resumo, prévia (livres e conflitos) e confirmação; "Não repete" mantém a reserva simples.
- **Requirements**: REC-01, REC-02, REC-03, REC-04, REC-07, REC-08, REC-09, REC-10 (AC7)
- **Tests**: `test/components/booking-sheet-repeat.test.tsx`
- **Gate**: `bun test test/components`
- **Done when**: testes passam.
- **Status**: [ ]

## T4 (P2): Série em "Minhas reservas"

- **What**: `MyBooking.inSeries`; selo "Série"; o cancelamento oferece "Somente esta" e "Esta e as próximas" com prévia, no serviço pela mesma condição.
- **Requirements**: REC-11
- **Tests**: serviço (cancelar série avulsa a partir da data, posse), diálogo e lista
- **Gate**: `bun test`
- **Done when**: testes passam; `bun run check` com saída 0.
- **Status**: [ ]

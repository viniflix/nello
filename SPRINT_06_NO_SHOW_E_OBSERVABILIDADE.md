# Sprint 06 - No-show Inteligente + Observabilidade Operacional

## Vinculo com backlog mestre

- E7-S1 (reduzir no-show)
- E8-S3 (observabilidade ponta a ponta)

## Objetivo da sprint

Reduzir perdas operacionais de agenda e dar visibilidade tecnica de falhas/latencias nos fluxos criticos.

## Estado atual reaproveitado (codigo existente)

- `src/pages/nutritionist/tools/AgendaPage.jsx`
- `src/lib/supabase/agenda-queries.js`
- `src/pages/nutritionist/dashboard/NutritionistDashboard.jsx`
- `src/lib/supabase/query-helpers.js`

## Escopo fechado

- Confirmacao automatica D-1 e H-2.
- Registro de status de confirmacao/cancelamento.
- Dashboard de no-show por periodo.
- Painel tecnico de erros e latencia dos fluxos principais.

## Entregaveis tecnicos

- Extensao de schema de `appointments`.
- Nova tabela `appointment_notifications`.
- Worker de notificacoes de consulta.
- Instrumentacao de latencia/erro em:
  - feed
  - plano
  - diario
  - agenda

## Criterios de aceite

- Fluxo de confirmacao altera status da consulta corretamente.
- Relatorio de no-show mensal e exibido no dashboard.
- Alertas tecnicos identificam falha de notificacao em tempo util.
- Reprocessamento de notificacao falha e possivel com seguranca.

## Testes

- Teste de envio agendado em janelas diferentes.
- Teste de consistencia de status quando paciente confirma/cancela.
- Teste de observabilidade com erro simulado em Edge Function.

## Dependencias

- Requer automacoes da Sprint 04 para reaproveitar padrao de executor.

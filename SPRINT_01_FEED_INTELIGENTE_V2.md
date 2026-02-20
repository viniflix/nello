# Sprint 01 - Feed Inteligente 2.0 (Prioridade + Acao Inline)

## Vinculo com backlog mestre

- E1-S1 (score de prioridade)
- E1-S2 (acoes inline)

## Objetivo da sprint

Transformar o feed atual em cockpit operacional: priorizacao clinica automatica e capacidade de resolver/adiar pendencias sem navegar entre telas.

## Estado atual reaproveitado (codigo existente)

- `src/components/nutritionist/NutritionistActivityFeed.jsx`
- `src/components/nutritionist/PatientUpdatesWidget.jsx`
- `src/lib/supabase/patient-queries.js`
- `src/pages/nutritionist/dashboard/NutritionistDashboard.jsx`

## Escopo fechado

- Implementar score composto no backend de feed.
- Exibir no card: nivel de prioridade + motivo.
- Acoes inline: resolver, adiar (snooze), reabrir.
- Persistir acoes em `feed_tasks` com auditoria.

## Entregaveis tecnicos

- Query unificada de feed com score e explicacao.
- Comandos de acao em `patient-queries.js`:
  - `resolveFeedTask`
  - `snoozeFeedTask`
  - `reopenFeedTask`
- Atualizacao da UI do feed e inbox com botoes de acao.
- Badge de prioridade no dashboard.

## Criterios de aceite

- Feed ordena corretamente por prioridade (alta > media > baixa).
- Motivo da prioridade aparece de forma legivel em todos os cards.
- Ao adiar item, ele sai do topo e reaparece no vencimento.
- Ao resolver item, ele nao volta sem novo evento de gatilho.

## Casos de teste

- Caso feliz: resolver 5 itens em sequencia sem recarregar pagina.
- Caso de erro: falha na persistencia mostra feedback sem perder estado local.
- Caso de borda: item com dados incompletos recebe prioridade fallback segura.

## Medicao de sucesso da sprint

- Reducao do tempo medio de triagem no dashboard.
- Aumento da taxa de conclusao de pendencias por sessao.

## Dependencias

- Requer estruturas da `SPRINT_00_FOUNDATION_EVENTS_AND_GOVERNANCE.md`.

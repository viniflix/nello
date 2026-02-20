# Sprint 04 - Automacoes de Follow-up + Exames com Risco

## Vinculo com backlog mestre

- E5-S1 (automacoes por evento)
- E6-S1 (timeline + semaforo de risco em exames)

## Objetivo da sprint

Automatizar comunicacao clinica de follow-up e transformar exames em sinal acionavel de risco com leitura temporal.

## Estado atual reaproveitado (codigo existente)

- `src/pages/nutritionist/patients/LabResultsPage.jsx`
- `src/lib/supabase/lab-results-queries.js`
- `src/components/nutritionist/NutritionistActivityFeed.jsx`
- `src/pages/nutritionist/dashboard/NutritionistDashboard.jsx`

## Escopo fechado

- Motor de automacoes baseado em gatilho (evento clinico).
- Biblioteca inicial de fluxos padrao (plano novo, baixa adesao, meta atrasada).
- Timeline de exames por marcador.
- Semaforo de risco por faixa de referencia.

## Entregaveis tecnicos

- Migrations:
  - `communication_automations`
  - `lab_risk_rules`
- Executor assincrono (Edge Function) para automacoes.
- Card de tendencia em `LabResultsPage.jsx`.
- Indicador de risco no feed e no hub.

## Criterios de aceite

- Automacoes podem ser ativadas/desativadas por nutricionista.
- Disparo ocorre apenas quando condicao e satisfeita.
- Exame exibe evolucao temporal e classificacao de risco.
- Risco alto gera item prioritario no feed.

## Testes

- Teste de nao duplicidade de envio por mesmo gatilho.
- Teste de classificacao de risco para 3 perfis de regra.
- Teste de regressao do upload e leitura de exames existentes.

## Dependencias

- Requer base de eventos consolidada (Sprint 00).
- Se beneficia do feed inteligente (Sprint 01).

# Sprint 02 - Alinhamento Plano-Meta + Tarefas Diarias + Analytics Base

## Vinculo com backlog mestre

- E3-S1 (desalinhamento GET/plano)
- E2-S1 (tarefas do dia)
- E8-S1 (instrumentacao de funil)

## Objetivo da sprint

Conectar prescricoes e metas com acao diaria do paciente, com visibilidade operacional para o nutricionista e instrumentacao de resultados desde o inicio.

## Estado atual reaproveitado (codigo existente)

- `src/components/meal-plan/PlanTargetMonitor.jsx`
- `src/pages/nutritionist/patients/MealPlanPage.jsx`
- `src/pages/nutritionist/patients/GoalsPage.jsx`
- `src/pages/nutritionist/patients/EnergyExpenditurePage.jsx`
- `src/components/patient-hub/tabs/TabContentAdherence.jsx`
- `src/lib/supabase/goals-queries.js`

## Escopo fechado

- Alertar divergencia entre GET/meta e plano ativo.
- Criar checklist diario de tarefas do paciente.
- Mostrar progresso diario no hub.
- Instrumentar eventos de ativacao/engajamento por modulo.

## Entregaveis tecnicos

- Migration SQL:
  - `patient_daily_tasks`
  - `plan_alignment_events`
- Job diario (Edge Function/Scheduler) para gerar tarefas.
- Ajuste de `PlanTargetMonitor.jsx` com limiar configuravel.
- Eventos analytics:
  - `task_generated`
  - `task_completed`
  - `plan_alignment_alert_shown`

## Criterios de aceite

- Alerta de desalinhamento aparece quando limiar e ultrapassado.
- Checklist diario e gerado sem duplicidade por paciente/dia.
- Conclusao de tarefa atualiza progresso no mesmo dia.
- Eventos analytics gravam propriedades minimas definidas no sprint 00.

## Testes

- Teste de regressao no fluxo de criacao/edicao de plano.
- Teste de consistencia de tarefas para 3 fusos horarios.
- Teste de carga basica de geracao diaria (batch de pacientes).

## Dependencias

- Requer Sprint 00 para contrato de eventos.
- Recomendado apos Sprint 01 para aproveitar feed inteligente.

# Sprint 03 - Ajuste de Porcoes + Lembretes Configuraveis

## Vinculo com backlog mestre

- E3-S2 (simulador de ajuste por refeicao)
- E2-S2 (lembretes configuraveis)

## Objetivo da sprint

Elevar a aplicabilidade clinica do plano alimentar e aumentar a aderencia cotidiana do paciente com lembretes personalizados.

## Estado atual reaproveitado (codigo existente)

- `src/components/meal-plan/TemplateManagerDialog.jsx`
- `src/components/meal-plan/MealPlanForm.jsx`
- `src/lib/supabase/meal-plan-queries.js`
- `src/pages/patient/PatientDiaryPage.jsx`
- `src/lib/supabase/food-diary-queries.js`

## Escopo fechado

- Simulador de ajuste de porcoes com preview before/after.
- Aplicacao parcial por refeicao/food.
- Preferencias de lembrete por tipo e horario.
- Canal inicial de lembrete (in-app), preparado para WhatsApp/push.

## Entregaveis tecnicos

- Modulo UI de simulacao em `MealPlanForm.jsx`.
- Persistencia de preferencias:
  - `patient_reminder_preferences`
- Worker de lembretes com registro de entrega.
- Eventos:
  - `portion_simulation_opened`
  - `portion_adjustment_applied`
  - `reminder_sent`

## Criterios de aceite

- Nutricionista visualiza delta de calorias/macros antes de aplicar.
- Ajuste parcial nao quebra consistencia do plano.
- Paciente recebe lembretes conforme preferencias salvas.
- Taxa de envio e status de entrega ficam rastreaveis.

## Testes

- Comparacao de macros antes/depois em planos com 3+ refeicoes.
- Teste de idempotencia do envio de lembretes.
- Teste de fallback para pacientes sem preferencia definida.

## Dependencias

- Usa eventos e padroes definidos na Sprint 00.
- Complementa os alertas de alinhamento da Sprint 02.

# Sprint 05 - Copiloto Clinico v1 + Versionamento de Plano

## Vinculo com backlog mestre

- E4-S1 (copiloto explicavel)
- E3-S3 (versionamento de plano)

## Objetivo da sprint

Entregar assistencia clinica explicavel e segura, junto com historico versionado de planos para dar rastreabilidade de condutas.

## Estado atual reaproveitado (codigo existente)

- `src/pages/nutritionist/patients/PatientHubPage.jsx`
- `src/components/patient-hub/tabs/TabContentClinical.jsx`
- `src/pages/nutritionist/patients/MealPlanPage.jsx`
- `src/lib/supabase/meal-plan-queries.js`
- `src/lib/supabase/goals-queries.js`

## Escopo fechado

- Painel de recomendacoes com justificativa e confianca.
- Aceite manual obrigatorio para aplicar recomendacao.
- Snapshot de versoes de plano em cada edicao relevante.
- Comparativo entre versoes (kcal/macros/refeicoes).

## Entregaveis tecnicos

- Tabela `clinical_recommendations`.
- Tabela `meal_plan_versions`.
- Adaptacao de `updateFullMealPlan` para salvar versao.
- UI no hub para recomendacoes e no modulo de plano para comparativo.

## Criterios de aceite

- Nenhuma recomendacao e aplicada automaticamente.
- Toda recomendacao mostra dados de origem e justificativa.
- Edicao de plano gera versao consultavel.
- Nutricionista consegue comparar versao atual vs anterior.

## Testes

- Teste de trilha de auditoria: recomendacao criada, aceita, aplicada.
- Teste de rollback para versao anterior de plano.
- Teste de permissao: somente profissional autorizado aplica conduta.

## Dependencias

- Base de eventos e auditoria da Sprint 00.
- Ajustes de plano entregues nas Sprints 02 e 03.

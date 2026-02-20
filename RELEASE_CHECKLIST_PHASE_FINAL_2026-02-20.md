# Release Checklist - Fase Final (2026-02-20)

## Escopo Fechado Nesta Rodada

- [x] Padronizacao de datas para utilitarios centrais (`getTodayIsoDate` / `formatDateToIsoDate`) em modulos criticos:
  - `src/pages/nutritionist/patients/GoalsPage.jsx`
  - `src/pages/nutritionist/patients/LabResultsPage.jsx`
  - `src/components/meal-plan/TemplateManagerDialog.jsx`
- [x] Hardening de seguranca no Supabase (fase 21):
  - RLS permissivo removido de `food_household_measures`
  - policies separadas por operacao (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
  - `public.foods` com `security_invoker = true`
  - `search_path` fixado em funcoes sensiveis (`set_updated_at`, `calculate_goal_progress`, `calculate_macro_targets`, `handle_asaas_webhook_update`)
- [x] Correcoes funcionais E2E entre modulos clinicos:
  - metas, GET, plano alimentar e templates

## Validacoes Tecnicas

- [x] Lint dos arquivos alterados sem erros.
- [ ] Build completo do frontend (`npm run build`) no branch atual.
- [ ] Smoke test de navegacao em ambiente local:
  - Antropometria -> GET -> Plano Alimentar -> Metas -> Exames
- [ ] Verificar no Supabase Advisors se nao surgiram novos avisos apos deploy.

## Itens Manuais de Produto (Pre-Release)

- [ ] Fluxo nutricionista:
  - criar/editar avaliacao antropometrica
  - recalcular e salvar GET
  - criar/editar plano e aplicar template
  - criar meta e atualizar progresso
  - anexar/exibir PDF de exame
- [ ] Fluxo paciente:
  - confirmar leitura dos dados mais recentes no app do paciente
  - validar consistencia de calorias e metas exibidas
- [ ] Checklist de seguranca:
  - confirmar "Leaked Password Protection" habilitado no Auth do Supabase
  - revisar variaveis de ambiente de Edge Functions (`ALLOWED_ORIGINS`, chaves)

## Go/No-Go

- Go somente se:
  - build passar,
  - smoke test clinico passar,
  - sem erro critico no Supabase logs (auth/api/postgres) nas ultimas 24h.

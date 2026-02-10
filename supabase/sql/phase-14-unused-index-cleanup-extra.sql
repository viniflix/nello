-- Fase 14: remover indices unused adicionais (nao-FK)
-- Nao remove indices de cobertura de FK (para nao reativar unindexed_foreign_keys).
-- Execute apenas se confirmar que esses indices realmente nao sao usados.

begin;

drop index if exists public.idx_lab_results_patient_date;
drop index if exists public.idx_anamnesis_records_nutritionist;
drop index if exists public.idx_anamnesis_templates_nutritionist;
drop index if exists public.idx_anamnesis_templates_system;
drop index if exists public.idx_anthropometry_patient;
drop index if exists public.idx_appointments_patient_id;
drop index if exists public.idx_appointments_status;
drop index if exists public.idx_appointments_time_nutritionist;
drop index if exists public.idx_chats_from_id;
drop index if exists public.idx_field_options_field_id;
drop index if exists public.idx_financial_date;
drop index if exists public.idx_financial_nutritionist;
drop index if exists public.idx_financial_type;
drop index if exists public.idx_financial_transactions_nutritionist_id;
drop index if exists public.idx_financial_transactions_patient_id;
drop index if exists public.idx_food_measures_food_id;
drop index if exists public.idx_foods_name_trgm;
drop index if exists public.idx_foods_nutritionist;
drop index if exists public.idx_foods_nutritionist_id;
drop index if exists public.idx_foods_source;
drop index if exists public.idx_foods_source_id;
drop index if exists public.idx_meal_audit_meal;
drop index if exists public.idx_meal_edit_history_patient_id;
drop index if exists public.idx_meal_items_food_id;
drop index if exists public.idx_meal_items_meal_id;
drop index if exists public.idx_meal_plan_foods_food;
drop index if exists public.idx_meal_plan_foods_meal;
drop index if exists public.idx_meal_plan_meals_plan;
drop index if exists public.idx_meal_plans_active;
drop index if exists public.idx_meal_plans_nutritionist;
drop index if exists public.idx_meal_plans_patient_active;
drop index if exists public.idx_meals_deleted_at;
drop index if exists public.idx_meals_patient_date;
drop index if exists public.idx_meals_plan_meal;
drop index if exists public.idx_patient_goals_nutritionist;
drop index if exists public.idx_patient_goals_patient;
drop index if exists public.idx_patient_goals_status;
drop index if exists public.idx_prescriptions_nutritionist_id;
drop index if exists public.idx_ref_values_plan;
drop index if exists public.idx_template_fields_template_id;
drop index if exists public.idx_weekly_summaries_nutritionist_id;
drop index if exists public.idx_weekly_summaries_patient_id;

commit;

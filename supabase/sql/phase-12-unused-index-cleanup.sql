-- Fase 12: limpeza de indices nao usados (INFO do linter)
-- Execute apenas apos validar uso em producao/staging.

begin;

drop index if exists public.idx_foods_active;
drop index if exists public.idx_foods_group;
drop index if exists public.idx_meal_history_changed_by;
drop index if exists public.idx_anamnese_fields_category;
drop index if exists public.idx_anamnese_answers_field_id;
drop index if exists public.idx_anamnese_fields_nutritionist_id;
drop index if exists public.idx_anamnesis_records_template_id;
drop index if exists public.idx_food_household_measures_food_id;
drop index if exists public.idx_food_household_measures_measure_id;
drop index if exists public.idx_user_achievements_achievement_id;
drop index if exists public.idx_user_achievements_user_id;
drop index if exists public.idx_patient_goals_energy_expenditure_id;
drop index if exists public.idx_patient_goals_meal_plan_id;
drop index if exists public.idx_glycemia_records_nutritionist_id;
drop index if exists public.idx_appointments_type;
drop index if exists public.idx_glycemia_records_patient_id;
drop index if exists public.idx_chats_to_created;
drop index if exists public.idx_energy_calc_patient;
drop index if exists public.idx_energy_calc_created;
drop index if exists public.idx_anthropometry_nutritionist_feed;
drop index if exists public.idx_prescriptions_patient_dates;
drop index if exists public.idx_meal_edit_history_meal_id;
drop index if exists public.idx_energy_calc_activities;
drop index if exists public.idx_financial_records_patient_id;
drop index if exists public.idx_financial_records_service_id;
drop index if exists public.idx_recurring_expenses_nutritionist_id;
drop index if exists public.idx_services_nutritionist_id;
drop index if exists public.idx_meal_plan_meals_order;
drop index if exists public.idx_lab_results_patient;
drop index if exists public.idx_lab_results_date;
drop index if exists public.idx_meal_plans_template;
drop index if exists public.idx_patient_goals_dates;
drop index if exists public.idx_meal_audit_action;
drop index if exists public.idx_meal_audit_created;
drop index if exists public.idx_household_measures_active;
drop index if exists public.idx_household_measures_code;
drop index if exists public.idx_template_fields_field_id;
drop index if exists public.idx_meals_nutritionist_feed;
drop index if exists public.idx_meals_plan;
drop index if exists public.idx_user_profiles_nutritionist_active;
drop index if exists public.idx_financial_transactions_status;
drop index if exists public.idx_financial_transactions_due_date;
drop index if exists public.idx_anamnesis_patient;
drop index if exists public.idx_anamnesis_records_date;
drop index if exists public.idx_meal_history_meal;
drop index if exists public.idx_meal_history_timestamp;

commit;

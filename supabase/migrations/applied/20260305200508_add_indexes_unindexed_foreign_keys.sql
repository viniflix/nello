-- Add covering indexes for foreign keys (improves JOIN/CASCADE performance)
-- activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_actor_user_id ON public.activity_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_nutritionist_id ON public.activity_log(nutritionist_id);

-- anamnese_field_options
CREATE INDEX IF NOT EXISTS idx_anamnese_field_options_field_id ON public.anamnese_field_options(field_id);

-- anamnesis_records
CREATE INDEX IF NOT EXISTS idx_anamnesis_records_nutritionist_id ON public.anamnesis_records(nutritionist_id);

-- anamnesis_templates
CREATE INDEX IF NOT EXISTS idx_anamnesis_templates_nutritionist_id ON public.anamnesis_templates(nutritionist_id);

-- energy_expenditure_calculations
CREATE INDEX IF NOT EXISTS idx_energy_expenditure_nutritionist_id ON public.energy_expenditure_calculations(nutritionist_id);

-- feed_tasks
CREATE INDEX IF NOT EXISTS idx_feed_tasks_patient_id ON public.feed_tasks(patient_id);
CREATE INDEX IF NOT EXISTS idx_feed_tasks_resolved_by ON public.feed_tasks(resolved_by);

-- financial_records
CREATE INDEX IF NOT EXISTS idx_financial_records_nutritionist_id ON public.financial_records(nutritionist_id);

-- financial_transactions
CREATE INDEX IF NOT EXISTS idx_financial_transactions_nutritionist_id ON public.financial_transactions(nutritionist_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_patient_id ON public.financial_transactions(patient_id);

-- food_measures
CREATE INDEX IF NOT EXISTS idx_food_measures_food_id ON public.food_measures(food_id);

-- foods
CREATE INDEX IF NOT EXISTS idx_foods_nutritionist_id ON public.foods(nutritionist_id);

-- growth_records
CREATE INDEX IF NOT EXISTS idx_growth_records_created_by_user_id ON public.growth_records(created_by_user_id);

-- lab_results
CREATE INDEX IF NOT EXISTS idx_lab_results_patient_id ON public.lab_results(patient_id);

-- meal_audit_log
CREATE INDEX IF NOT EXISTS idx_meal_audit_log_meal_id ON public.meal_audit_log(meal_id);

-- meal_edit_history
CREATE INDEX IF NOT EXISTS idx_meal_edit_history_patient_id ON public.meal_edit_history(patient_id);

-- meal_items
CREATE INDEX IF NOT EXISTS idx_meal_items_food_id ON public.meal_items(food_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON public.meal_items(meal_id);

-- meal_plan_foods
CREATE INDEX IF NOT EXISTS idx_meal_plan_foods_food_id ON public.meal_plan_foods(food_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_foods_meal_plan_meal_id ON public.meal_plan_foods(meal_plan_meal_id);

-- meal_plan_meals
CREATE INDEX IF NOT EXISTS idx_meal_plan_meals_meal_plan_id ON public.meal_plan_meals(meal_plan_id);

-- meal_plans
CREATE INDEX IF NOT EXISTS idx_meal_plans_nutritionist_id ON public.meal_plans(nutritionist_id);

-- meals
CREATE INDEX IF NOT EXISTS idx_meals_meal_plan_meal_id ON public.meals(meal_plan_meal_id);

-- notification_rules
CREATE INDEX IF NOT EXISTS idx_notification_rules_nutritionist_id ON public.notification_rules(nutritionist_id);

-- nutritionist_patients
CREATE INDEX IF NOT EXISTS idx_nutritionist_patients_patient_id ON public.nutritionist_patients(patient_id);

-- operational_observability_log
CREATE INDEX IF NOT EXISTS idx_operational_observability_patient_id ON public.operational_observability_log(patient_id);

-- patient_goals
CREATE INDEX IF NOT EXISTS idx_patient_goals_nutritionist_id ON public.patient_goals(nutritionist_id);
CREATE INDEX IF NOT EXISTS idx_patient_goals_patient_id ON public.patient_goals(patient_id);

-- prescriptions
CREATE INDEX IF NOT EXISTS idx_prescriptions_nutritionist_id ON public.prescriptions(nutritionist_id);

-- progress_photos
CREATE INDEX IF NOT EXISTS idx_progress_photos_uploaded_by ON public.progress_photos(uploaded_by);

-- reminder_delivery_log
CREATE INDEX IF NOT EXISTS idx_reminder_delivery_notification_id ON public.reminder_delivery_log(notification_id);

-- template_dispatch_log
CREATE INDEX IF NOT EXISTS idx_template_dispatch_log_template_id ON public.template_dispatch_log(template_id);

-- weekly_summaries
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_nutritionist_id ON public.weekly_summaries(nutritionist_id);

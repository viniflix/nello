-- CI ONLY: restore manual production structure omitted by recorded migrations.
-- Source: immutable metadata snapshot and successful remote replay a20f86fc.
-- Never deploy this file to production. No CASCADE or error suppression.
SET search_path = public, extensions;
ALTER TYPE "public"."food_source" ADD VALUE 'Nello';
CREATE OR REPLACE VIEW "public"."patient_hub_summary" WITH (security_invoker=true) AS  SELECT id AS patient_id,
    name,
    email,
    phone,
    birth_date,
    goal,
    avatar_url,
    address,
    get_formatted_address(address) AS formatted_address,
    nutritionist_id,
    created_at,
    ( SELECT jsonb_build_object('weight', gr.weight, 'height', gr.height, 'record_date', gr.record_date) AS jsonb_build_object
           FROM growth_records gr
          WHERE (gr.patient_id = p.id)
          ORDER BY gr.record_date DESC
         LIMIT 1) AS latest_metrics,
    ( SELECT a.appointment_time
           FROM appointments a
          WHERE ((a.patient_id = p.id) AND (a.appointment_time <= now()))
          ORDER BY a.appointment_time DESC
         LIMIT 1) AS last_appointment,
    ( SELECT a.appointment_time
           FROM appointments a
          WHERE ((a.patient_id = p.id) AND (a.appointment_time > now()))
          ORDER BY a.appointment_time
         LIMIT 1) AS next_appointment,
    (( SELECT count(*) AS count
           FROM anamnesis_records
          WHERE (anamnesis_records.patient_id = p.id)) > 0) AS has_anamnese,
    (( SELECT count(*) AS count
           FROM growth_records
          WHERE (growth_records.patient_id = p.id)) > 0) AS has_anthropometry,
    (( SELECT count(*) AS count
           FROM prescriptions
          WHERE (prescriptions.patient_id = p.id)) > 0) AS has_prescriptions,
    (( SELECT count(*) AS count
           FROM meals
          WHERE (meals.patient_id = p.id)) > 0) AS has_meals,
    (( SELECT count(*) AS count
           FROM user_achievements
          WHERE (user_achievements.user_id = p.id)) > 0) AS has_achievements
   FROM user_profiles p
  WHERE (user_type = 'patient'::text);
DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM public."anamnese_answers") THEN RAISE EXCEPTION 'Unexpected rows in obsolete CI table anamnese_answers'; END IF; END $empty$;
DROP TABLE public."anamnese_answers" RESTRICT;
DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM public."anamnesis_template_fields") THEN RAISE EXCEPTION 'Unexpected rows in obsolete CI table anamnesis_template_fields'; END IF; END $empty$;
DROP TABLE public."anamnesis_template_fields" RESTRICT;
DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM public."anamnese_field_options") THEN RAISE EXCEPTION 'Unexpected rows in obsolete CI table anamnese_field_options'; END IF; END $empty$;
DROP TABLE public."anamnese_field_options" RESTRICT;
DO $empty$ BEGIN IF EXISTS (SELECT 1 FROM public."anamnese_fields") THEN RAISE EXCEPTION 'Unexpected rows in obsolete CI table anamnese_fields'; END IF; END $empty$;
DROP TABLE public."anamnese_fields" RESTRICT;
ALTER TABLE "public"."energy_expenditure_calculations" ALTER COLUMN "protocol" DROP NOT NULL;
ALTER TABLE "public"."energy_expenditure_calculations" ALTER COLUMN "activity_level" DROP NOT NULL;
ALTER TABLE "public"."energy_expenditure_calculations" ALTER COLUMN "tmb" DROP NOT NULL;
ALTER TABLE "public"."energy_expenditure_calculations" ALTER COLUMN "get" DROP NOT NULL;
ALTER TABLE "public"."food_household_measures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."glycemia_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."household_measures" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON "public"."meal_audit_log" FROM authenticated;
ALTER TABLE "public"."meal_history" ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE ON "public"."meal_history" FROM authenticated;
ALTER TABLE "public"."meal_plan_foods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meal_plan_meals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meal_plan_reference_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meal_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_log" DROP CONSTRAINT "activity_log_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."anamnesis_records" DROP CONSTRAINT "anamnesis_records_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."appointments" DROP CONSTRAINT "appointments_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."appointments" DROP CONSTRAINT "appointments_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."archived_patient_links" DROP CONSTRAINT "archived_patient_links_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."archived_patient_links" DROP CONSTRAINT "archived_patient_links_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."checkin_schedules" DROP CONSTRAINT "checkin_schedules_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."checkin_schedules" DROP CONSTRAINT "checkin_schedules_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."checkin_sessions" DROP CONSTRAINT "checkin_sessions_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."checkin_sessions" DROP CONSTRAINT "checkin_sessions_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."checkin_templates" DROP CONSTRAINT "checkin_templates_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."communication_automations" DROP CONSTRAINT "communication_automations_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."energy_expenditure_calculations" DROP CONSTRAINT "energy_expenditure_calculations_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."financial_records" DROP CONSTRAINT "financial_records_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."financial_records" DROP CONSTRAINT "financial_records_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."financial_transactions" DROP CONSTRAINT "financial_transactions_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."financial_transactions" DROP CONSTRAINT "financial_transactions_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."glycemia_records" DROP CONSTRAINT "glycemia_records_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."glycemia_records" DROP CONSTRAINT "glycemia_records_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."growth_records" DROP CONSTRAINT "growth_records_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."lab_results" DROP CONSTRAINT "lab_results_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."lab_risk_rules" DROP CONSTRAINT "lab_risk_rules_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."meal_edit_history" DROP CONSTRAINT "meal_edit_history_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."meal_history" DROP CONSTRAINT "meal_history_changed_by_fkey" RESTRICT;
ALTER TABLE "public"."meal_plans" DROP CONSTRAINT "meal_plans_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."meal_plans" DROP CONSTRAINT "meal_plans_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."meals" DROP CONSTRAINT "meals_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."nutritionist_branding" DROP CONSTRAINT "nutritionist_branding_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."nutritionist_foods" DROP CONSTRAINT "nutritionist_foods_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."patient_goals" DROP CONSTRAINT "patient_goals_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."patient_reminder_preferences" DROP CONSTRAINT "patient_reminder_preferences_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."progress_photos" DROP CONSTRAINT "progress_photos_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."progress_photos" DROP CONSTRAINT "progress_photos_uploaded_by_fkey" RESTRICT;
ALTER TABLE "public"."recurring_expenses" DROP CONSTRAINT "recurring_expenses_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."reminder_delivery_log" DROP CONSTRAINT "reminder_delivery_log_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."services" DROP CONSTRAINT "services_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."supplement_logs" DROP CONSTRAINT "supplement_logs_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."supplement_logs" DROP CONSTRAINT "supplement_logs_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."weekly_summaries" DROP CONSTRAINT "weekly_summaries_nutritionist_id_fkey" RESTRICT;
ALTER TABLE "public"."weekly_summaries" DROP CONSTRAINT "weekly_summaries_patient_id_fkey" RESTRICT;
ALTER TABLE "public"."anamnesis_records" DROP CONSTRAINT "anamnesis_records_status_check" RESTRICT;
ALTER TABLE "public"."energy_expenditure_calculations" DROP CONSTRAINT "valid_gender" RESTRICT;
ALTER TABLE "public"."anamnesis_records" ADD CONSTRAINT "anamnesis_records_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'pending_patient'::text, 'in_progress'::text, 'submitted'::text, 'validated'::text])));
ALTER TABLE "public"."energy_expenditure_calculations" ADD CONSTRAINT "valid_gender" CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['M'::text, 'F'::text, 'Masculino'::text, 'Feminino'::text, 'male'::text, 'female'::text, 'masculino'::text, 'feminino'::text]))));
ALTER TABLE "public"."growth_records" ADD CONSTRAINT "growth_records_height_positive_chk" CHECK (((height IS NULL) OR (height > (0)::numeric)));
ALTER TABLE "public"."growth_records" ADD CONSTRAINT "growth_records_weight_positive_chk" CHECK (((weight IS NULL) OR (weight > (0)::numeric)));
ALTER TABLE "public"."user_profiles" ADD CONSTRAINT "user_profiles_invite_code_key" UNIQUE (invite_code);
ALTER TABLE "public"."user_profiles" ADD CONSTRAINT "user_profiles_patient_invite_code_key" UNIQUE (patient_invite_code);
ALTER TABLE "public"."activity_log" ADD CONSTRAINT "activity_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
ALTER TABLE "public"."activity_log" ADD CONSTRAINT "activity_log_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES auth.users(id);
ALTER TABLE "public"."activity_log" ADD CONSTRAINT "activity_log_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."anamnesis_records" ADD CONSTRAINT "anamnesis_records_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."archived_patient_links" ADD CONSTRAINT "archived_patient_links_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."archived_patient_links" ADD CONSTRAINT "archived_patient_links_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."checkin_schedules" ADD CONSTRAINT "checkin_schedules_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_schedules" ADD CONSTRAINT "checkin_schedules_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."checkin_sessions" ADD CONSTRAINT "checkin_sessions_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_sessions" ADD CONSTRAINT "checkin_sessions_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."checkin_templates" ADD CONSTRAINT "checkin_templates_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."communication_automations" ADD CONSTRAINT "communication_automations_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."energy_expenditure_calculations" ADD CONSTRAINT "energy_expenditure_calculations_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."energy_expenditure_calculations" ADD CONSTRAINT "energy_expenditure_calculations_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."financial_records" ADD CONSTRAINT "financial_records_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."financial_records" ADD CONSTRAINT "financial_records_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."financial_transactions" ADD CONSTRAINT "financial_transactions_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."financial_transactions" ADD CONSTRAINT "financial_transactions_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."glycemia_records" ADD CONSTRAINT "glycemia_records_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."glycemia_records" ADD CONSTRAINT "glycemia_records_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."growth_records" ADD CONSTRAINT "growth_records_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."growth_records" ADD CONSTRAINT "growth_records_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."growth_records" ADD CONSTRAINT "growth_records_supersedes_record_id_fkey" FOREIGN KEY (supersedes_record_id) REFERENCES growth_records(id) ON DELETE SET NULL;
ALTER TABLE "public"."lab_results" ADD CONSTRAINT "lab_results_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."lab_risk_rules" ADD CONSTRAINT "lab_risk_rules_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."meal_edit_history" ADD CONSTRAINT "meal_edit_history_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."meal_history" ADD CONSTRAINT "meal_history_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."meal_plans" ADD CONSTRAINT "meal_plans_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."meal_plans" ADD CONSTRAINT "meal_plans_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."meals" ADD CONSTRAINT "meals_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."nutritionist_branding" ADD CONSTRAINT "nutritionist_branding_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."nutritionist_foods" ADD CONSTRAINT "nutritionist_foods_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."patient_goals" ADD CONSTRAINT "patient_goals_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
ALTER TABLE "public"."patient_reminder_preferences" ADD CONSTRAINT "patient_reminder_preferences_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."progress_photos" ADD CONSTRAINT "progress_photos_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."progress_photos" ADD CONSTRAINT "progress_photos_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "public"."recurring_expenses" ADD CONSTRAINT "recurring_expenses_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."reminder_delivery_log" ADD CONSTRAINT "reminder_delivery_log_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."services" ADD CONSTRAINT "services_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_logs" ADD CONSTRAINT "supplement_logs_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."supplement_logs" ADD CONSTRAINT "supplement_logs_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE;
ALTER TABLE "public"."weekly_summaries" ADD CONSTRAINT "weekly_summaries_nutritionist_id_fkey" FOREIGN KEY (nutritionist_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "public"."weekly_summaries" ADD CONSTRAINT "weekly_summaries_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES user_profiles(id) ON UPDATE CASCADE ON DELETE CASCADE;
DROP INDEX "public"."idx_anamnesis_patient" RESTRICT;
DROP INDEX "public"."idx_anamnesis_records_date" RESTRICT;
DROP INDEX "public"."idx_anamnesis_records_nutritionist" RESTRICT;
DROP INDEX "public"."idx_anamnesis_templates_nutritionist" RESTRICT;
DROP INDEX "public"."idx_anamnesis_templates_system" RESTRICT;
DROP INDEX "public"."idx_appointments_patient_id" RESTRICT;
DROP INDEX "public"."idx_appointments_status" RESTRICT;
DROP INDEX "public"."idx_appointments_time_nutritionist" RESTRICT;
DROP INDEX "public"."idx_appointments_type" RESTRICT;
DROP INDEX "public"."idx_chats_from_id" RESTRICT;
DROP INDEX "public"."idx_chats_to_created" RESTRICT;
DROP INDEX "public"."idx_energy_calc_activities" RESTRICT;
DROP INDEX "public"."idx_energy_calc_created" RESTRICT;
DROP INDEX "public"."idx_energy_calc_patient" RESTRICT;
DROP INDEX "public"."idx_financial_date" RESTRICT;
DROP INDEX "public"."idx_financial_nutritionist" RESTRICT;
DROP INDEX "public"."idx_financial_type" RESTRICT;
DROP INDEX "public"."idx_financial_transactions_due_date" RESTRICT;
DROP INDEX "public"."idx_financial_transactions_status" RESTRICT;
DROP INDEX "public"."idx_anthropometry_nutritionist_feed" RESTRICT;
DROP INDEX "public"."idx_anthropometry_patient" RESTRICT;
DROP INDEX "public"."idx_household_measures_active" RESTRICT;
DROP INDEX "public"."idx_household_measures_code" RESTRICT;
DROP INDEX "public"."idx_lab_results_date" RESTRICT;
DROP INDEX "public"."idx_lab_results_patient" RESTRICT;
DROP INDEX "public"."idx_lab_results_patient_date" RESTRICT;
DROP INDEX "public"."idx_meal_audit_action" RESTRICT;
DROP INDEX "public"."idx_meal_audit_created" RESTRICT;
DROP INDEX "public"."idx_meal_audit_meal" RESTRICT;
DROP INDEX "public"."idx_meal_edit_history_meal_id" RESTRICT;
DROP INDEX "public"."idx_meal_history_meal" RESTRICT;
DROP INDEX "public"."idx_meal_history_timestamp" RESTRICT;
DROP INDEX "public"."idx_meal_plan_foods_food" RESTRICT;
DROP INDEX "public"."idx_meal_plan_foods_meal" RESTRICT;
DROP INDEX "public"."idx_meal_plan_meals_order" RESTRICT;
DROP INDEX "public"."idx_meal_plan_meals_plan" RESTRICT;
DROP INDEX "public"."idx_ref_values_plan" RESTRICT;
DROP INDEX "public"."idx_meal_plans_active" RESTRICT;
DROP INDEX "public"."idx_meal_plans_nutritionist" RESTRICT;
DROP INDEX "public"."idx_meal_plans_patient_active" RESTRICT;
DROP INDEX "public"."idx_meal_plans_template" RESTRICT;
DROP INDEX "public"."idx_meals_deleted_at" RESTRICT;
DROP INDEX "public"."idx_meals_nutritionist_feed" RESTRICT;
DROP INDEX "public"."idx_meals_patient_date" RESTRICT;
DROP INDEX "public"."idx_meals_plan" RESTRICT;
DROP INDEX "public"."idx_meals_plan_meal" RESTRICT;
DROP INDEX "public"."idx_patient_goals_dates" RESTRICT;
DROP INDEX "public"."idx_patient_goals_nutritionist" RESTRICT;
DROP INDEX "public"."idx_patient_goals_patient" RESTRICT;
DROP INDEX "public"."idx_patient_goals_status" RESTRICT;
DROP INDEX "public"."idx_prescriptions_patient" RESTRICT;
DROP INDEX "public"."idx_prescriptions_patient_dates" RESTRICT;
DROP INDEX "public"."idx_user_profiles_nutritionist_active" RESTRICT;
DROP INDEX "public"."idx_weekly_summaries_patient_id" RESTRICT;
CREATE INDEX idx_anamnesis_records_anamnesis_records_template_id_fkey_fk ON public.anamnesis_records USING btree (template_id);
CREATE INDEX idx_anamnesis_records_patient_created ON public.anamnesis_records USING btree (patient_id, created_at DESC);
CREATE INDEX idx_appointments_nutritionist_start ON public.appointments USING btree (nutritionist_id, start_time) WHERE (start_time IS NOT NULL);
CREATE INDEX idx_appointments_start_time_status ON public.appointments USING btree (start_time, status);
CREATE INDEX idx_financial_records_financial_records_patient_id_fkey_fk ON public.financial_records USING btree (patient_id);
CREATE INDEX idx_financial_records_financial_records_service_id_fkey_fk ON public.financial_records USING btree (service_id);
CREATE INDEX idx_food_household_measures_food_household_measures_measure_id_ ON public.food_household_measures USING btree (measure_id);
CREATE INDEX idx_glycemia_records_glycemia_records_nutritionist_id_fkey_fk ON public.glycemia_records USING btree (nutritionist_id);
CREATE INDEX idx_glycemia_records_glycemia_records_patient_id_fkey_fk ON public.glycemia_records USING btree (patient_id);
CREATE UNIQUE INDEX idx_growth_records_latest_unique ON public.growth_records USING btree (revision_group_id) WHERE (is_latest_revision = true);
CREATE INDEX idx_growth_records_revision_group ON public.growth_records USING btree (revision_group_id, revision_number DESC);
CREATE INDEX idx_growth_records_supersedes ON public.growth_records USING btree (supersedes_record_id);
CREATE INDEX idx_meal_audit_log_patient_created ON public.meal_audit_log USING btree (patient_id, created_at DESC);
CREATE INDEX idx_meal_audit_log_patient_meal_date ON public.meal_audit_log USING btree (patient_id, meal_date DESC);
CREATE INDEX idx_meal_edit_history_meal_edit_history_meal_id_fkey_fk ON public.meal_edit_history USING btree (meal_id);
CREATE INDEX idx_meal_history_meal_history_changed_by_fkey_fk ON public.meal_history USING btree (changed_by);
CREATE INDEX idx_meal_history_meal_history_meal_id_fkey_fk ON public.meal_history USING btree (meal_id);
CREATE INDEX idx_meals_meals_meal_plan_id_fkey_fk ON public.meals USING btree (meal_plan_id);
CREATE INDEX idx_meals_patient_meal_date ON public.meals USING btree (patient_id, meal_date DESC);
CREATE INDEX idx_notifications_content_gin ON public.notifications USING gin (content);
CREATE INDEX idx_notifications_user_type_created ON public.notifications USING btree (user_id, type, created_at DESC);
CREATE INDEX idx_notifications_user_unread_created ON public.notifications USING btree (user_id, is_read, created_at DESC);
CREATE INDEX idx_patient_goals_patient_goals_energy_expenditure_id_fkey_fk ON public.patient_goals USING btree (energy_expenditure_id);
CREATE INDEX idx_patient_goals_patient_goals_meal_plan_id_fkey_fk ON public.patient_goals USING btree (meal_plan_id);
CREATE INDEX idx_recurring_expenses_recurring_expenses_nutritionist_id_fkey_ ON public.recurring_expenses USING btree (nutritionist_id);
CREATE INDEX idx_services_services_nutritionist_id_fkey_fk ON public.services USING btree (nutritionist_id);
CREATE INDEX idx_user_achievements_user_achievements_achievement_id_fkey_fk ON public.user_achievements USING btree (achievement_id);
CREATE UNIQUE INDEX idx_user_profiles_nutritionist_slug ON public.user_profiles USING btree (nutritionist_id, slug) WHERE ((nutritionist_id IS NOT NULL) AND (slug IS NOT NULL));
CREATE TRIGGER trg_growth_records_apply_versioning BEFORE INSERT ON public.growth_records FOR EACH ROW EXECUTE FUNCTION trg_growth_records_apply_versioning();
CREATE TRIGGER trg_growth_records_mark_previous_not_latest AFTER INSERT ON public.growth_records FOR EACH ROW EXECUTE FUNCTION trg_growth_records_mark_previous_not_latest();
CREATE TRIGGER trg_growth_records_sync_modules AFTER INSERT ON public.growth_records FOR EACH ROW EXECUTE FUNCTION trg_growth_records_sync_modules();
CREATE TRIGGER trg_growth_records_validate_clinical BEFORE INSERT OR UPDATE ON public.growth_records FOR EACH ROW EXECUTE FUNCTION trg_growth_records_validate_clinical();
CREATE TRIGGER trg_sync_notification_read_state BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION private.sync_notification_read_state();
CREATE TRIGGER tr_set_invite_code BEFORE INSERT ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION trg_set_invite_code();
CREATE TRIGGER trg_user_profiles_sync_slug BEFORE INSERT OR UPDATE OF name ON public.user_profiles FOR EACH ROW WHEN (((new.user_type = 'patient'::text) AND (new.nutritionist_id IS NOT NULL))) EXECUTE FUNCTION user_profiles_sync_slug();
-- Provider-owned defaults require the isolated runner's provider role, not postgres.
-- The workflow applies scripts/backend/provider-defaults.sql after normal replay.

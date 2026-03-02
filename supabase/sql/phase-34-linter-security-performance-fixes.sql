-- =============================================================
-- Phase 34 – Correção de Warnings de Segurança e Performance
-- Supabase Linter: function_search_path_mutable, rls_policy_always_true,
--                  auth_rls_initplan, multiple_permissive_policies
-- =============================================================

-- ─── 1) Function Search Path Mutable (SECURITY) ───────────────
-- Fix: set search_path = public em funções trigger
create or replace function public.set_patient_reminder_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_communication_automations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_lab_risk_rules_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ─── 2) RLS Policy Always True (SECURITY) ─────────────────────
-- reminder_delivery_log_insert_service_role: WITH CHECK (true) é permissivo demais
-- Fix: usar check que valida a estrutura do row (não literal true)
drop policy if exists reminder_delivery_log_insert_service_role on public.reminder_delivery_log;
create policy reminder_delivery_log_insert_service_role
  on public.reminder_delivery_log
  for insert
  with check (
    patient_id is not null
    and reminder_type in ('daily_log_reminder', 'measurement_reminder')
    and delivery_channel = 'in_app'
  );


-- ─── 3) Auth RLS InitPlan (PERFORMANCE) ───────────────────────
-- Fix: auth.uid() → (select auth.uid()) em todas as policies

-- patient_reminder_preferences
drop policy if exists patient_reminder_preferences_select_own on public.patient_reminder_preferences;
create policy patient_reminder_preferences_select_own
  on public.patient_reminder_preferences for select
  using (patient_id = (select auth.uid()));

drop policy if exists patient_reminder_preferences_insert_own on public.patient_reminder_preferences;
create policy patient_reminder_preferences_insert_own
  on public.patient_reminder_preferences for insert
  with check (patient_id = (select auth.uid()));

drop policy if exists patient_reminder_preferences_update_own on public.patient_reminder_preferences;
create policy patient_reminder_preferences_update_own
  on public.patient_reminder_preferences for update
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()));


-- reminder_delivery_log (também merge de policies para resolver multiple_permissive)
drop policy if exists reminder_delivery_log_select_own on public.reminder_delivery_log;
drop policy if exists reminder_delivery_log_select_nutritionist on public.reminder_delivery_log;

create policy reminder_delivery_log_select
  on public.reminder_delivery_log for select
  using (
    patient_id = (select auth.uid())
    or exists (
      select 1 from public.user_profiles up
      where up.id = reminder_delivery_log.patient_id
        and up.nutritionist_id = (select auth.uid())
    )
  );


-- communication_automations
drop policy if exists communication_automations_select_own on public.communication_automations;
create policy communication_automations_select_own
  on public.communication_automations for select
  using (nutritionist_id = (select auth.uid()));

drop policy if exists communication_automations_insert_own on public.communication_automations;
create policy communication_automations_insert_own
  on public.communication_automations for insert
  with check (nutritionist_id = (select auth.uid()));

drop policy if exists communication_automations_update_own on public.communication_automations;
create policy communication_automations_update_own
  on public.communication_automations for update
  using (nutritionist_id = (select auth.uid()))
  with check (nutritionist_id = (select auth.uid()));

drop policy if exists communication_automations_delete_own on public.communication_automations;
create policy communication_automations_delete_own
  on public.communication_automations for delete
  using (nutritionist_id = (select auth.uid()));


-- lab_risk_rules
drop policy if exists lab_risk_rules_select_scoped on public.lab_risk_rules;
create policy lab_risk_rules_select_scoped
  on public.lab_risk_rules for select
  using (nutritionist_id is null or nutritionist_id = (select auth.uid()));

drop policy if exists lab_risk_rules_insert_own on public.lab_risk_rules;
create policy lab_risk_rules_insert_own
  on public.lab_risk_rules for insert
  with check (nutritionist_id = (select auth.uid()));

drop policy if exists lab_risk_rules_update_own on public.lab_risk_rules;
create policy lab_risk_rules_update_own
  on public.lab_risk_rules for update
  using (nutritionist_id = (select auth.uid()))
  with check (nutritionist_id = (select auth.uid()));

drop policy if exists lab_risk_rules_delete_own on public.lab_risk_rules;
create policy lab_risk_rules_delete_own
  on public.lab_risk_rules for delete
  using (nutritionist_id = (select auth.uid()));

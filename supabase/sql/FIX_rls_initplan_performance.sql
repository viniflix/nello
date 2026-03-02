-- Corrige warnings auth_rls_initplan (performance)
-- Envolve auth.uid() e public.is_admin() em (select ...) para avaliação única por query
-- Ver: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

begin;

-- notification_rules
drop policy if exists "notification_rules_select_owner_or_global" on public.notification_rules;
create policy "notification_rules_select_owner_or_global" on public.notification_rules for select to authenticated
  using (nutritionist_id is null or nutritionist_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "notification_rules_insert_owner_or_admin" on public.notification_rules;
create policy "notification_rules_insert_owner_or_admin" on public.notification_rules for insert to authenticated
  with check (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "notification_rules_update_owner_or_admin" on public.notification_rules;
create policy "notification_rules_update_owner_or_admin" on public.notification_rules for update to authenticated
  using (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "notification_rules_delete_owner_or_admin" on public.notification_rules;
create policy "notification_rules_delete_owner_or_admin" on public.notification_rules for delete to authenticated
  using (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

-- feed_tasks
drop policy if exists "feed_tasks_select_owner" on public.feed_tasks;
create policy "feed_tasks_select_owner" on public.feed_tasks for select to authenticated
  using (nutritionist_id = (select auth.uid()));

drop policy if exists "feed_tasks_insert_owner" on public.feed_tasks;
create policy "feed_tasks_insert_owner" on public.feed_tasks for insert to authenticated
  with check (nutritionist_id = (select auth.uid()));

drop policy if exists "feed_tasks_update_owner" on public.feed_tasks;
create policy "feed_tasks_update_owner" on public.feed_tasks for update to authenticated
  using (nutritionist_id = (select auth.uid())) with check (nutritionist_id = (select auth.uid()));

drop policy if exists "feed_tasks_delete_owner" on public.feed_tasks;
create policy "feed_tasks_delete_owner" on public.feed_tasks for delete to authenticated
  using (nutritionist_id = (select auth.uid()));

-- operational_observability_log
drop policy if exists operational_observability_select_scoped on public.operational_observability_log;
create policy operational_observability_select_scoped on public.operational_observability_log for select to authenticated
  using (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists operational_observability_insert_authenticated on public.operational_observability_log;
create policy operational_observability_insert_authenticated on public.operational_observability_log for insert to authenticated
  with check (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

commit;

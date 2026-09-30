-- Wave D advisor closeout: one episode-scoped history policy and covering FK indexes.
do $$
declare v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname='public'and tablename='meal_plan_versions'
      and policyname<>'meal_plan_versions_episode_select'
  loop
    execute format('drop policy %I on public.meal_plan_versions',v_policy.policyname);
  end loop;
end$$;

drop policy if exists meal_plan_versions_episode_select on public.meal_plan_versions;
create policy meal_plan_versions_episode_select on public.meal_plan_versions
for select to authenticated
using(patient_id=(select auth.uid())or(care_episode_id is not null and private.can_read_care_episode(care_episode_id)));

create index if not exists clinical_calculation_snapshots_episode_idx on public.clinical_calculation_snapshots(care_episode_id,created_at desc);
create index if not exists clinical_calculation_snapshots_confirmed_by_idx on public.clinical_calculation_snapshots(confirmed_by,confirmed_at desc);
create index if not exists clinical_calculation_snapshots_nutritionist_idx on public.clinical_calculation_snapshots(nutritionist_id,created_at desc);
create index if not exists clinical_protocol_catalog_source_idx on public.clinical_protocol_catalog(source_code,source_version);
create index if not exists diet_template_versions_created_by_idx on public.diet_template_versions(created_by,created_at desc);
create index if not exists meal_plan_versions_episode_idx on public.meal_plan_versions(care_episode_id,version_number desc);

-- Align meal-plan writes with the canonical B2/B4 authorization model.
-- Historical episodes remain readable, but only an approved professional
-- owning the active episode may create or mutate a patient's meal plan.

create or replace function private.can_write_active_meal_plan(
  p_patient_id uuid,
  p_nutritionist_id uuid,
  p_care_episode_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_nutritionist_id = auth.uid()
    and private.has_current_clinical_capacity(auth.uid())
    and (
      p_patient_id is null
      or exists (
        select 1
        from public.care_episodes ce
        where ce.id = p_care_episode_id
          and ce.patient_id = p_patient_id
          and ce.nutritionist_id = auth.uid()
          and ce.status = 'active'
      )
    );
$$;

revoke all on function private.can_write_active_meal_plan(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_write_active_meal_plan(uuid, uuid, uuid)
  to authenticated;

create or replace function private.enforce_meal_plan_write_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.meal_plans%rowtype;
begin
  -- Migrations, maintenance and service jobs are not browser JWT writes.
  if coalesce(auth.role(), '') <> 'authenticated' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  if not private.can_write_active_meal_plan(
    v_row.patient_id,
    v_row.nutritionist_id,
    v_row.care_episode_id
  ) then
    raise exception
      'O plano só pode ser alterado pelo profissional responsável em um atendimento ativo.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' and not old.is_draft then
    raise exception
      'Planos clínicos salvos não podem ser apagados; inative ou versione o plano.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_meal_plan_write_authorization()
  from public, anon, authenticated;

drop trigger if exists trg_z_enforce_meal_plan_write_authorization
  on public.meal_plans;

create trigger trg_z_enforce_meal_plan_write_authorization
before insert or update or delete on public.meal_plans
for each row execute function private.enforce_meal_plan_write_authorization();

drop policy if exists "Nutritionists insert meal_plans" on public.meal_plans;
drop policy if exists "Nutritionists update meal_plans" on public.meal_plans;
drop policy if exists "Nutritionists delete meal_plans" on public.meal_plans;
drop policy if exists "Read meal_plans" on public.meal_plans;

create policy "Read meal_plans"
on public.meal_plans
for select
to authenticated
using (
  patient_id = (select auth.uid())
  or (
    patient_id is null
    and nutritionist_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.care_episodes ce
    where ce.id = care_episode_id
      and (
        ce.patient_id = (select auth.uid())
        or ce.nutritionist_id = (select auth.uid())
      )
  )
);

create policy "Nutritionists insert meal_plans"
on public.meal_plans
for insert
to authenticated
with check (
  private.can_write_active_meal_plan(
    patient_id,
    nutritionist_id,
    care_episode_id
  )
);

create policy "Nutritionists update meal_plans"
on public.meal_plans
for update
to authenticated
using (
  private.can_write_active_meal_plan(
    patient_id,
    nutritionist_id,
    care_episode_id
  )
)
with check (
  private.can_write_active_meal_plan(
    patient_id,
    nutritionist_id,
    care_episode_id
  )
);

create policy "Nutritionists delete meal_plans"
on public.meal_plans
for delete
to authenticated
using (
  is_draft
  and private.can_write_active_meal_plan(
    patient_id,
    nutritionist_id,
    care_episode_id
  )
);

-- These are browser-facing RPCs. Anonymous execution is never valid.
revoke execute on function public.upsert_full_meal_plan(bigint, jsonb, jsonb)
  from public, anon;
revoke execute on function public.promote_draft_to_active(bigint, uuid)
  from public, anon;
revoke execute on function public.set_active_meal_plan(bigint)
  from public, anon;
revoke execute on function public.clone_diet_template_to_patient(uuid, uuid, uuid, text)
  from public, anon;

grant execute on function public.upsert_full_meal_plan(bigint, jsonb, jsonb)
  to authenticated;
grant execute on function public.promote_draft_to_active(bigint, uuid)
  to authenticated;
grant execute on function public.set_active_meal_plan(bigint)
  to authenticated;
grant execute on function public.clone_diet_template_to_patient(uuid, uuid, uuid, text)
  to authenticated;

begin;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'anamnesis_templates';
  if v_count <> 5 then
    raise exception 's02_anamnesis_template_policy_count:%', v_count;
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='anamnesis_templates' and policyname='wave05_active_actor' and permissive='RESTRICTIVE') then raise exception 'wave05_active_actor_policy_missing';end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'anamnesis_templates'
      and roles <> array['authenticated']::name[]
  ) then
    raise exception 's02_anamnesis_template_policy_role_drift';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'diet_templates', 'diet_template_meals', 'diet_template_foods',
        'diet_template_food_substitutions', 'meal_templates',
        'meal_template_foods', 'meal_template_food_substitutions',
        'recipes', 'recipe_ingredients', 'nutritionist_custom_measures'
      )
      and roles <> array['authenticated']::name[]
  ) then
    raise exception 's02_optimized_policy_role_drift';
  end if;
end;
$$;

select set_config(
  's02.user_a',
  (select id::text from public.user_profiles where user_type = 'nutritionist' order by id limit 1),
  true
);
select set_config(
  's02.user_b',
  (select id::text from public.user_profiles where user_type = 'nutritionist' order by id offset 1 limit 1),
  true
);

do $$
begin
  if nullif(current_setting('s02.user_a', true), '') is null
     or nullif(current_setting('s02.user_b', true), '') is null then
    raise exception 's02_requires_two_nutritionist_fixtures';
  end if;
end;
$$;

insert into public.anamnesis_templates(
  id, nutritionist_id, title, sections, is_system_default
) values
  ('81000000-0000-0000-0000-000000000001', null, 'Sistema S02', '[]'::jsonb, true),
  ('81000000-0000-0000-0000-000000000002', current_setting('s02.user_a')::uuid, 'Próprio S02', '[]'::jsonb, false),
  ('81000000-0000-0000-0000-000000000003', current_setting('s02.user_b')::uuid, 'Alheio S02', '[]'::jsonb, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('s02.user_a'), true);
do $$
declare
  v_count integer;
  v_affected integer;
begin
  select count(*) into v_count
  from public.anamnesis_templates
  where id in (
    '81000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000003'
  );
  if v_count <> 2 then
    raise exception 's02_template_select_scope:%', v_count;
  end if;

  insert into public.anamnesis_templates(nutritionist_id, title, sections, is_system_default)
  values (current_setting('s02.user_a')::uuid, 'Novo próprio S02', '[]'::jsonb, false);

  update public.anamnesis_templates
  set title = 'Sistema alterado indevidamente'
  where id = '81000000-0000-0000-0000-000000000001';
  get diagnostics v_affected = row_count;
  if v_affected <> 0 then
    raise exception 's02_system_template_was_updated';
  end if;

  begin
    insert into public.anamnesis_templates(nutritionist_id, title, sections, is_system_default)
    values (current_setting('s02.user_a')::uuid, 'Sistema falso S02', '[]'::jsonb, true);
    raise exception 's02_user_created_system_template';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.anamnesis_templates(nutritionist_id, title, sections, is_system_default)
    values (current_setting('s02.user_b')::uuid, 'Template alheio S02', '[]'::jsonb, false);
    raise exception 's02_user_created_foreign_template';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  if exists (
    select 1
    from public.anamnesis_templates
    where id in (
      '81000000-0000-0000-0000-000000000001',
      '81000000-0000-0000-0000-000000000002',
      '81000000-0000-0000-0000-000000000003'
    )
  ) then
    raise exception 's02_anon_read_anamnesis_templates_directly';
  end if;
end;
$$;

rollback;

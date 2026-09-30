alter table public.meal_plan_foods
  add column if not exists patient_description text;

create table if not exists public.meal_plan_food_substitutions (
  id bigserial primary key,
  meal_plan_food_id bigint not null references public.meal_plan_foods(id) on delete cascade,
  substitute_food_id uuid not null,
  notes text,
  created_at timestamptz default now()
);

alter table public.meal_plan_food_substitutions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'meal_plan_food_substitutions'
  ) then
    create policy "Access meal_plan_food_substitutions via meal_plan_foods"
      on public.meal_plan_food_substitutions
      for all
      using (
        exists (
          select 1
          from public.meal_plan_foods f
          join public.meal_plan_meals m on m.id = f.meal_plan_meal_id
          join public.meal_plans p on p.id = m.meal_plan_id
          where f.id = meal_plan_food_substitutions.meal_plan_food_id
            and (
              p.patient_id = (select auth_uid() as uid)
              or exists (
                select 1 from public.user_profiles up
                where up.id = p.patient_id and up.nutritionist_id = (select auth_uid() as uid)
              )
            )
        )
      )
      with check (
        exists (
          select 1
          from public.meal_plan_foods f
          join public.meal_plan_meals m on m.id = f.meal_plan_meal_id
          join public.meal_plans p on p.id = m.meal_plan_id
          where f.id = meal_plan_food_substitutions.meal_plan_food_id
            and (
              p.patient_id = (select auth_uid() as uid)
              or exists (
                select 1 from public.user_profiles up
                where up.id = p.patient_id and up.nutritionist_id = (select auth_uid() as uid)
              )
            )
        )
      );
  end if;
end $$;

create index if not exists idx_meal_plan_food_substitutions_food_id
  on public.meal_plan_food_substitutions (meal_plan_food_id);

create index if not exists idx_meal_plan_food_substitutions_substitute_id
  on public.meal_plan_food_substitutions (substitute_food_id);

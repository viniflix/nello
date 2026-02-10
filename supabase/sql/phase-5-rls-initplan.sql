-- Fase 5: otimizar policies (auth_rls_initplan)
-- Objetivo: substituir auth.uid()/auth.role() por subselect para evitar reavaliacao por linha.

begin;

-- user_profiles
drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles
for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "Nutritionists can read their patients" on public.user_profiles;
create policy "Nutritionists can read their patients"
on public.user_profiles
for select
to authenticated
using (
  (select public.is_nutritionist())
  and user_type = 'patient'
  and nutritionist_id = (select auth.uid())
);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and is_admin is not distinct from (select is_admin from public.user_profiles where id = (select auth.uid()))
  and user_type is not distinct from (select user_type from public.user_profiles where id = (select auth.uid()))
);

drop policy if exists "Users can insert own profile (temporary)" on public.user_profiles;
create policy "Users can insert own profile (temporary)"
on public.user_profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and user_type in ('patient','nutritionist')
  and is_admin is not true
);

-- meal_plans
drop policy if exists "Patients can read own meal plans" on public.meal_plans;
create policy "Patients can read own meal plans"
on public.meal_plans
for select
to authenticated
using (patient_id = (select auth.uid()));

drop policy if exists "Nutritionists manage patient meal plans" on public.meal_plans;
create policy "Nutritionists manage patient meal plans"
on public.meal_plans
for all
to authenticated
using (
  (select public.is_nutritionist())
  and exists (
    select 1 from public.user_profiles up
    where up.id = public.meal_plans.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
)
with check (
  (select public.is_nutritionist())
  and exists (
    select 1 from public.user_profiles up
    where up.id = public.meal_plans.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
);

-- meal_plan_meals
drop policy if exists "Access meal_plan_meals via meal_plans" on public.meal_plan_meals;
create policy "Access meal_plan_meals via meal_plans"
on public.meal_plan_meals
for all
to authenticated
using (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (
        p.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (
        p.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
);

-- meal_plan_foods
drop policy if exists "Access meal_plan_foods via meal_plan_meals" on public.meal_plan_foods;
create policy "Access meal_plan_foods via meal_plan_meals"
on public.meal_plan_foods
for all
to authenticated
using (
  exists (
    select 1
    from public.meal_plan_meals m
    join public.meal_plans p on p.id = m.meal_plan_id
    where m.id = meal_plan_meal_id
      and (
        p.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.meal_plan_meals m
    join public.meal_plans p on p.id = m.meal_plan_id
    where m.id = meal_plan_meal_id
      and (
        p.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
);

-- meal_plan_reference_values
drop policy if exists "Access meal_plan_reference_values via meal_plans" on public.meal_plan_reference_values;
create policy "Access meal_plan_reference_values via meal_plans"
on public.meal_plan_reference_values
for all
to authenticated
using (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (
        p.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (
        p.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
);

-- meals
drop policy if exists "Access meals for patient or nutritionist" on public.meals;
create policy "Access meals for patient or nutritionist"
on public.meals
for all
to authenticated
using (
  patient_id = (select auth.uid())
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.meals.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
)
with check (
  patient_id = (select auth.uid())
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.meals.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
);

-- meal_items
drop policy if exists "Access meal_items via meals" on public.meal_items;
create policy "Access meal_items via meals"
on public.meal_items
for all
to authenticated
using (
  exists (
    select 1 from public.meals m
    where m.id = meal_id
      and (
        m.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = m.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
)
with check (
  exists (
    select 1 from public.meals m
    where m.id = meal_id
      and (
        m.patient_id = (select auth.uid())
        or exists (
          select 1 from public.user_profiles up
          where up.id = m.patient_id
            and up.nutritionist_id = (select auth.uid())
        )
      )
  )
);

-- meal_audit_log
drop policy if exists "Access meal_audit_log" on public.meal_audit_log;
create policy "Access meal_audit_log"
on public.meal_audit_log
for select
to authenticated
using (
  patient_id = (select auth.uid())
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.meal_audit_log.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
);

-- lab_results
drop policy if exists "Access lab_results" on public.lab_results;
create policy "Access lab_results"
on public.lab_results
for all
to authenticated
using (
  patient_id = (select auth.uid())
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.lab_results.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
)
with check (
  patient_id = (select auth.uid())
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.lab_results.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
);

-- appointments
drop policy if exists "Nutritionists manage own appointments" on public.appointments;
create policy "Nutritionists manage own appointments"
on public.appointments
for all
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = public.appointments.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = public.appointments.patient_id
      and up.nutritionist_id = (select auth.uid())
  )
);

drop policy if exists "Patients read own appointments" on public.appointments;
create policy "Patients read own appointments"
on public.appointments
for select
to authenticated
using (patient_id = (select auth.uid()));

-- financial_*
drop policy if exists "Nutritionists manage financial_records" on public.financial_records;
create policy "Nutritionists manage financial_records"
on public.financial_records
for all
to authenticated
using (nutritionist_id = (select auth.uid()))
with check (nutritionist_id = (select auth.uid()));

drop policy if exists "Nutritionists manage financial_transactions" on public.financial_transactions;
create policy "Nutritionists manage financial_transactions"
on public.financial_transactions
for all
to authenticated
using (nutritionist_id = (select auth.uid()))
with check (nutritionist_id = (select auth.uid()));

drop policy if exists "Nutritionists manage recurring_expenses" on public.recurring_expenses;
create policy "Nutritionists manage recurring_expenses"
on public.recurring_expenses
for all
to authenticated
using (nutritionist_id = (select auth.uid()))
with check (nutritionist_id = (select auth.uid()));

drop policy if exists "Nutritionists manage services" on public.services;
create policy "Nutritionists manage services"
on public.services
for all
to authenticated
using (nutritionist_id = (select auth.uid()))
with check (nutritionist_id = (select auth.uid()));

-- chats
drop policy if exists "Chat participants can read" on public.chats;
create policy "Chat participants can read"
on public.chats
for select
to authenticated
using (from_id = (select auth.uid()) or to_id = (select auth.uid()));

drop policy if exists "Chat participants can insert" on public.chats;
create policy "Chat participants can insert"
on public.chats
for insert
to authenticated
with check (from_id = (select auth.uid()) or to_id = (select auth.uid()));

-- household_measures
drop policy if exists "Read household_measures" on public.household_measures;
create policy "Read household_measures"
on public.household_measures
for select
to authenticated
using (true);

drop policy if exists "Write household_measures insert (admin)" on public.household_measures;
create policy "Write household_measures insert (admin)"
on public.household_measures
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "Write household_measures update (admin)" on public.household_measures;
create policy "Write household_measures update (admin)"
on public.household_measures
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "Write household_measures delete (admin)" on public.household_measures;
create policy "Write household_measures delete (admin)"
on public.household_measures
for delete
to authenticated
using ((select public.is_admin()));

-- food_household_measures
drop policy if exists "Read food_household_measures" on public.food_household_measures;
create policy "Read food_household_measures"
on public.food_household_measures
for select
to authenticated
using (true);

drop policy if exists "Insert food_household_measures via foods" on public.food_household_measures;
create policy "Insert food_household_measures via foods"
on public.food_household_measures
for insert
to authenticated
with check (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = (select auth.uid())
  )
);

drop policy if exists "Update food_household_measures via foods" on public.food_household_measures;
create policy "Update food_household_measures via foods"
on public.food_household_measures
for update
to authenticated
using (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = (select auth.uid())
  )
);

drop policy if exists "Delete food_household_measures via foods" on public.food_household_measures;
create policy "Delete food_household_measures via foods"
on public.food_household_measures
for delete
to authenticated
using (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = (select auth.uid())
  )
);

commit;

-- Fase 1: seguranca critica (sem downtime)
-- Objetivo: ativar RLS e criar policies alinhadas ao frontend atual.
-- Recomendacao: executar em staging primeiro.

begin;

-- Helpers
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.is_nutritionist()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'nutritionist'
  );
$$;

create or replace function public.is_patient()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'patient'
  );
$$;

-- user_profiles
alter table public.user_profiles enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "Nutritionists can read their patients" on public.user_profiles;
create policy "Nutritionists can read their patients"
on public.user_profiles
for select
to authenticated
using (
  is_nutritionist()
  and user_type = 'patient'
  and nutritionist_id = auth.uid()
);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and is_admin is not distinct from (select is_admin from public.user_profiles where id = auth.uid())
  and user_type is not distinct from (select user_type from public.user_profiles where id = auth.uid())
);

-- Temporario: permitir insert do proprio perfil (self-healing).
-- Remover na Fase 2 quando trigger de auth estiver ativa.
drop policy if exists "Users can insert own profile (temporary)" on public.user_profiles;
create policy "Users can insert own profile (temporary)"
on public.user_profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and user_type in ('patient','nutritionist')
  and is_admin is not true
);

-- meal_plans e dependencias
alter table public.meal_plans enable row level security;
alter table public.meal_plan_meals enable row level security;
alter table public.meal_plan_foods enable row level security;
alter table public.meal_plan_reference_values enable row level security;

drop policy if exists "Patients can read own meal plans" on public.meal_plans;
create policy "Patients can read own meal plans"
on public.meal_plans
for select
to authenticated
using (patient_id = auth.uid());

drop policy if exists "Nutritionists manage patient meal plans" on public.meal_plans;
create policy "Nutritionists manage patient meal plans"
on public.meal_plans
for all
to authenticated
using (
  is_nutritionist()
  and exists (
    select 1 from public.user_profiles up
    where up.id = public.meal_plans.patient_id
      and up.nutritionist_id = auth.uid()
  )
)
with check (
  is_nutritionist()
  and exists (
    select 1 from public.user_profiles up
    where up.id = public.meal_plans.patient_id
      and up.nutritionist_id = auth.uid()
  )
);

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
        p.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
)
with check (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (
        p.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
);

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
        p.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = auth.uid()
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
        p.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
);

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
        p.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
)
with check (
  exists (
    select 1 from public.meal_plans p
    where p.id = meal_plan_id
      and (
        p.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = p.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
);

-- meals, meal_items, meal_audit_log
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.meal_audit_log enable row level security;

drop policy if exists "Access meals for patient or nutritionist" on public.meals;
create policy "Access meals for patient or nutritionist"
on public.meals
for all
to authenticated
using (
  patient_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.meals.patient_id
      and up.nutritionist_id = auth.uid()
  )
)
with check (
  patient_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.meals.patient_id
      and up.nutritionist_id = auth.uid()
  )
);

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
        m.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = m.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
)
with check (
  exists (
    select 1 from public.meals m
    where m.id = meal_id
      and (
        m.patient_id = auth.uid()
        or exists (
          select 1 from public.user_profiles up
          where up.id = m.patient_id
            and up.nutritionist_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Access meal_audit_log" on public.meal_audit_log;
create policy "Access meal_audit_log"
on public.meal_audit_log
for select
to authenticated
using (
  patient_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.meal_audit_log.patient_id
      and up.nutritionist_id = auth.uid()
  )
);

revoke insert, update, delete on public.meal_audit_log from authenticated;

-- lab_results
alter table public.lab_results enable row level security;

drop policy if exists "Access lab_results" on public.lab_results;
create policy "Access lab_results"
on public.lab_results
for all
to authenticated
using (
  patient_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.lab_results.patient_id
      and up.nutritionist_id = auth.uid()
  )
)
with check (
  patient_id = auth.uid()
  or exists (
    select 1 from public.user_profiles up
    where up.id = public.lab_results.patient_id
      and up.nutritionist_id = auth.uid()
  )
);

-- appointments
alter table public.appointments enable row level security;

drop policy if exists "Nutritionists manage own appointments" on public.appointments;
create policy "Nutritionists manage own appointments"
on public.appointments
for all
to authenticated
using (
  exists (
    select 1 from public.user_profiles up
    where up.id = public.appointments.patient_id
      and up.nutritionist_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.id = public.appointments.patient_id
      and up.nutritionist_id = auth.uid()
  )
);

drop policy if exists "Patients read own appointments" on public.appointments;
create policy "Patients read own appointments"
on public.appointments
for select
to authenticated
using (patient_id = auth.uid());

-- financial_*
alter table public.financial_records enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.services enable row level security;

drop policy if exists "Nutritionists manage financial_records" on public.financial_records;
create policy "Nutritionists manage financial_records"
on public.financial_records
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

drop policy if exists "Nutritionists manage financial_transactions" on public.financial_transactions;
create policy "Nutritionists manage financial_transactions"
on public.financial_transactions
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

drop policy if exists "Nutritionists manage recurring_expenses" on public.recurring_expenses;
create policy "Nutritionists manage recurring_expenses"
on public.recurring_expenses
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

drop policy if exists "Nutritionists manage services" on public.services;
create policy "Nutritionists manage services"
on public.services
for all
to authenticated
using (nutritionist_id = auth.uid())
with check (nutritionist_id = auth.uid());

-- chats
alter table public.chats enable row level security;

drop policy if exists "Chat participants can read" on public.chats;
create policy "Chat participants can read"
on public.chats
for select
to authenticated
using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "Chat participants can insert" on public.chats;
create policy "Chat participants can insert"
on public.chats
for insert
to authenticated
with check (from_id = auth.uid() or to_id = auth.uid());

-- household_measures + food_household_measures
alter table public.household_measures enable row level security;
alter table public.food_household_measures enable row level security;

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
with check (is_admin());

drop policy if exists "Write household_measures update (admin)" on public.household_measures;
create policy "Write household_measures update (admin)"
on public.household_measures
for update
to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Write household_measures delete (admin)" on public.household_measures;
create policy "Write household_measures delete (admin)"
on public.household_measures
for delete
to authenticated
using (is_admin());

drop policy if exists "Read food_household_measures" on public.food_household_measures;
create policy "Read food_household_measures"
on public.food_household_measures
for select
to authenticated
using (true);

drop policy if exists "Write food_household_measures via foods" on public.food_household_measures;
create policy "Write food_household_measures via foods"
on public.food_household_measures
to authenticated
using (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = auth.uid()
  )
);

drop policy if exists "Insert food_household_measures via foods" on public.food_household_measures;
create policy "Insert food_household_measures via foods"
on public.food_household_measures
for insert
to authenticated
with check (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = auth.uid()
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
    where f.id = food_id and f.nutritionist_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.foods f
    where f.id = food_id and f.nutritionist_id = auth.uid()
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
    where f.id = food_id and f.nutritionist_id = auth.uid()
  )
);

-- Storage: policies basicas (ajuste conforme pastas)
-- avatars: cada usuario gerencia a propria pasta
drop policy if exists "Users manage own avatars" on storage.objects;
create policy "Users manage own avatars"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- lab-results-pdfs: paciente ou nutricionista do paciente
drop policy if exists "Access lab-results-pdfs" on storage.objects;
create policy "Access lab-results-pdfs"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'lab-results-pdfs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          then (storage.foldername(name))[1]::uuid
          else null
        end
      )
        and p.nutritionist_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'lab-results-pdfs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          then (storage.foldername(name))[1]::uuid
          else null
        end
      )
        and p.nutritionist_id = auth.uid()
    )
  )
);

-- financial-docs: apenas nutricionista dono
drop policy if exists "Access financial-docs" on storage.objects;
create policy "Access financial-docs"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'financial-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'financial-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- patient-photos: paciente ou nutricionista do paciente
drop policy if exists "Access patient-photos" on storage.objects;
create policy "Access patient-photos"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'patient-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          then (storage.foldername(name))[1]::uuid
          else null
        end
      )
        and p.nutritionist_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'patient-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.user_profiles p
      where p.id = (
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          then (storage.foldername(name))[1]::uuid
          else null
        end
      )
        and p.nutritionist_id = auth.uid()
    )
  )
);

-- chat_media: leitura por participantes via tabela chats, insert por dono da pasta
drop policy if exists "Access chat_media read" on storage.objects;
create policy "Access chat_media read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat_media'
  and exists (
    select 1 from public.chats c
    where c.media_url = storage.objects.name
      and (c.from_id = auth.uid() or c.to_id = auth.uid())
  )
);

drop policy if exists "Access chat_media insert" on storage.objects;
create policy "Access chat_media insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat_media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Access chat_media update" on storage.objects;
create policy "Access chat_media update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat_media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'chat_media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Access chat_media delete" on storage.objects;
create policy "Access chat_media delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat_media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

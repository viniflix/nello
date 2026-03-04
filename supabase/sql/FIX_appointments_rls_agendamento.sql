-- FIX: Agendamentos falhando - RLS de appointments
-- Problema: A política usava user_profiles.nutritionist_id; em alguns schemas
-- o vínculo está em nutritionist_patients.
-- Solução: Usar nutritionist_patients. Se vazio, sync de user_profiles (se existir coluna).

begin;

-- 1) Sincronizar nutritionist_patients a partir de user_profiles.nutritionist_id
--    (para pacientes que têm nutritionist_id no perfil mas não estão em np)
do $$
declare
  has_col boolean;
  has_np boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'nutritionist_id'
  ) into has_col;

  select exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'nutritionist_patients'
  ) into has_np;

  if has_col and has_np then
    insert into public.nutritionist_patients (nutritionist_id, patient_id)
    select up.nutritionist_id, up.id
    from public.user_profiles up
    where up.nutritionist_id is not null
      and not exists (
        select 1 from public.nutritionist_patients np
        where np.patient_id = up.id and np.nutritionist_id = up.nutritionist_id
      )
    on conflict (nutritionist_id, patient_id) do nothing;
  end if;
end $$;

-- 2) Remover políticas antigas
drop policy if exists "Nutritionists manage own appointments" on public.appointments;
drop policy if exists "Nutritionists insert appointments" on public.appointments;
drop policy if exists "Nutritionists update appointments" on public.appointments;
drop policy if exists "Nutritionists delete appointments" on public.appointments;
drop policy if exists "Read appointments" on public.appointments;

-- 3) Política usando nutritionist_patients (fonte canônica do vínculo)
--    Se nutritionist_patients não existir, usa user_profiles.nutritionist_id
do $$
declare
  has_np boolean;
  pol_using text;
  pol_check text;
begin
  select exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'nutritionist_patients'
  ) into has_np;

  if has_np then
    pol_using := 'nutritionist_id = auth.uid() and (patient_id is null or exists (
      select 1 from public.nutritionist_patients np
      where np.patient_id = public.appointments.patient_id and np.nutritionist_id = auth.uid()
    ))';
  else
    pol_using := 'nutritionist_id = auth.uid() and (patient_id is null or exists (
      select 1 from public.user_profiles up
      where up.id = public.appointments.patient_id and up.nutritionist_id = auth.uid()
    ))';
  end if;
  pol_check := pol_using;

  execute format(
    'create policy "Nutritionists manage own appointments"
     on public.appointments for all to authenticated
     using (%s) with check (%s)',
    replace(pol_using, 'auth.uid()', '(select auth.uid())'),
    replace(pol_check, 'auth.uid()', '(select auth.uid())')
  );
end $$;

drop policy if exists "Patients read own appointments" on public.appointments;
create policy "Patients read own appointments"
on public.appointments for select to authenticated
using (patient_id = auth.uid());

commit;

-- Fase 15: corrigir recursao de RLS em helpers
-- Usa SECURITY DEFINER + row_security off para evitar stack depth.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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
security definer
set search_path = public
set row_security = off
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
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and user_type = 'patient'
  );
$$;

commit;

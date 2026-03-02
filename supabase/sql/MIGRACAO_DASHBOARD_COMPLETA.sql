-- =============================================================================
-- MIGRAÇÃO COMPLETA - Dashboard Nutricionista
-- =============================================================================
-- Execute este script no Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- para corrigir os erros:
--   - "Não foi possível carregar o backlog operacional"
--   - "Não foi possível carregar os agendamentos"
--   - "Não foi possível carregar as métricas de no-show"
--   - Feed de atividades vazio
--
-- Compatível com user_profiles que usa user_type + is_admin (não role).
-- =============================================================================

begin;

-- ----- 0) Garantir coluna is_admin em user_profiles (se não existir) -----
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'is_admin'
  ) then
    alter table public.user_profiles add column is_admin boolean not null default false;
  end if;
end;
$$;

-- Função is_admin() – compatível com schema (user_type + is_admin)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public set row_security = off
as $$
  select exists (select 1 from public.user_profiles where id = auth.uid() and is_admin = true);
$$;

-- ----- 1) Appointments: garantir start_time existe -----
do $$
declare
  has_appointment_time boolean;
  has_start_time boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'appointment_time'
  ) into has_appointment_time;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'start_time'
  ) into has_start_time;

  if has_appointment_time and not has_start_time then
    alter table public.appointments add column start_time timestamptz;
    update public.appointments set start_time = coalesce(appointment_time, now());
    alter table public.appointments alter column start_time set not null;
  end if;
end;
$$;

-- ----- 2) notification_rules (feed priority) -----
create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'feed_priority',
  nutritionist_id uuid references public.user_profiles(id) on delete cascade,
  rule_key text not null,
  weight numeric not null default 1,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_notification_rules_scope_owner_key
  on public.notification_rules (scope, coalesce(nutritionist_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_key);

alter table public.notification_rules enable row level security;

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

-- ----- 3) feed_tasks -----
create table if not exists public.feed_tasks (
  id uuid primary key default gen_random_uuid(),
  nutritionist_id uuid not null references public.user_profiles(id) on delete cascade,
  patient_id uuid references public.user_profiles(id) on delete set null,
  source_type text not null,
  source_id text,
  title text not null,
  description text,
  priority_score integer not null default 0,
  priority_reason text,
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved')),
  snooze_until timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.user_profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feed_tasks_nutritionist_status_updated on public.feed_tasks (nutritionist_id, status, updated_at desc);

alter table public.feed_tasks enable row level security;

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

-- ----- 4) operational_observability_log + RPCs log_operational_event e get_operational_health_summary -----
create table if not exists public.operational_observability_log (
  id bigint generated by default as identity primary key,
  nutritionist_id uuid null references public.user_profiles(id) on delete set null,
  patient_id uuid null references public.user_profiles(id) on delete set null,
  module text not null check (module in ('feed', 'meal_plan', 'food_diary', 'agenda', 'system')),
  operation text not null,
  event_type text not null check (event_type in ('success', 'error')),
  latency_ms int not null default 0 check (latency_ms >= 0),
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_observability_log_nutritionist_created_idx
  on public.operational_observability_log (nutritionist_id, created_at desc);

alter table public.operational_observability_log enable row level security;

drop policy if exists operational_observability_select_scoped on public.operational_observability_log;
create policy operational_observability_select_scoped on public.operational_observability_log for select to authenticated
  using (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists operational_observability_insert_authenticated on public.operational_observability_log;
create policy operational_observability_insert_authenticated on public.operational_observability_log for insert to authenticated
  with check (nutritionist_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.log_operational_event(
  p_module text,
  p_operation text,
  p_event_type text default 'success',
  p_latency_ms int default 0,
  p_nutritionist_id uuid default null,
  p_patient_id uuid default null,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_event_id bigint;
begin
  if p_module is null or trim(p_module) = '' then p_module := 'system'; end if;
  if p_operation is null or trim(p_operation) = '' then p_operation := 'unknown_operation'; end if;
  if p_event_type not in ('success', 'error') then p_event_type := 'error'; end if;
  insert into public.operational_observability_log (nutritionist_id, patient_id, module, operation, event_type, latency_ms, error_message, metadata)
  values (p_nutritionist_id, p_patient_id, p_module, p_operation, p_event_type, greatest(coalesce(p_latency_ms, 0), 0), p_error_message, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_event_id;
  return v_event_id;
end;
$$;

create or replace function public.get_operational_health_summary(p_nutritionist_id uuid default auth.uid(), p_window_hours int default 24)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_since timestamptz;
  v_total int := 0;
  v_errors int := 0;
  v_error_rate numeric := 0;
  v_avg_latency numeric := 0;
  v_module_stats jsonb := '[]'::jsonb;
begin
  v_since := v_now - make_interval(hours => greatest(1, least(coalesce(p_window_hours, 24), 168)));
  with filtered as (
    select * from public.operational_observability_log l
    where l.created_at >= v_since and (p_nutritionist_id is null or l.nutritionist_id = p_nutritionist_id)
  )
  select count(*)::int, count(*) filter (where event_type = 'error')::int, coalesce(avg(latency_ms), 0)
  into v_total, v_errors, v_avg_latency from filtered;
  v_error_rate := case when v_total > 0 then round((v_errors::numeric / v_total::numeric) * 100, 2) else 0 end;
  with filtered as (
    select * from public.operational_observability_log l
    where l.created_at >= v_since and (p_nutritionist_id is null or l.nutritionist_id = p_nutritionist_id)
  ),
  by_module as (
    select module, count(*)::int as total_events, count(*) filter (where event_type = 'error')::int as error_events,
      round(coalesce(avg(latency_ms), 0), 2) as avg_latency_ms
    from filtered group by module
  )
  select coalesce(jsonb_agg(jsonb_build_object('module', module, 'total_events', total_events, 'error_events', error_events, 'avg_latency_ms', avg_latency_ms) order by module), '[]'::jsonb)
  into v_module_stats from by_module;
  return jsonb_build_object('window_hours', greatest(1, least(coalesce(p_window_hours, 24), 168)), 'since', v_since, 'until', v_now,
    'total_events', v_total, 'error_events', v_errors, 'error_rate', v_error_rate, 'avg_latency_ms', round(v_avg_latency, 2), 'module_stats', v_module_stats);
end;
$$;

grant execute on function public.log_operational_event(text, text, text, int, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.get_operational_health_summary(uuid, int) to authenticated;

commit;

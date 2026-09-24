-- Admin 2.0: only sourced operational metrics. No inferred billing or fake health status.
create or replace function private.get_admin_dashboard_stats()
returns json
language plpgsql security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not private.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select json_build_object(
    'generated_at', now(),
    'window_days', 30,
    'counts', json_build_object(
      'nutritionists', (select count(*) from public.user_profiles where user_type = 'nutritionist' and is_simulation is not true),
      'patients', (select count(*) from public.user_profiles where user_type = 'patient' and is_simulation is not true),
      'new_nutritionists_30d', (select count(*) from public.user_profiles where user_type = 'nutritionist' and is_simulation is not true and created_at >= now() - interval '30 days'),
      'new_patients_30d', (select count(*) from public.user_profiles where user_type = 'patient' and is_simulation is not true and created_at >= now() - interval '30 days'),
      'active_patients_30d', (select count(distinct a.patient_id) from public.activity_log a join public.user_profiles p on p.id = a.patient_id where a.occurred_at >= now() - interval '30 days' and p.is_simulation is not true),
      'meals_30d', (select count(*) from public.meals m join public.user_profiles p on p.id = m.patient_id where m.created_at >= now() - interval '30 days' and m.deleted_at is null and p.is_simulation is not true),
      'plans_created_30d', (select count(*) from public.meal_plans where created_at >= now() - interval '30 days' and is_template is not true),
      'appointments_today', (select count(*) from public.appointments where appointment_time >= date_trunc('day', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza' and appointment_time < (date_trunc('day', now() at time zone 'America/Fortaleza') + interval '1 day') at time zone 'America/Fortaleza' and status not in ('cancelled', 'canceled')),
      'pending_verifications', (select count(*) from public.professional_verifications where status in ('pending', 'submitted', 'under_review'))
    ),
    'registrations', (
      select coalesce(json_agg(json_build_object('month', to_char(month_start, 'YYYY-MM'), 'nutritionists', nutritionists, 'patients', patients) order by month_start), '[]'::json)
      from (
        select series.month_start,
          (select count(*) from public.user_profiles p where p.user_type = 'nutritionist' and p.is_simulation is not true and p.created_at >= series.month_start and p.created_at < series.month_start + interval '1 month') as nutritionists,
          (select count(*) from public.user_profiles p where p.user_type = 'patient' and p.is_simulation is not true and p.created_at >= series.month_start and p.created_at < series.month_start + interval '1 month') as patients
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') as series(month_start)
      ) months
    ),
    'sources', json_build_object('users', 'user_profiles', 'activity', 'activity_log', 'meals', 'meals', 'plans', 'meal_plans', 'appointments', 'appointments', 'verifications', 'professional_verifications')
  ) into result;
  return result;
end;
$$;

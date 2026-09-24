-- Minimal people directory and product workflow telemetry for MFA operators.
create or replace function public.admin_list_people(p_search text default '', p_type text default 'all', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  q text := left(btrim(coalesce(p_search, '')), 80);
  kind text := coalesce(p_type, 'all');
  page_number integer := least(greatest(coalesce(p_page, 1), 1), 400);
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;
  if kind not in ('all', 'nutritionist', 'patient') then
    raise exception 'invalid_user_type' using errcode = '22023';
  end if;
  with filtered as (
    select id, name, email, user_type, created_at, last_seen_at, is_active
    from public.user_profiles
    where is_simulation is not true
      and (kind = 'all' or user_type = kind)
      and (q = '' or position(lower(q) in lower(coalesce(name, ''))) > 0 or position(lower(q) in lower(coalesce(email, ''))) > 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', page_number,
    'page_size', 20,
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc)
      from (select * from filtered order by created_at desc, id desc limit 20 offset (page_number - 1) * 20) page_rows), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_list_people(text,text,integer) from public, anon, authenticated;
grant execute on function public.admin_list_people(text,text,integer) to authenticated;

create or replace function public.admin_workflow_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'window_days', 30,
    'workflows', jsonb_build_array(
      jsonb_build_object('key','anamnesis','label','Anamneses','count',(select count(*) from public.anamnesis_records where created_at >= now() - interval '30 days'),'source','anamnesis_records'),
      jsonb_build_object('key','checkins','label','Check-ins','count',(select count(*) from public.checkin_sessions where created_at >= now() - interval '30 days'),'source','checkin_sessions'),
      jsonb_build_object('key','plans','label','Planos alimentares','count',(select count(*) from public.meal_plans where created_at >= now() - interval '30 days' and is_template is not true),'source','meal_plans'),
      jsonb_build_object('key','appointments','label','Consultas agendadas','count',(select count(*) from public.appointments where created_at >= now() - interval '30 days'),'source','appointments'),
      jsonb_build_object('key','meals','label','Diário alimentar','count',(select count(*) from public.meals where created_at >= now() - interval '30 days' and deleted_at is null),'source','meals'),
      jsonb_build_object('key','anthropometry','label','Antropometria','count',(select count(*) from public.growth_records where created_at >= now() - interval '30 days'),'source','growth_records'),
      jsonb_build_object('key','clinic_finance','label','Lançamentos do consultório','count',(select count(*) from public.financial_transactions where created_at >= now() - interval '30 days'),'source','financial_transactions'),
      jsonb_build_object('key','notifications','label','Notificações criadas','count',(select count(*) from public.notifications where created_at >= now() - interval '30 days'),'source','notifications'),
      jsonb_build_object('key','privacy','label','Solicitações LGPD','count',(select count(*) from public.data_subject_requests where created_at >= now() - interval '30 days'),'source','data_subject_requests')
    ),
    'pending', jsonb_build_object(
      'anamnesis_patient', (select count(*) from public.anamnesis_records where status = 'pending_patient'),
      'checkins', (select count(*) from public.checkin_sessions where status = 'pending'),
      'privacy', (select count(*) from public.data_subject_requests where status in ('submitted','triaged','in_progress')),
      'verifications', (select count(*) from public.professional_verifications where status in ('pending','submitted','under_review'))
    )
  );
end;
$$;
revoke all on function public.admin_workflow_overview() from public, anon, authenticated;
grant execute on function public.admin_workflow_overview() to authenticated;

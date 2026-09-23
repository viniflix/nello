-- Preserve paid transactions even when a patient's profile is no longer visible.
create or replace function public.get_top_financial_patients(p_limit integer default 3)
returns table (patient_id uuid, patient_name text, avatar_url text, total numeric)
language sql stable security invoker set search_path = ''
as $function$
  select ft.patient_id, coalesce(up.name, 'Paciente')::text,
    up.avatar_url::text, sum(coalesce(ft.net_amount, ft.amount, 0))::numeric
  from public.financial_transactions ft
  left join public.user_profiles up on up.id = ft.patient_id
  where auth.uid() is not null
    and ft.nutritionist_id = auth.uid()
    and ft.type = 'income' and ft.status = 'paid'
    and ft.patient_id is not null
  group by ft.patient_id, up.name, up.avatar_url
  order by sum(coalesce(ft.net_amount, ft.amount, 0)) desc, ft.patient_id
  limit least(greatest(coalesce(p_limit, 3), 1), 10)
$function$;

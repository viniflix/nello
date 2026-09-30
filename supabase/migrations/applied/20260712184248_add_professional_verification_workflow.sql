-- Onda B4 / Task 2: submissão e decisões administrativas auditáveis.

create or replace function private.require_verification_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
end;
$$;

revoke all on function private.require_verification_admin() from public, anon, authenticated;

create or replace function public.submit_professional_verification(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := lower(coalesce(p_payload->>'professional_role', ''));
  v_region text;
  v_number text;
  v_normalized text;
  v_institution text := nullif(btrim(p_payload->>'institution_name'), '');
  v_semester smallint;
  v_graduation date;
  v_existing public.professional_verifications%rowtype;
  v_result public.professional_verifications%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.user_profiles p where p.id=v_user_id and p.user_type='nutritionist') then
    raise exception using errcode = '42501', message = 'professional_account_required';
  end if;
  if v_role not in ('nutritionist', 'student') then
    raise exception using errcode = '22023', message = 'invalid_professional_role';
  end if;

  if v_role = 'nutritionist' then
    v_region := regexp_replace(coalesce(p_payload->>'crn_region', ''), '[^0-9]', '', 'g');
    v_number := regexp_replace(coalesce(p_payload->>'crn_number', ''), '[^0-9]', '', 'g');
    if v_region = '' or v_number = '' then
      raise exception using errcode = '22023', message = 'crn_region_and_number_required';
    end if;
    v_normalized := 'CRN' || v_region || '-' || v_number;
  else
    if v_institution is null then
      raise exception using errcode = '22023', message = 'institution_required';
    end if;
    begin
      v_semester := (p_payload->>'current_semester')::smallint;
      v_graduation := (p_payload->>'expected_graduation_at')::date;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_student_academic_data';
    end;
    if v_semester not between 1 and 20 or v_graduation <= current_date then
      raise exception using errcode = '22023', message = 'invalid_student_academic_data';
    end if;
  end if;

  select * into v_existing
  from public.professional_verifications
  where user_id=v_user_id
  for update;

  if found and v_existing.status in ('approved', 'suspended') then
    raise exception using errcode = '55000', message = 'verification_cannot_be_resubmitted_in_current_state';
  end if;

  insert into public.professional_verifications (
    user_id, professional_role, status, verification_method,
    crn_region, crn_number, normalized_crn,
    institution_name, current_semester, expected_graduation_at,
    submitted_at, reviewed_at, valid_until, reviewed_by,
    decision_reason, source_url, source_checked_at, document_required_reason
  ) values (
    v_user_id, v_role, 'pending', 'self_report',
    nullif(v_region,''), nullif(v_number,''), v_normalized,
    v_institution, v_semester, v_graduation,
    now(), null, null, null,
    null, null, null, null
  )
  on conflict (user_id) do update set
    professional_role=excluded.professional_role,
    status='pending',
    verification_method='self_report',
    crn_region=excluded.crn_region,
    crn_number=excluded.crn_number,
    normalized_crn=excluded.normalized_crn,
    institution_name=excluded.institution_name,
    current_semester=excluded.current_semester,
    expected_graduation_at=excluded.expected_graduation_at,
    submitted_at=now(), reviewed_at=null, valid_until=null, reviewed_by=null,
    decision_reason=null, source_url=null, source_checked_at=null, document_required_reason=null,
    updated_at=now()
  returning * into v_result;

  insert into public.verification_events (verification_id,actor_id,from_status,to_status,reason,metadata)
  values (
    v_result.id, v_user_id, coalesce(v_existing.status,'not_submitted'), 'pending',
    case when v_existing.id is null then 'verification_submitted' else 'verification_resubmitted' end,
    jsonb_build_object('professional_role',v_role)
  );

  return jsonb_build_object('success',true,'verification_id',v_result.id,'status','pending');
end;
$$;

create or replace function public.request_verification_information(p_verification_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.professional_verifications%rowtype;
begin
  perform private.require_verification_admin();
  if length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023', message='decision_reason_required';
  end if;
  select * into v_row from public.professional_verifications where id=p_verification_id for update;
  if not found then raise exception using errcode='P0002', message='verification_not_found'; end if;
  if v_row.status <> 'pending' then raise exception using errcode='55000', message='invalid_verification_transition'; end if;
  update public.professional_verifications set status='needs_information', document_required_reason=btrim(p_reason), reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where id=p_verification_id;
  insert into public.verification_events(verification_id,actor_id,from_status,to_status,reason)
  values(p_verification_id,auth.uid(),v_row.status,'needs_information',btrim(p_reason));
  return jsonb_build_object('success',true,'status','needs_information');
end;
$$;

create or replace function public.review_professional_verification(
  p_verification_id uuid,
  p_decision text,
  p_reason text,
  p_source_url text,
  p_valid_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.professional_verifications%rowtype;
begin
  perform private.require_verification_admin();
  if p_decision not in ('approved','rejected') then raise exception using errcode='22023', message='invalid_review_decision'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception using errcode='22023', message='decision_reason_required'; end if;
  select * into v_row from public.professional_verifications where id=p_verification_id for update;
  if not found then raise exception using errcode='P0002', message='verification_not_found'; end if;
  if v_row.status <> 'pending' then raise exception using errcode='55000', message='invalid_verification_transition'; end if;
  if p_decision='approved' then
    if nullif(btrim(coalesce(p_source_url,'')),'') is null then raise exception using errcode='22023', message='verification_source_required'; end if;
    if p_valid_until <= now() then raise exception using errcode='22023', message='future_validity_required'; end if;
    if v_row.professional_role='nutritionist' and p_valid_until > now()+interval '370 days' then raise exception using errcode='22023', message='professional_validity_exceeds_limit'; end if;
    if v_row.professional_role='student' and p_valid_until > now()+interval '190 days' then raise exception using errcode='22023', message='student_validity_exceeds_limit'; end if;
  end if;
  update public.professional_verifications set
    status=p_decision,
    verification_method=case when p_decision='approved' and professional_role='nutritionist' then 'official_registry_manual' when p_decision='approved' then 'student_document_manual' else verification_method end,
    reviewed_by=auth.uid(), reviewed_at=now(), valid_until=case when p_decision='approved' then p_valid_until else null end,
    decision_reason=btrim(p_reason), source_url=nullif(btrim(coalesce(p_source_url,'')),''), source_checked_at=case when p_decision='approved' then now() else null end,
    document_required_reason=null, updated_at=now()
  where id=p_verification_id;
  insert into public.verification_events(verification_id,actor_id,from_status,to_status,reason,source_url,metadata)
  values(p_verification_id,auth.uid(),v_row.status,p_decision,btrim(p_reason),nullif(btrim(coalesce(p_source_url,'')),''),jsonb_build_object('valid_until',p_valid_until));
  return jsonb_build_object('success',true,'status',p_decision);
end;
$$;

create or replace function public.suspend_professional_verification(p_verification_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.professional_verifications%rowtype;
begin
  perform private.require_verification_admin();
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception using errcode='22023', message='decision_reason_required'; end if;
  select * into v_row from public.professional_verifications where id=p_verification_id for update;
  if not found then raise exception using errcode='P0002', message='verification_not_found'; end if;
  if v_row.status <> 'approved' then raise exception using errcode='55000', message='invalid_verification_transition'; end if;
  update public.professional_verifications set status='suspended',decision_reason=btrim(p_reason),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_verification_id;
  insert into public.verification_events(verification_id,actor_id,from_status,to_status,reason)
  values(p_verification_id,auth.uid(),v_row.status,'suspended',btrim(p_reason));
  return jsonb_build_object('success',true,'status','suspended');
end;
$$;

create or replace function public.list_professional_verifications(p_status text default null, p_role text default null)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',v.id,'user_id',v.user_id,'name',p.name,'email',p.email,
    'professional_role',v.professional_role,'status',case when v.status='approved' and v.valid_until<=now() then 'expired' else v.status end,
    'verification_method',v.verification_method,'crn_region',v.crn_region,'crn_number',v.crn_number,
    'institution_name',v.institution_name,'current_semester',v.current_semester,'expected_graduation_at',v.expected_graduation_at,
    'submitted_at',v.submitted_at,'reviewed_at',v.reviewed_at,'valid_until',v.valid_until,'decision_reason',v.decision_reason,
    'source_url',v.source_url,'document_required_reason',v.document_required_reason
  ))
  from public.professional_verifications v
  join public.user_profiles p on p.id=v.user_id
  where private.is_admin()
    and (p_status is null or (case when v.status='approved' and v.valid_until<=now() then 'expired' else v.status end)=p_status)
    and (p_role is null or v.professional_role=p_role)
  order by v.submitted_at desc nulls last, v.created_at desc;
$$;

revoke all on function public.submit_professional_verification(jsonb) from public, anon;
revoke all on function public.request_verification_information(uuid,text) from public, anon;
revoke all on function public.review_professional_verification(uuid,text,text,text,timestamptz) from public, anon;
revoke all on function public.suspend_professional_verification(uuid,text) from public, anon;
revoke all on function public.list_professional_verifications(text,text) from public, anon;
grant execute on function public.submit_professional_verification(jsonb) to authenticated, service_role;
grant execute on function public.request_verification_information(uuid,text) to authenticated, service_role;
grant execute on function public.review_professional_verification(uuid,text,text,text,timestamptz) to authenticated, service_role;
grant execute on function public.suspend_professional_verification(uuid,text) to authenticated, service_role;
grant execute on function public.list_professional_verifications(text,text) to authenticated, service_role;

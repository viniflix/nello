-- Run as the database owner in one session. All users, grants and events roll back.
begin;

do $surface$
declare
  v_unsafe text;
begin
  select string_agg(p.proname, ', ') into v_unsafe
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'admin_access_status', 'admin_brand_migration_status', 'admin_list_people',
      'admin_security_overview', 'admin_workflow_overview', 'get_admin_dashboard_stats',
      'get_nutritionist_detail', 'get_nutritionists_list', 'get_system_live_logs',
      'get_tcc_study_metrics', 'list_data_subject_requests',
      'list_professional_verifications', 'request_verification_information',
      'review_professional_verification', 'suspend_professional_verification',
      'update_data_subject_request'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_unsafe is not null then
    raise exception 'QA_ADMIN_ANON_EXECUTE: %', v_unsafe;
  end if;
end;
$surface$;

do $fixture$
declare
  v_operator uuid := gen_random_uuid();
  v_nonmember uuid := gen_random_uuid();
begin
  perform set_config('qa.operator_id', v_operator::text, true);
  perform set_config('qa.nonmember_id', v_nonmember::text, true);
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values
    (v_operator, 'authenticated', 'authenticated',
      'wave3-' || v_operator || '@example.invalid',
      '{"name":"Wave 3 QA operator","user_type":"nutritionist"}'::jsonb),
    (v_nonmember, 'authenticated', 'authenticated',
      'wave3-' || v_nonmember || '@example.invalid',
      '{"name":"Wave 3 QA nonmember","user_type":"nutritionist"}'::jsonb);
  -- The old visual flag cannot authorize a nonmember; a real member works
  -- without it. This deliberately tests both sides of that boundary.
  update public.user_profiles set is_admin = true where id = v_nonmember;
  update public.user_profiles set is_admin = false where id = v_operator;
  insert into private.admin_operators (user_id, role, grant_reason)
  values (v_operator, 'owner', 'Wave 3 rollback-only authorization test');
end;
$fixture$;

set local role authenticated;

do $matrix$
declare
  v_operator uuid := current_setting('qa.operator_id')::uuid;
  v_nonmember uuid := current_setting('qa.nonmember_id')::uuid;
  v_status jsonb;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_nonmember::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_nonmember, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select public.admin_access_status() into v_status;
  if (v_status->>'authorized')::boolean or (v_status->>'eligible')::boolean then
    raise exception 'QA_PROFILE_FLAG_GRANTED_ADMIN';
  end if;
  if public.check_is_admin() then raise exception 'QA_PROFILE_FLAG_CHECK_ALLOWED'; end if;
  begin
    perform public.admin_list_people();
    raise exception 'QA_NONMEMBER_READ_ALLOWED';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', v_operator::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_operator, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select public.admin_access_status() into v_status;
  if (v_status->>'authorized')::boolean or not (v_status->>'mfa_required')::boolean then
    raise exception 'QA_AAL1_ADMIN_ALLOWED';
  end if;
  begin
    perform public.admin_list_people();
    raise exception 'QA_AAL1_READ_ALLOWED';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_operator, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select public.admin_access_status() into v_status;
  if not (v_status->>'authorized')::boolean then
    raise exception 'QA_AAL2_OPERATOR_DENIED: %', v_status;
  end if;
  if not public.check_is_admin() then raise exception 'QA_AAL2_CHECK_DENIED'; end if;
  perform public.admin_list_people();
end;
$matrix$;

reset role;
update private.admin_operators set revoked_at = now()
where user_id = current_setting('qa.operator_id')::uuid;
set local role authenticated;

do $revocation$
declare
  v_status jsonb;
begin
  select public.admin_access_status() into v_status;
  if (v_status->>'authorized')::boolean or (v_status->>'eligible')::boolean then
    raise exception 'QA_REVOKED_SESSION_ALLOWED';
  end if;
  if public.check_is_admin() then raise exception 'QA_REVOKED_CHECK_ALLOWED'; end if;
  begin
    perform public.admin_list_people();
    raise exception 'QA_REVOKED_READ_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$revocation$;

rollback;

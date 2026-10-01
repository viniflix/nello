-- Owner decision: preserve normal clinical access during public testing.
-- Existing approvals and all clinical records remain untouched.
begin;
create or replace function private.auto_approve_prelaunch_nutritionist()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid;
begin
  if new.user_type is distinct from 'nutritionist' then return new; end if;
  insert into public.professional_verifications(user_id,professional_role,status,verification_method,valid_until,reviewed_at,decision_reason)
  values(new.id,'nutritionist','approved','pre_paywall_auto_approval','2099-12-31 23:59:59+00',now(),'Public testing access authorized by owner; formal professional verification remains separate.')
  on conflict(user_id) do nothing
  returning id into v_id;
  if v_id is not null then
    insert into public.verification_events(verification_id,from_status,to_status,reason,metadata)
    values(v_id,'not_submitted','approved','Public testing access authorized by owner.',jsonb_build_object('operation','prelaunch_tester_continuity'));
  end if;
  return new;
end;
$function$;
commit;

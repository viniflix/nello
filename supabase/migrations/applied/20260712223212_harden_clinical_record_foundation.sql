-- C1 follow-up: canonical episode contract, daily patient visibility, and guardian evidence.

create or replace function private.can_read_clinical_record(p_record_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.clinical_records r
    where r.id=p_record_id
      and private.can_read_care_episode(r.care_episode_id)
      and (r.patient_id<>auth.uid() or r.visibility='shared_with_patient')
  )
$$;

revoke all on function private.can_read_clinical_record(uuid) from public,anon,authenticated;
grant execute on function private.can_read_clinical_record(uuid) to authenticated;

drop policy if exists clinical_records_participant_select on public.clinical_records;
create policy clinical_records_participant_select on public.clinical_records for select to authenticated
using (private.can_read_clinical_record(id));

drop policy if exists clinical_record_events_participant_select on public.clinical_record_events;
create policy clinical_record_events_participant_select on public.clinical_record_events for select to authenticated
using (private.can_read_clinical_record(clinical_record_id));

create policy clinical_record_types_authenticated_select on public.clinical_record_types for select to authenticated
using (is_active);

create or replace function public.get_patient_record_foundation(p_patient_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_result jsonb; v_episode uuid; v_episode_status text; v_can_write boolean:=false;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if v_actor<>p_patient_id and not exists(select 1 from public.care_episodes e where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)) then
    raise exception using errcode='42501',message='patient_record_read_forbidden';
  end if;
  select e.id,e.status into v_episode,v_episode_status from public.care_episodes e
  where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)
  order by (e.nutritionist_id=v_actor) desc,e.status='active' desc,e.started_at desc limit 1;
  if v_episode is not null then v_can_write:=private.can_write_active_care_episode(v_episode); end if;
  select jsonb_build_object(
    'viewed_episode_id',v_episode,
    'viewed_episode_status',v_episode_status,
    'writable_episode_id',case when v_can_write then v_episode else null end,
    'can_write',v_can_write,
    'patient',jsonb_build_object('id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,'gender',p.gender,
      'email',p.email,'occupation',p.occupation,'civil_status',p.civil_status,'address',p.address),
    'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.encounter_at desc) from public.clinical_records r
      where r.patient_id=p_patient_id and private.can_read_clinical_record(r.id)),'[]'::jsonb))
  into v_result from public.user_profiles p where p.id=p_patient_id and p.user_type='patient';
  if v_result is null then raise exception using errcode='P0002',message='patient_not_found'; end if;
  return v_result;
end $$;

create or replace function public.upsert_patient_legal_guardian(p_patient_id uuid,p_episode_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_previous public.patient_episode_legal_guardians%rowtype; v_reason text;
  v_valid_from timestamptz:=now(); v_valid_until timestamptz;
  v_contact jsonb:=coalesce(p_payload->'contact','{}'::jsonb); v_consent jsonb:=coalesce(p_payload->'consent','{"recorded":false}'::jsonb);
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not private.can_write_active_care_episode(p_episode_id) or not exists(select 1 from public.care_episodes e where e.id=p_episode_id and e.patient_id=p_patient_id) then raise exception using errcode='42501',message='episode_write_forbidden'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='guardian_payload_object_required'; end if;
  if p_payload ?| array['cpf','cpf_last4','cpf_fingerprint'] then raise exception using errcode='22023',message='cpf_not_accepted_without_secure_hmac'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','relationship','contact','valid_from','valid_until','consent','is_primary','reason')) then raise exception using errcode='22023',message='guardian_payload_field_not_allowed'; end if;
  if jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'relationship') is distinct from 'string'
    or length(btrim(p_payload->>'name')) not between 2 and 160 or length(btrim(p_payload->>'relationship')) not between 2 and 80 then
    raise exception using errcode='22023',message='guardian_identity_invalid';
  end if;
  if p_payload ? 'reason' and (jsonb_typeof(p_payload->'reason') is distinct from 'string' or length(btrim(p_payload->>'reason')) not between 5 and 500) then raise exception using errcode='22023',message='guardian_reason_invalid'; end if;
  if p_payload ? 'is_primary' and jsonb_typeof(p_payload->'is_primary') is distinct from 'boolean' then raise exception using errcode='22023',message='guardian_is_primary_boolean_required'; end if;
  if p_payload ? 'valid_from' and (jsonb_typeof(p_payload->'valid_from') is distinct from 'string' or (p_payload->>'valid_from') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception using errcode='22023',message='guardian_valid_from_iso_date_required'; end if;
  if p_payload ? 'valid_until' and (jsonb_typeof(p_payload->'valid_until') is distinct from 'string' or (p_payload->>'valid_until') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception using errcode='22023',message='guardian_valid_until_iso_date_required'; end if;
  begin
    if p_payload ? 'valid_from' then v_valid_from:=(p_payload->>'valid_from')::date::timestamptz; end if;
    if p_payload ? 'valid_until' then v_valid_until:=(p_payload->>'valid_until')::date::timestamptz; end if;
  exception when invalid_text_representation or datetime_field_overflow then raise exception using errcode='22023',message='guardian_valid_date_invalid'; end;
  v_reason:=case when p_payload ? 'reason' then btrim(p_payload->>'reason') else null end;
  if jsonb_typeof(v_contact)<>'object' or jsonb_typeof(v_consent)<>'object' then raise exception using errcode='22023',message='guardian_contact_consent_object_required'; end if;
  if exists(select 1 from jsonb_object_keys(v_contact) k where k not in ('phone','email'))
    or exists(select 1 from jsonb_object_keys(v_consent) k where k not in ('recorded','version','recorded_at','evidence')) then
    raise exception using errcode='22023',message='guardian_nested_field_not_allowed';
  end if;
  if (v_contact ? 'phone' and jsonb_typeof(v_contact->'phone') not in ('string','null'))
    or (v_contact ? 'email' and jsonb_typeof(v_contact->'email') not in ('string','null'))
    or length(coalesce(v_contact->>'phone',''))>30 or length(coalesce(v_contact->>'email',''))>254
    or (length(coalesce(v_contact->>'email',''))>0 and (v_contact->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception using errcode='22023',message='guardian_contact_invalid';
  end if;
  if not (v_consent ? 'recorded') or jsonb_typeof(v_consent->'recorded')<>'boolean'
    or (v_consent ? 'version' and jsonb_typeof(v_consent->'version') not in ('string','null'))
    or (v_consent ? 'recorded_at' and jsonb_typeof(v_consent->'recorded_at') not in ('string','null'))
    or (v_consent ? 'evidence' and jsonb_typeof(v_consent->'evidence') not in ('string','null'))
    or (v_consent ? 'version' and length(coalesce(v_consent->>'version','')) not between 1 and 80)
    or (v_consent ? 'evidence' and length(coalesce(v_consent->>'evidence','')) not between 1 and 500) then
    raise exception using errcode='22023',message='guardian_consent_invalid';
  end if;
  if coalesce((v_consent->>'recorded')::boolean,false) and (
    length(btrim(coalesce(v_consent->>'version','')))=0 or length(btrim(coalesce(v_consent->>'evidence','')))=0 or nullif(v_consent->>'recorded_at','') is null
  ) then raise exception using errcode='22023',message='guardian_consent_evidence_required'; end if;
  if coalesce((v_consent->>'recorded')::boolean,false) then
    if (v_consent->>'recorded_at') !~ '^\d{4}-\d{2}-\d{2}T' then raise exception using errcode='22023',message='guardian_consent_recorded_at_iso_required'; end if;
    begin perform (v_consent->>'recorded_at')::timestamptz; exception when invalid_text_representation or datetime_field_overflow then raise exception using errcode='22023',message='guardian_consent_recorded_at_invalid'; end;
  end if;
  if v_valid_until is not null and v_valid_until<v_valid_from then raise exception using errcode='22023',message='guardian_valid_period_invalid'; end if;
  perform 1 from public.care_episodes where id=p_episode_id for update;
  select * into v_previous from public.patient_episode_legal_guardians where care_episode_id=p_episode_id and status='active' and is_primary for update;
  if found then
    if v_reason is null then raise exception using errcode='22023',message='guardian_replacement_reason_required'; end if;
    update public.patient_episode_legal_guardians set status='replaced',valid_until=greatest(now(),valid_from),updated_at=now() where id=v_previous.id;
    insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason,metadata)
    values(v_previous.id,'active','replaced',v_actor,v_reason,jsonb_build_object('valid_until',greatest(now(),v_previous.valid_from)));
  end if;
  insert into public.patient_episode_legal_guardians(patient_id,care_episode_id,author_id,name,relationship,contact,valid_from,valid_until,consent,is_primary)
  values(p_patient_id,p_episode_id,v_actor,btrim(p_payload->>'name'),btrim(p_payload->>'relationship'),v_contact,v_valid_from,v_valid_until,v_consent,coalesce((p_payload->>'is_primary')::boolean,true)) returning id into v_id;
  insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason,metadata)
  values(v_id,null,'active',v_actor,v_reason,jsonb_build_object(
    'valid_from',v_valid_from,'valid_until',v_valid_until,
    'contact_flags',jsonb_build_object('phone_present',length(coalesce(v_contact->>'phone',''))>0,'email_present',length(coalesce(v_contact->>'email',''))>0),
    'consent',jsonb_build_object('recorded',coalesce((v_consent->>'recorded')::boolean,false),'version',v_consent->>'version',
      'evidence_present',length(coalesce(v_consent->>'evidence',''))>0)));
  return (select jsonb_build_object('id',g.id,'patient_id',g.patient_id,'care_episode_id',g.care_episode_id,'author_id',g.author_id,
    'name',g.name,'relationship',g.relationship,'contact',g.contact,'valid_from',g.valid_from,'valid_until',g.valid_until,
    'consent',g.consent,'is_primary',g.is_primary,'status',g.status,'created_at',g.created_at,'updated_at',g.updated_at)
    from public.patient_episode_legal_guardians g where g.id=v_id);
end $$;

create or replace function public.revoke_patient_legal_guardian(p_guardian_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_g public.patient_episode_legal_guardians%rowtype; v_reason text:=btrim(p_reason);
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if v_reason is null or length(v_reason) not between 5 and 500 then raise exception using errcode='22023',message='guardian_revocation_reason_invalid'; end if;
  select * into v_g from public.patient_episode_legal_guardians where id=p_guardian_id for update;
  if not found or not private.can_write_active_care_episode(v_g.care_episode_id) then raise exception using errcode='42501',message='guardian_revoke_forbidden'; end if;
  if v_g.status<>'active' then raise exception using errcode='22023',message='guardian_not_active'; end if;
  update public.patient_episode_legal_guardians set status='revoked',valid_until=now(),updated_at=now() where id=p_guardian_id;
  insert into public.legal_guardian_events(legal_guardian_id,from_status,to_status,actor_id,reason) values(p_guardian_id,'active','revoked',v_actor,v_reason);
  return (select jsonb_build_object('id',g.id,'patient_id',g.patient_id,'care_episode_id',g.care_episode_id,'author_id',g.author_id,
    'name',g.name,'relationship',g.relationship,'contact',g.contact,'valid_from',g.valid_from,'valid_until',g.valid_until,
    'consent',g.consent,'is_primary',g.is_primary,'status',g.status,'created_at',g.created_at,'updated_at',g.updated_at)
    from public.patient_episode_legal_guardians g where g.id=p_guardian_id);
end $$;

create or replace function private.reject_legal_guardian_delete() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'patient_episode_legal_guardians_do_not_support_hard_delete';
end $$;
revoke all on function private.reject_legal_guardian_delete() from public,anon,authenticated;

drop trigger if exists trg_patient_episode_legal_guardians_no_delete on public.patient_episode_legal_guardians;
create trigger trg_patient_episode_legal_guardians_no_delete before delete on public.patient_episode_legal_guardians
for each row execute function private.reject_legal_guardian_delete();

drop policy if exists patient_profile_events_participant_select on public.patient_profile_events;
create policy patient_profile_events_participant_select on public.patient_profile_events for select to authenticated
using (patient_id=(select auth.uid()) or (care_episode_id is not null and private.can_read_care_episode(care_episode_id)));

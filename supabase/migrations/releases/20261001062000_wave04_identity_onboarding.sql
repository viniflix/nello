begin;

create table private.auth_legal_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null check (version = '2026-10-01'),
  purpose text not null check (purpose in ('terms', 'analytics')),
  allowed boolean not null,
  source text not null check (source in ('signup', 'preferences')),
  recorded_at timestamptz not null default clock_timestamp()
);
create index auth_legal_receipts_owner_idx on private.auth_legal_receipts(user_id,purpose,id desc);
revoke all on private.auth_legal_receipts from public, anon, authenticated, service_role;
revoke all on sequence private.auth_legal_receipts_id_seq from public, anon, authenticated, service_role;
-- Historical Auth/claim functions are owned by postgres, a non-superuser in
-- reconstruction. Keep their exact table access explicit, never client-wide.
grant select,insert on private.auth_legal_receipts to postgres;
grant usage on sequence private.auth_legal_receipts_id_seq to postgres;

create or replace function public.get_my_privacy_preferences()
returns jsonb language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object('version', '2026-10-01',
    'terms_accepted', coalesce((select allowed from private.auth_legal_receipts
      where user_id=auth.uid() and purpose='terms' order by id desc limit 1),false),
    'analytics_allowed', coalesce((select allowed and recorded_at > now()-interval '180 days'
      from private.auth_legal_receipts where user_id=auth.uid() and purpose='analytics'
      order by id desc limit 1),false));
$function$;

create or replace function public.record_my_privacy_choice(p_version text,p_terms boolean,p_analytics boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception using errcode='42501', message='authentication_required'; end if;
  if p_version is distinct from '2026-10-01' or p_terms is null or p_analytics is null then
    raise exception using errcode='22023', message='invalid_privacy_choice';
  end if;
  insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source)
  values (auth.uid(),p_version,'terms',p_terms,'preferences'),
         (auth.uid(),p_version,'analytics',p_analytics,'preferences');
end;
$function$;
revoke all on function public.get_my_privacy_preferences() from public,anon;
revoke all on function public.record_my_privacy_choice(text,boolean,boolean) from public,anon;
grant execute on function public.get_my_privacy_preferences() to authenticated;
grant execute on function public.record_my_privacy_choice(text,boolean,boolean) to authenticated;

-- The lifetime belongs to an offline bearer invitation, never a new account.
create table private.patient_invite_lifetimes (
  profile_id uuid primary key references public.user_profiles(id) on delete cascade,
  code text not null,
  expires_at timestamptz not null
);
revoke all on private.patient_invite_lifetimes from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.patient_invite_lifetimes to postgres;
insert into private.patient_invite_lifetimes(profile_id,code,expires_at)
select id,patient_invite_code,now()+interval '7 days' from public.user_profiles where patient_invite_code is not null;

create or replace function private.track_patient_invite_lifetime()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.patient_invite_code is null then
    delete from private.patient_invite_lifetimes where profile_id=new.id;
  elsif tg_op='INSERT' or new.patient_invite_code is distinct from old.patient_invite_code then
    insert into private.patient_invite_lifetimes(profile_id,code,expires_at)
    values(new.id,new.patient_invite_code,now()+interval '7 days')
    on conflict(profile_id) do update set code=excluded.code, expires_at=excluded.expires_at;
  end if;
  return new;
end;
$function$;
create trigger wave04_patient_invite_lifetime after insert or update of patient_invite_code
on public.user_profiles for each row execute function private.track_patient_invite_lifetime();

-- GoTrue inserts Auth rows before applying app_metadata/invited_at. A short,
-- one-use server authorization bridges that insertion without trusting roles
-- or clinical metadata submitted to the public signup endpoint.
create table private.patient_auth_intents (
  nonce uuid primary key,
  email text not null unique,
  nutritionist_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
revoke all on private.patient_auth_intents from public,anon,authenticated,service_role;
grant select,delete on private.patient_auth_intents to postgres;
create function public.prepare_patient_auth_invitation(p_email text,p_nutritionist uuid)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_nonce uuid := gen_random_uuid();
begin
  if p_email is null or length(p_email)>100 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode='22023',message='invalid_patient_email';
  end if;
  if not exists(select 1 from public.professional_verifications v join public.user_profiles p on p.id=v.user_id
    where v.user_id=p_nutritionist and p.user_type='nutritionist' and p.is_active
      and v.status='approved' and v.valid_until>now()) then
    raise exception using errcode='42501',message='professional_verification_required';
  end if;
  if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email))) then
    raise exception using errcode='23505',message='patient_account_already_exists';
  end if;
  delete from private.patient_auth_intents where expires_at<=now();
  insert into private.patient_auth_intents(nonce,email,nutritionist_id,expires_at)
  values(v_nonce,lower(btrim(p_email)),p_nutritionist,now()+interval '5 minutes')
  on conflict(email) do update set nonce=excluded.nonce,nutritionist_id=excluded.nutritionist_id,expires_at=excluded.expires_at;
  return v_nonce;
end;
$function$;
revoke all on function public.prepare_patient_auth_invitation(text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_patient_auth_invitation(text,uuid) to service_role;

create function public.renew_patient_invitation(p_patient uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_patient public.user_profiles%rowtype; v_code text:=replace(gen_random_uuid()::text,'-','');
begin
  if auth.uid() is null then raise exception using errcode='42501',message='authentication_required'; end if;
  select * into v_patient from public.user_profiles where id=p_patient for update;
  if not found or v_patient.user_type<>'patient' or not v_patient.is_active
    or v_patient.nutritionist_id is distinct from auth.uid()
    or exists(select 1 from auth.users where id=p_patient)
    or not exists(select 1 from public.professional_verifications v join public.user_profiles p on p.id=v.user_id
      where v.user_id=auth.uid() and p.user_type='nutritionist' and p.is_active
        and v.status='approved' and v.valid_until>now()) then
    raise exception using errcode='42501',message='patient_invitation_not_authorized';
  end if;
  update public.user_profiles set patient_invite_code=v_code where id=p_patient;
  return jsonb_build_object('code',v_code,'expires_at',now()+interval '7 days');
end;
$function$;
revoke all on function public.renew_patient_invitation(uuid) from public,anon;
grant execute on function public.renew_patient_invitation(uuid) to authenticated;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_type text;
  v_target public.user_profiles%rowtype;
  v_code text := nullif(btrim(new.raw_user_meta_data->>'invite_code'),'');
  v_trusted boolean := session_user in ('postgres','supabase_admin')
    or coalesce(new.raw_app_meta_data->>'nello_role' in ('patient','nutritionist'),false);
  v_invited boolean := new.invited_at is not null;
  v_inviter uuid;
begin
  delete from private.patient_auth_intents
    where nonce::text=new.raw_user_meta_data->>'nello_provisioning_nonce'
      and email=lower(new.email) and expires_at>now()
    returning nutritionist_id into v_inviter;
  if found then v_invited:=true; end if;
  if v_trusted then
    v_type := coalesce(new.raw_app_meta_data->>'nello_role',new.raw_user_meta_data->>'user_type');
    if v_type not in ('patient','nutritionist') or v_type is null then v_type:='patient'; end if;
  elsif v_invited then
    v_type := 'patient';
  elsif v_code is not null then
    if length(v_code)>128 then raise exception using errcode='22023',message='invalid_invite'; end if;
    select p.* into v_target from public.user_profiles p
    where lower(p.patient_invite_code)=lower(v_code) and p.user_type='patient'
      and exists(select 1 from private.patient_invite_lifetimes l
        where l.profile_id=p.id and l.code=p.patient_invite_code and l.expires_at>now());
    if not found then
      -- A professional's shareable code creates only a pending link after confirmation.
      if not exists(select 1 from public.user_profiles where lower(invite_code)=lower(v_code)
        and user_type='nutritionist' and is_active) then
        raise exception using errcode='22023',message='invalid_invite';
      end if;
    elsif exists(select 1 from auth.users where id=v_target.id)
      or (v_target.email is not null and lower(v_target.email)<>lower(new.email)) then
      raise exception using errcode='22023',message='invalid_invite';
    end if;
    v_type := 'patient';
  else
    if new.raw_user_meta_data->>'user_type'='patient' then
      raise exception using errcode='22023',message='patient_invite_required';
    end if;
    v_type := 'nutritionist';
  end if;
  if not v_trusted and not v_invited and (
    new.raw_user_meta_data->>'legal_version' is distinct from '2026-10-01'
    or new.raw_user_meta_data->'terms_accepted' is distinct from 'true'::jsonb) then
    raise exception using errcode='22023',message='legal_acceptance_required';
  end if;

  insert into public.user_profiles(id,email,name,user_type,needs_password_reset,nutritionist_id)
  values(new.id,new.email,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'Usuário'),100),v_type,
    (v_trusted or v_invited) and coalesce(new.raw_user_meta_data->>'needs_password_reset'='true',false),
    case when v_inviter is not null then v_inviter
      when v_invited or v_trusted then nullif(new.raw_user_meta_data->>'nutritionist_id','')::uuid else null end);
  -- Clinical metadata is accepted only from a trusted database operator or Auth invitation.
  if v_trusted or v_invited then
    update public.user_profiles set birth_date=nullif(new.raw_user_meta_data->>'birth_date','')::date,
      gender=nullif(new.raw_user_meta_data->>'gender',''), phone=nullif(new.raw_user_meta_data->>'phone',''),
      cpf=nullif(new.raw_user_meta_data->>'cpf',''), occupation=nullif(new.raw_user_meta_data->>'occupation',''),
      civil_status=nullif(new.raw_user_meta_data->>'civil_status',''), observations=nullif(new.raw_user_meta_data->>'observations',''),
      address=new.raw_user_meta_data->'address' where id=new.id;
  end if;
  if new.raw_user_meta_data->>'legal_version'='2026-10-01' and new.raw_user_meta_data->'terms_accepted'='true'::jsonb then
    insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source)
    values(new.id,'2026-10-01','terms',true,'signup'),
          (new.id,'2026-10-01','analytics',coalesce(new.raw_user_meta_data->'analytics_allowed'='true'::jsonb,false),'signup');
  end if;
  return new;
end;
$function$;

-- Keep the existing transactional transfer implementation, behind reviewed guards.
alter function private.redeem_invite_code(text) rename to redeem_invite_code_wave03;
revoke all on function private.redeem_invite_code_wave03(text) from public,anon,authenticated,service_role;
create function private.redeem_invite_code(input_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_profile public.user_profiles%rowtype; v_target public.user_profiles%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('success',false,'code','authentication_required'); end if;
  select * into v_profile from public.user_profiles where id=auth.uid();
  if not found or v_profile.user_type<>'patient' or not v_profile.is_active then
    return jsonb_build_object('success',false,'code','patient_account_required');
  end if;
  if input_code is null or length(btrim(input_code)) not between 1 and 128 then
    return jsonb_build_object('success',false,'code','invalid_invite');
  end if;
  select p.* into v_target from public.user_profiles p
  where lower(p.patient_invite_code)=lower(btrim(input_code)) for update;
  if found then
    if not exists(select 1 from private.patient_invite_lifetimes l where l.profile_id=v_target.id
      and l.code=v_target.patient_invite_code and l.expires_at>now()) then
      return jsonb_build_object('success',false,'code','invite_expired','message','Convite expirado. Peça um novo ao profissional.');
    end if;
    if v_target.email is not null and not exists(select 1 from auth.users u where u.id=auth.uid()
      and lower(u.email)=lower(v_target.email) and u.email_confirmed_at is not null) then
      return jsonb_build_object('success',false,'code','invite_recipient_mismatch','message','Este convite precisa ser aceito com o email do destinatário.');
    end if;
  end if;
  return private.redeem_invite_code_wave03(input_code);
end;
$function$;
revoke all on function private.redeem_invite_code(text) from public,anon,authenticated,service_role;
grant execute on function private.redeem_invite_code(text) to authenticated;

create or replace function private.get_invite_details(p_invite_code text)
returns table(patient_name text,nutritionist_name text,nutritionist_gender text)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_invite_code is null or length(btrim(p_invite_code)) not between 1 and 128 then
    raise exception using errcode='22023',message='invalid_invite';
  end if;
  if not exists(select 1 from public.user_profiles p join private.patient_invite_lifetimes l on l.profile_id=p.id
    where lower(p.patient_invite_code)=lower(btrim(p_invite_code)) and p.user_type='patient'
      and l.expires_at>now() and l.code=p.patient_invite_code
      and not exists(select 1 from auth.users where id=p.id)) then
    raise exception using errcode='22023',message='invalid_invite';
  end if;
  -- Possession of a code must not disclose the patient's name or clinical fields.
  return query select null::text,null::text,null::text;
end;
$function$;

create table private.patient_creation_quota (
  actor uuid primary key references auth.users(id) on delete cascade,
  bucket bigint not null, attempts integer not null
);
revoke all on private.patient_creation_quota from public,anon,authenticated,service_role;
create function public.consume_patient_creation_quota(p_actor uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_bucket bigint:=floor(extract(epoch from now())/600); v_count integer;
begin
  delete from private.patient_creation_quota where bucket<v_bucket-144;
  insert into private.patient_creation_quota(actor,bucket,attempts) values(p_actor,v_bucket,1)
  on conflict(actor) do update set bucket=excluded.bucket,
    attempts=case when private.patient_creation_quota.bucket=excluded.bucket then private.patient_creation_quota.attempts+1 else 1 end
  returning attempts into v_count;
  return v_count<=20;
end;
$function$;
revoke all on function public.consume_patient_creation_quota(uuid) from public,anon,authenticated;
grant execute on function public.consume_patient_creation_quota(uuid) to service_role;

-- Self-service profile inserts bypass Auth provisioning and are no longer permitted.
revoke insert on public.user_profiles from authenticated;

-- Keep existing approvals untouched; new public professionals start pending.
create or replace function private.auto_approve_prelaunch_nutritionist()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.user_type='nutritionist' then
    insert into public.professional_verifications(user_id,professional_role,status,verification_method,valid_until)
    values(new.id,'nutritionist',
      case when session_user in ('postgres','supabase_admin') then 'approved' else 'not_submitted' end,
      case when session_user in ('postgres','supabase_admin') then 'approved_by_migration' else null end,
      case when session_user in ('postgres','supabase_admin') then now()+interval '1 year' else null end)
    on conflict(user_id) do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.track_patient_invite_lifetime() from public,anon,authenticated,service_role;
commit;

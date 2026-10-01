-- Forward repair: preserve applied history and clinical rows.

begin;

CREATE OR REPLACE FUNCTION private.get_comprehensive_activity_feed_optimized(p_nutritionist_id uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(activity_type text, activity_id text, patient_id uuid, patient_name text, activity_date timestamp with time zone, activity_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare q text; queries text[] := '{}'; begin
 perform private.wave05_require_active_actor();
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;  if p_limit is null or p_limit < 1 then p_limit := 30; end if; p_limit := least(p_limit,100); if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_audit_log') then q := 'select ''meal''::text as activity_type, mal.id::text as activity_id, mal.patient_id::uuid as patient_id, p.name as patient_name, mal.created_at as activity_date, jsonb_build_object(''meal_type'', mal.meal_type, ''total_calories'', case when mal.details->>''total_calories'' ~ ''^[0-9]{1,8}([.][0-9]{1,4})?$'' then (mal.details->>''total_calories'')::numeric else null end, ''action'', mal.action) as activity_data from public.meal_audit_log mal join patients p on p.id = mal.patient_id where private.can_read_care_episode(mal.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'growth_records') then q := 'select ''anthropometry''::text as activity_type, gr.id::text as activity_id, gr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(gr.record_date::timestamptz, gr.created_at, now()) as activity_date, jsonb_build_object(''weight'', gr.weight, ''height'', gr.height) as activity_data from public.growth_records gr join patients p on p.id = gr.patient_id where private.can_read_care_episode(gr.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'anamnesis_records') then q := 'select ''anamnesis''::text as activity_type, anr.id::text as activity_id, anr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(anr.date::timestamptz, anr.created_at, now()) as activity_date, jsonb_build_object(''status'', ''completed'') as activity_data from public.anamnesis_records anr join patients p on p.id = anr.patient_id where private.can_read_care_episode(anr.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_plans') then q := 'select ''meal_plan''::text as activity_type, mp.id::text as activity_id, mp.patient_id::uuid as patient_id, p.name as patient_name, mp.created_at as activity_date, jsonb_build_object(''name'', mp.name) as activity_data from public.meal_plans mp join patients p on p.id = mp.patient_id where private.can_read_care_episode(mp.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then q := 'select ''appointment''::text as activity_type, a.id::text as activity_id, a.patient_id::uuid as patient_id, p.name as patient_name, coalesce(a.start_time, a.appointment_time, now()) as activity_date, jsonb_build_object(''notes'', a.notes) as activity_data from public.appointments a join patients p on p.id = a.patient_id where private.can_read_care_episode(a.care_episode_id) or (a.care_episode_id is null and a.nutritionist_id=$1)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_achievements') then q := 'select ''achievement''::text as activity_type, ua.id::text as activity_id, ua.user_id::uuid as patient_id, p.name as patient_name, ua.achieved_at as activity_date, jsonb_build_object(''achievement_id'', ua.achievement_id) as activity_data from public.user_achievements ua join patients p on p.id = ua.user_id'; queries := array_append(queries, q); end if; if array_length(queries, 1) is null then return; end if; q := 'with patients as (select p.id, p.name from public.user_profiles p where p.is_active and exists (select 1 from public.care_episodes e where e.patient_id=p.id and e.nutritionist_id=$1 and e.status=''active'' and private.can_read_care_episode(e.id))) select * from (' || array_to_string(queries, ' union all ') || ') feed order by activity_date desc nulls last limit $2'; return query execute q using p_nutritionist_id, p_limit; end; $function$;

CREATE OR REPLACE FUNCTION private.get_patients_pending_data_optimized(p_nutritionist_id uuid)
 RETURNS TABLE(patient_id uuid, patient_name text, has_anamnese boolean, has_anthropometry boolean, has_meal_plan boolean, has_prescription boolean, pending_items text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 perform private.wave05_require_active_actor();
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    RETURN QUERY
    WITH active_patients AS (
        SELECT
            id AS patient_id,
            name AS patient_name
        FROM user_profiles
        WHERE
            nutritionist_id = p_nutritionist_id
            AND user_type = 'patient'
            AND is_active = true
    ),
    patient_anamnese AS (
        SELECT DISTINCT ar.patient_id
        FROM anamnesis_records ar
        INNER JOIN active_patients ap ON ap.patient_id = ar.patient_id AND private.can_read_care_episode(ar.care_episode_id)
    ),
    patient_anthropometry AS (
        SELECT DISTINCT gr.patient_id
        FROM growth_records gr
        INNER JOIN active_patients ap ON ap.patient_id = gr.patient_id AND private.can_read_care_episode(gr.care_episode_id)
    ),
    patient_meal_plans AS (
        SELECT DISTINCT mp.patient_id
        FROM meal_plans mp
        INNER JOIN active_patients ap ON ap.patient_id = mp.patient_id AND private.can_read_care_episode(mp.care_episode_id)
        WHERE mp.is_active = true
    ),
    patient_prescriptions AS (
        SELECT DISTINCT pr.patient_id
        FROM prescriptions pr
        INNER JOIN active_patients ap ON ap.patient_id = pr.patient_id AND private.can_read_care_episode(pr.care_episode_id)
        WHERE CURRENT_DATE BETWEEN pr.start_date AND pr.end_date
    )
    SELECT
        ap.patient_id,
        ap.patient_name,
        (pa.patient_id IS NOT NULL) AS has_anamnese,
        (pant.patient_id IS NOT NULL) AS has_anthropometry,
        (pmp.patient_id IS NOT NULL) AS has_meal_plan,
        (pp.patient_id IS NOT NULL) AS has_prescription,
        ARRAY_REMOVE(ARRAY[
            CASE WHEN pa.patient_id IS NULL THEN 'anamnese' END,
            CASE WHEN pant.patient_id IS NULL THEN 'anthropometry' END,
            CASE WHEN pmp.patient_id IS NULL THEN 'meal_plan' END,
            CASE WHEN pp.patient_id IS NULL THEN 'prescription' END
        ], NULL) AS pending_items
    FROM active_patients ap
    LEFT JOIN patient_anamnese pa ON pa.patient_id = ap.patient_id
    LEFT JOIN patient_anthropometry pant ON pant.patient_id = ap.patient_id
    LEFT JOIN patient_meal_plans pmp ON pmp.patient_id = ap.patient_id
    LEFT JOIN patient_prescriptions pp ON pp.patient_id = ap.patient_id
    WHERE
        -- Apenas pacientes com pelo menos 1 item pendente
        pa.patient_id IS NULL
        OR pant.patient_id IS NULL
        OR pmp.patient_id IS NULL
        OR pp.patient_id IS NULL
    ORDER BY ap.patient_name;
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_patients_low_adherence_optimized(p_nutritionist_id uuid, p_days_threshold integer DEFAULT 7)
 RETURNS TABLE(patient_id uuid, patient_name text, last_meal_date timestamp with time zone, days_since_last_meal integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 perform private.wave05_require_active_actor();
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    RETURN QUERY
    WITH patient_last_meals AS (
        SELECT
            up.id AS patient_id,
            up.name AS patient_name,
            MAX(m.created_at) AS last_meal_date
        FROM user_profiles up
        LEFT JOIN meals m ON m.patient_id = up.id AND private.can_read_care_episode(m.care_episode_id) AND m.deleted_at IS NULL
        WHERE
            up.nutritionist_id = p_nutritionist_id
            AND up.user_type = 'patient'
            AND up.is_active = true
        GROUP BY up.id, up.name
    )
    SELECT
        plm.patient_id,
        plm.patient_name,
        plm.last_meal_date,
        CASE
            WHEN plm.last_meal_date IS NULL THEN 9999
            ELSE EXTRACT(DAY FROM NOW() - plm.last_meal_date)::INT
        END AS days_since_last_meal
    FROM patient_last_meals plm
    WHERE
        plm.last_meal_date IS NULL
        OR EXTRACT(DAY FROM NOW() - plm.last_meal_date) >= p_days_threshold
    ORDER BY days_since_last_meal DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_daily_adherence(p_nutritionist_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    total_patients_with_plan INTEGER;
    patients_registered_today INTEGER;
    adherence_percentage NUMERIC;
BEGIN
 perform private.wave05_require_active_actor();
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    -- 1. Conta quantos pacientes ATIVOS do nutri têm uma prescrição ATIVA HOJE
    SELECT COUNT(DISTINCT id)
    INTO total_patients_with_plan
    FROM public.user_profiles p
    WHERE p.nutritionist_id = p_nutritionist_id
      AND p.is_active = true
      AND EXISTS (
        SELECT 1 FROM public.prescriptions pr
        WHERE pr.patient_id = p.id AND private.can_read_care_episode(pr.care_episode_id)
          AND CURRENT_DATE >= pr.start_date
          AND CURRENT_DATE <= pr.end_date
      );

    -- 2. Desses pacientes, conta quantos registraram PELO MENOS UMA refeição hoje
    SELECT COUNT(DISTINCT m.patient_id)
    INTO patients_registered_today
    FROM public.meals m
    JOIN public.user_profiles p ON m.patient_id = p.id
    WHERE p.nutritionist_id = p_nutritionist_id
      AND m.meal_date = CURRENT_DATE AND m.deleted_at IS NULL AND private.can_read_care_episode(m.care_episode_id)
      AND EXISTS (SELECT 1 FROM public.prescriptions pr WHERE pr.patient_id=p.id AND private.can_read_care_episode(pr.care_episode_id) AND CURRENT_DATE BETWEEN pr.start_date AND pr.end_date);

    -- 3. Calcula a porcentagem
    IF total_patients_with_plan > 0 THEN
        adherence_percentage := (patients_registered_today::NUMERIC / total_patients_with_plan::NUMERIC) * 100;
    ELSE
        adherence_percentage := 0; -- Evita divisão por zero
    END IF;

    RETURN COALESCE(adherence_percentage, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION private.log_meal_action_secure(p_meal_id text, p_action text, p_details jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_meal public.meals%rowtype;
begin
 perform private.wave05_require_active_actor();
 select * into v_meal from public.meals where id::text=p_meal_id;
 if not found or (v_meal.patient_id=auth.uid() or private.lock_and_can_write_active_care_episode(v_meal.care_episode_id)) is not true then
  raise exception using errcode='42501',message='meal_audit_forbidden';
 end if;
 insert into public.meal_audit_log(meal_id,patient_id,care_episode_id,action,details,created_at)
 values(v_meal.id,v_meal.patient_id,v_meal.care_episode_id,p_action,p_details,now());
end;
$function$;

CREATE OR REPLACE FUNCTION private.log_activity_event(p_event_name text, p_event_version integer DEFAULT 1, p_source_module text DEFAULT NULL::text, p_patient_id uuid DEFAULT NULL::uuid, p_nutritionist_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_episode public.care_episodes%rowtype;
BEGIN
 perform private.wave05_require_active_actor();
 if p_patient_id is not null then
  select * into v_episode from public.care_episodes where patient_id=p_patient_id and status='active';
  if (p_patient_id=auth.uid() or private.lock_and_can_write_active_care_episode(v_episode.id)) is not true
    or (p_nutritionist_id is not null and p_nutritionist_id is distinct from v_episode.nutritionist_id) then
   raise exception using errcode='42501',message='activity_target_forbidden';
  end if;
 elsif p_nutritionist_id is not null and (p_nutritionist_id is distinct from auth.uid()
   or not exists(select 1 from public.user_profiles where id=auth.uid() and user_type='nutritionist')) then
  raise exception using errcode='42501',message='activity_target_forbidden';
 end if;

  INSERT INTO public.activity_log (
    event_name,
    event_version,
    source_module,
    patient_id,
    nutritionist_id,
    actor_user_id,
    occurred_at,
    payload
  )
  VALUES (
    COALESCE(NULLIF(trim(p_event_name), ''), 'unknown.event'),
    GREATEST(COALESCE(p_event_version, 1), 1),
    p_source_module,
    p_patient_id,
    p_nutritionist_id,
    (SELECT auth.uid()),
    now(),
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.assign_patient_owned_care_episode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_episode public.care_episodes%rowtype;
begin
  -- Audit follows its referenced meal, including a legitimately NULL episode.
  if tg_table_name='meal_audit_log' then
   if new.meal_id is not null then
    select ce.* into v_episode from public.meals m
      left join public.care_episodes ce on ce.id=m.care_episode_id
      where m.id=new.meal_id and m.patient_id=new.patient_id;
    if found then new.care_episode_id:=v_episode.id; return new; end if;
   end if;
  end if;
  if new.care_episode_id is not null then
    if not exists (
      select 1 from public.care_episodes ce
      where ce.id = new.care_episode_id
        and ce.patient_id = new.patient_id
    ) then
      raise exception 'EpisÃ³dio incompatÃ­vel com o paciente.' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_episode
  from public.care_episodes ce
  where ce.patient_id = new.patient_id
    and ce.status = 'active'
  limit 1;

  if not found then
    -- Paciente ainda sem nutricionista: o registro continua privado e sem episÃ³dio.
    new.care_episode_id := null;
    return new;
  end if;

  new.care_episode_id := v_episode.id;
  return new;
end;
$function$;

alter table private.auth_legal_receipts drop constraint auth_legal_receipts_version_check;
alter table private.auth_legal_receipts add constraint auth_legal_receipts_version_check check (version in ('2026-10-01','2026-10-01.2'));

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
    coalesce(new.raw_user_meta_data->>'legal_version','') not in ('2026-10-01','2026-10-01.2')
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
  if new.raw_user_meta_data->>'legal_version' in ('2026-10-01','2026-10-01.2') and new.raw_user_meta_data->'terms_accepted'='true'::jsonb then
    insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source)
    values(new.id,new.raw_user_meta_data->>'legal_version','terms',true,'signup'),
          (new.id,new.raw_user_meta_data->>'legal_version','analytics',coalesce(new.raw_user_meta_data->'analytics_allowed'='true'::jsonb,false),'signup');
  end if;
  -- Only the recipient-bound server nonce can establish this relationship.
  -- Its insertion and episode trigger commit atomically with the Auth identity.
  if v_inviter is not null then
    if not exists(select 1 from public.user_profiles where id=v_inviter and user_type='nutritionist' and is_active)
      or not exists(select 1 from public.professional_verifications where user_id=v_inviter and status='approved' and valid_until>now()) then
      raise exception using errcode='42501',message='patient_inviter_inactive';
    end if;
    insert into public.nutritionist_patients(nutritionist_id,patient_id,status)
    values(v_inviter,new.id,'active');
  end if;
  return new;
end;
$function$;



CREATE OR REPLACE FUNCTION public.list_nutritionist_care_patients()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with caller as (
    select auth.uid() as id
  ), ranked as (
    select
      ce.*,
      row_number() over (
        partition by ce.patient_id
        order by (ce.status = 'active') desc, ce.started_at desc
      ) as position,
      count(*) over (partition by ce.patient_id) as episode_count
    from public.care_episodes ce, caller c
    where ce.nutritionist_id = c.id
  )
  select jsonb_strip_nulls(
    (case when r.status = 'active'
      then private.minimal_patient_snapshot(r.patient_id)
      else coalesce(nullif(r.patient_snapshot, '{}'::jsonb), private.minimal_patient_snapshot(r.patient_id))
    end)
    || jsonb_build_object(
      'id', r.patient_id,
      'access_status', case when r.status='ended' then 'archived'
        when not exists(select 1 from auth.users au where au.id=r.patient_id) then 'offline'
        when exists(select 1 from auth.users au where au.id=r.patient_id and au.email_confirmed_at is not null) then 'ready'
        else 'awaiting_email_confirmation' end,
      'care_episode_id', r.id,
      'care_status', r.status,
      'link_status', r.status,
      'is_active', r.status = 'active',
      'arquivadoHistorico', r.status = 'ended',
      'episode_count', r.episode_count,
      'care_started_at', r.started_at,
      'care_ended_at', r.ended_at,
      'care_end_reason', r.end_reason,
      'created_at', r.started_at
    )
  )
  from ranked r
  where r.position = 1
    and r.end_reason is distinct from 'empty_profile_removed'
    and exists (
      select 1 from public.user_profiles caller_profile
      where caller_profile.id = auth.uid()
        and caller_profile.user_type = 'nutritionist' and private.wave05_active_actor()
    )
  order by (r.status = 'active') desc, r.started_at desc;
$function$;

create or replace function public.get_my_privacy_preferences()
returns jsonb language sql stable security definer set search_path = ''
as $function$
 with latest_analytics as (select version,allowed,recorded_at from private.auth_legal_receipts
  where user_id=auth.uid() and purpose='analytics' order by id desc limit 1)
 select jsonb_build_object('version','2026-10-01.2',
  'terms_accepted',coalesce((select allowed from private.auth_legal_receipts
   where user_id=auth.uid() and purpose='terms' and version='2026-10-01.2' order by id desc limit 1),false),
  'analytics_choice_recorded',exists(select 1 from latest_analytics where version='2026-10-01.2' and recorded_at > now()-interval '180 days'),
  'analytics_allowed',coalesce((select allowed and version='2026-10-01.2' and recorded_at > now()-interval '180 days' from latest_analytics),false));
$function$;

create or replace function public.record_my_privacy_choice(p_version text,p_terms boolean,p_analytics boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception using errcode='42501', message='authentication_required'; end if;
  if coalesce(p_version,'') not in ('2026-10-01','2026-10-01.2') or p_terms is null or p_analytics is null then
    raise exception using errcode='22023', message='invalid_privacy_choice';
  end if;
  insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source)
  values (auth.uid(),p_version,'terms',p_terms,'preferences'),
         (auth.uid(),p_version,'analytics',p_analytics,'preferences');
end;
$function$;


-- CREATE OR REPLACE preserves existing ACLs; trigger remains non-callable.

revoke all on function private.handle_new_user() from public,anon,authenticated,service_role;

commit;


-- Forward-only authorization repair; no existing account or clinical row is rewritten.
begin;

CREATE OR REPLACE FUNCTION private.wave05_active_actor()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 select exists(select 1 from public.user_profiles p where p.id=auth.uid() and p.is_active is true)
$function$;
REVOKE ALL ON FUNCTION private.wave05_active_actor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.wave05_active_actor() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.wave05_can_edit_profile(p_profile_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 select private.wave05_active_actor() and exists(select 1 from public.care_episodes e where e.patient_id=p_profile_id and private.can_write_active_care_episode(e.id))
$function$;
REVOKE ALL ON FUNCTION private.wave05_can_edit_profile(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.wave05_can_edit_profile(uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS "Read user_profiles" ON public.user_profiles;
CREATE POLICY "Read user_profiles" ON public.user_profiles FOR SELECT TO authenticated
 USING (id=(select auth.uid()) OR (user_type='patient' AND private.wave05_can_edit_profile(id)));
DROP POLICY IF EXISTS "Users can update profile" ON public.user_profiles;
CREATE POLICY "Users can update profile" ON public.user_profiles FOR UPDATE TO authenticated
 USING (id=(select auth.uid()) OR (user_type='patient' AND private.wave05_can_edit_profile(id)))
 WITH CHECK (id=(select auth.uid()) OR (user_type='patient' AND private.wave05_can_edit_profile(id)));

CREATE OR REPLACE FUNCTION private.wave05_chat_relationship(p_from uuid,p_to uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 select p_from<>p_to and exists(
  select 1 from public.nutritionist_patients np
  join public.user_profiles n on n.id=np.nutritionist_id and n.is_active is true
  join public.user_profiles p on p.id=np.patient_id and p.is_active is true
  where np.status='active'
   and ((np.nutritionist_id=p_from and np.patient_id=p_to) or (np.patient_id=p_from and np.nutritionist_id=p_to))
   and private.has_current_clinical_capacity(np.nutritionist_id))
$function$;
REVOKE ALL ON FUNCTION private.wave05_chat_relationship(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.wave05_chat_relationship(uuid,uuid) TO authenticated,service_role;

DROP POLICY IF EXISTS "Chat participants can insert" ON public.chats;
CREATE POLICY "Chat participants can insert" ON public.chats FOR INSERT TO authenticated
 WITH CHECK (from_id=(select auth.uid()) AND private.wave05_active_actor() AND private.wave05_chat_relationship(from_id,to_id));
-- Historical messages remain readable only by their participants, including after a transfer.
CREATE POLICY wave05_chat_active_actor ON public.chats AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.wave05_active_actor()) WITH CHECK(private.wave05_active_actor());

CREATE OR REPLACE FUNCTION private.wave05_guard_profile_update()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
declare v_allowed text[];v_key text;
begin
 -- Reviewed SECURITY DEFINER operations and service workers retain their own authority.
 if current_user <> 'authenticated' then return new; end if;
 if not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;
 if old.id=auth.uid() then
  v_allowed:=array['name','crn','birth_date','gender','height','weight','goal','avatar_url','phone','address','specialties','education','bio','cpf','occupation','civil_status','preferences','clinic_settings','ethnicity','last_seen_at','needs_password_reset','slug'];
 else
  if old.user_type<>'patient' or not private.wave05_can_edit_profile(old.id) then
   raise exception using errcode='42501',message='relationship_inactive';
  end if;
  v_allowed:=array['name','birth_date','gender','height','weight','goal','patient_category','fiscal_data','preferences','avatar_url','phone','address','cpf','occupation','civil_status','observations','ethnicity','clinical_flags','slug','email'];
 end if;
 for v_key in select k from jsonb_object_keys(to_jsonb(new)) k where to_jsonb(new)->k is distinct from to_jsonb(old)->k loop
  if not v_key=any(v_allowed) then raise exception using errcode='42501',message='forbidden';end if;
 end loop;
 return new;
end;
$function$;
REVOKE ALL ON FUNCTION private.wave05_guard_profile_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave05_profile_authority BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION private.wave05_guard_profile_update();
REVOKE UPDATE ON public.user_profiles FROM authenticated;
GRANT UPDATE(name,crn,birth_date,gender,height,weight,goal,patient_category,fiscal_data,preferences,avatar_url,phone,address,specialties,education,bio,cpf,occupation,civil_status,observations,clinic_settings,needs_password_reset,ethnicity,last_seen_at,clinical_flags,email) ON public.user_profiles TO authenticated;

CREATE POLICY wave05_notification_active_actor ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
 USING(private.wave05_active_actor()) WITH CHECK(private.wave05_active_actor());
REVOKE INSERT,UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;

-- Profile measurements are not a validated clinical assessment. Avoid the legacy
-- implicit INSERT, which failed RLS or fabricated an assessment without a protocol.
-- Explicit assessment RPCs remain the sole clinical write path.
CREATE OR REPLACE FUNCTION public.sync_anthropometry_on_profile_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
begin return new;end;
$function$;
REVOKE ALL ON FUNCTION public.sync_anthropometry_on_profile_change() FROM PUBLIC,anon,authenticated;

-- Trigger functions cannot be invoked as RPCs and never need client execution grants.
DO $block$ declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prorettype='trigger'::regtype loop
  execute format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC,anon,authenticated',f.nspname,f.proname,f.args);
 end loop;
end $block$;
CREATE OR REPLACE FUNCTION private.get_chat_recipient_profile(recipient_id uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, user_type text, is_active boolean, nutritionist_id uuid, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 if not private.wave05_active_actor() or not (recipient_id=auth.uid() or private.wave05_chat_relationship(auth.uid(),recipient_id) or exists(select 1 from public.chats c where (c.from_id=auth.uid() and c.to_id=recipient_id) or (c.to_id=auth.uid() and c.from_id=recipient_id))) then raise exception using errcode='42501',message='forbidden';end if;

    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.user_type,
        up.is_active,
        up.nutritionist_id,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.id = recipient_id;
END;
$function$;
REVOKE ALL ON FUNCTION private.get_chat_recipient_profile(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_chat_recipient_profile(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_chat_recipient_profile(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION private.get_nutritionist_conversations(p_nutritionist_id uuid)
 RETURNS TABLE(recipient_id uuid, recipient_name text, recipient_avatar text, last_message_content text, last_message_at timestamp with time zone, unread_count bigint, is_active boolean, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;

    RETURN QUERY
    WITH last_messages AS (
        SELECT DISTINCT ON (
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END
        )
            from_id,
            to_id,
            message,
            message_type,
            media_url,
            created_at,
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END as other_user_id
        FROM public.chats
        WHERE from_id = p_nutritionist_id OR to_id = p_nutritionist_id
        ORDER BY other_user_id, created_at DESC
    ),
    unread_counts AS (
        SELECT 
            (content->>'from_id')::uuid as other_user_id, 
            count(*) as count
        FROM public.notifications
        WHERE user_id = p_nutritionist_id AND type = 'new_message' AND (is_read = false OR is_read IS NULL)
        GROUP BY (content->>'from_id')::uuid
    )
    SELECT 
        up.id as recipient_id,
        up.name as recipient_name,
        up.avatar_url as recipient_avatar,
        CASE 
            WHEN lm.message_type = 'audio' THEN '🎤 Áudio'
            WHEN lm.message_type = 'image' THEN '📷 Imagem'
            WHEN lm.message_type = 'file' THEN '📁 Arquivo'
            ELSE lm.message
        END as last_message_content,
        lm.created_at as last_message_at,
        COALESCE(uc.count, 0) as unread_count,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    JOIN last_messages lm ON up.id = lm.other_user_id
    LEFT JOIN unread_counts uc ON up.id = uc.other_user_id
    ORDER BY lm.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION private.get_nutritionist_conversations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_nutritionist_conversations(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_nutritionist_conversations(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION private.get_patients_for_new_chat(p_nutritionist_id uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, is_active boolean, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;

    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.nutritionist_id = p_nutritionist_id AND private.wave05_chat_relationship(p_nutritionist_id,up.id)
    ORDER BY up.is_active DESC, up.name ASC;
END;
$function$;
REVOKE ALL ON FUNCTION private.get_patients_for_new_chat(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_patients_for_new_chat(uuid) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_patients_for_new_chat(uuid) FROM PUBLIC,anon;

CREATE OR REPLACE FUNCTION private.can_write_active_care_episode(p_episode_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.wave05_active_actor() and exists (
    select 1
    from public.care_episodes e
    where e.id=p_episode_id
      and e.status='active'
      and (
        (e.is_simulation and e.nutritionist_id=(select auth.uid()))
        or (
          not e.is_simulation
          and e.student_id is null
          and e.supervisor_id is null
          and e.nutritionist_id=(select auth.uid())
          and exists (
            select 1 from public.professional_verifications pv
            where pv.user_id=e.nutritionist_id
              and pv.professional_role='nutritionist'
              and pv.status='approved'
              and pv.valid_until>now()
          )
        )
        or (
          not e.is_simulation
          and (select auth.uid()) in (e.student_id,e.supervisor_id)
          and exists (
            select 1
            from public.student_supervisions s
            join public.professional_verifications student_pv on student_pv.user_id=s.student_id
            join public.professional_verifications supervisor_pv on supervisor_pv.user_id=s.supervisor_id
            where s.student_id=e.student_id
              and s.supervisor_id=e.supervisor_id
              and s.status='active'
              and student_pv.professional_role='student'
              and student_pv.status='approved'
              and student_pv.valid_until>now()
              and supervisor_pv.professional_role='nutritionist'
              and supervisor_pv.status='approved'
              and supervisor_pv.valid_until>now()
          )
        )
      )
  )
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
BEGIN if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    -- 1. Conta quantos pacientes ATIVOS do nutri têm uma prescrição ATIVA HOJE
    SELECT COUNT(DISTINCT id)
    INTO total_patients_with_plan
    FROM public.user_profiles p
    WHERE p.nutritionist_id = p_nutritionist_id
      AND p.is_active = true
      AND EXISTS (
        SELECT 1 FROM public.prescriptions pr
        WHERE pr.patient_id = p.id
          AND CURRENT_DATE >= pr.start_date
          AND CURRENT_DATE <= pr.end_date
      );

    -- 2. Desses pacientes, conta quantos registraram PELO MENOS UMA refeição hoje
    SELECT COUNT(DISTINCT m.patient_id)
    INTO patients_registered_today
    FROM public.meals m
    JOIN public.user_profiles p ON m.patient_id = p.id
    WHERE p.nutritionist_id = p_nutritionist_id
      AND m.meal_date = CURRENT_DATE;

    -- 3. Calcula a porcentagem
    IF total_patients_with_plan > 0 THEN
        adherence_percentage := (patients_registered_today::NUMERIC / total_patients_with_plan::NUMERIC) * 100;
    ELSE
        adherence_percentage := 0; -- Evita divisão por zero
    END IF;

    RETURN COALESCE(adherence_percentage, 0);
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_patients_low_adherence_optimized(p_nutritionist_id uuid, p_days_threshold integer DEFAULT 7)
 RETURNS TABLE(patient_id uuid, patient_name text, last_meal_date timestamp with time zone, days_since_last_meal integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    RETURN QUERY
    WITH patient_last_meals AS (
        SELECT
            up.id AS patient_id,
            up.name AS patient_name,
            MAX(m.created_at) AS last_meal_date
        FROM user_profiles up
        LEFT JOIN meals m ON m.patient_id = up.id
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
CREATE OR REPLACE FUNCTION private.get_patients_pending_data_optimized(p_nutritionist_id uuid)
 RETURNS TABLE(patient_id uuid, patient_name text, has_anamnese boolean, has_anthropometry boolean, has_meal_plan boolean, has_prescription boolean, pending_items text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
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
        INNER JOIN active_patients ap ON ap.patient_id = ar.patient_id
    ),
    patient_anthropometry AS (
        SELECT DISTINCT gr.patient_id
        FROM growth_records gr
        INNER JOIN active_patients ap ON ap.patient_id = gr.patient_id
    ),
    patient_meal_plans AS (
        SELECT DISTINCT mp.patient_id
        FROM meal_plans mp
        INNER JOIN active_patients ap ON ap.patient_id = mp.patient_id
        WHERE mp.is_active = true
    ),
    patient_prescriptions AS (
        SELECT DISTINCT pr.patient_id
        FROM prescriptions pr
        INNER JOIN active_patients ap ON ap.patient_id = pr.patient_id
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
CREATE OR REPLACE FUNCTION private.get_comprehensive_activity_feed_optimized(p_nutritionist_id uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(activity_type text, activity_id text, patient_id uuid, patient_name text, activity_date timestamp with time zone, activity_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare q text; queries text[] := '{}'; begin if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;  if p_limit is null or p_limit < 1 then p_limit := 30; end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_audit_log') then q := 'select ''meal''::text as activity_type, mal.id::text as activity_id, mal.patient_id::uuid as patient_id, p.name as patient_name, mal.created_at as activity_date, jsonb_build_object(''meal_type'', mal.meal_type, ''total_calories'', case when mal.details is null then null else nullif(mal.details->>''total_calories'', '''')::numeric end, ''action'', mal.action) as activity_data from public.meal_audit_log mal join patients p on p.id = mal.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'growth_records') then q := 'select ''anthropometry''::text as activity_type, gr.id::text as activity_id, gr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(gr.record_date::timestamptz, gr.created_at, now()) as activity_date, jsonb_build_object(''weight'', gr.weight, ''height'', gr.height) as activity_data from public.growth_records gr join patients p on p.id = gr.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'anamnesis_records') then q := 'select ''anamnesis''::text as activity_type, anr.id::text as activity_id, anr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(anr.date::timestamptz, anr.created_at, now()) as activity_date, jsonb_build_object(''status'', ''completed'') as activity_data from public.anamnesis_records anr join patients p on p.id = anr.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_plans') then q := 'select ''meal_plan''::text as activity_type, mp.id::text as activity_id, mp.patient_id::uuid as patient_id, p.name as patient_name, mp.created_at as activity_date, jsonb_build_object(''name'', mp.name) as activity_data from public.meal_plans mp join patients p on p.id = mp.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then q := 'select ''appointment''::text as activity_type, a.id::text as activity_id, a.patient_id::uuid as patient_id, p.name as patient_name, coalesce(a.start_time, a.appointment_time, now()) as activity_date, jsonb_build_object(''notes'', a.notes) as activity_data from public.appointments a join patients p on p.id = a.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_achievements') then q := 'select ''achievement''::text as activity_type, ua.id::text as activity_id, ua.user_id::uuid as patient_id, p.name as patient_name, ua.achieved_at as activity_date, jsonb_build_object(''achievement_id'', ua.achievement_id) as activity_data from public.user_achievements ua join patients p on p.id = ua.user_id'; queries := array_append(queries, q); end if; if array_length(queries, 1) is null then return; end if; q := 'with patients as (select id, name from public.user_profiles where nutritionist_id = $1) select * from (' || array_to_string(queries, ' union all ') || ') feed order by activity_date desc nulls last limit $2'; return query execute q using p_nutritionist_id, p_limit; end; $function$;
CREATE OR REPLACE FUNCTION private.check_and_grant_achievements(p_user_id uuid)
 RETURNS TABLE(name text, description text, icon_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    achievement_rec RECORD;
    newly_achieved RECORD;
    unlocked_achievements JSONB := '[]'::jsonb;
BEGIN if p_user_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    FOR achievement_rec IN
        SELECT a.*
        FROM public.achievements a
        LEFT JOIN public.user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = p_user_id
        WHERE ua.id IS NULL
    LOOP
        DECLARE
            is_achieved BOOLEAN := FALSE;
        BEGIN
            CASE achievement_rec.criteria->>'type'
                WHEN 'meal_count' THEN
                    SELECT count(*) >= (achievement_rec.criteria->>'count')::int INTO is_achieved FROM public.meals WHERE patient_id = p_user_id;
                WHEN 'log_streak' THEN
                    WITH dates AS (
                        SELECT DISTINCT meal_date 
                        FROM public.meals 
                        WHERE patient_id = p_user_id 
                        ORDER BY meal_date DESC
                    ),
                    streaks AS (
                        SELECT meal_date, meal_date - (ROW_NUMBER() OVER (ORDER BY meal_date) * INTERVAL '1 day') as grp 
                        FROM dates
                    )
                    SELECT COALESCE(MAX(count), 0) >= (achievement_rec.criteria->>'days')::int INTO is_achieved FROM (SELECT COUNT(*) as count FROM streaks GROUP BY grp) s;
                WHEN 'food_variety' THEN
                     SELECT count(DISTINCT food_id) >= (achievement_rec.criteria->>'count')::int INTO is_achieved FROM public.meal_items mi JOIN public.meals m ON mi.meal_id = m.id WHERE m.patient_id = p_user_id AND mi.food_id IS NOT NULL;
                WHEN 'weekday_log' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = (achievement_rec.criteria->>'day')::int) INTO is_achieved;
                WHEN 'weekend_log' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = 6) AND EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = 7) INTO is_achieved;
                WHEN 'meal_completion' THEN
                    SELECT EXISTS(SELECT 1 FROM (SELECT meal_date, array_agg(DISTINCT meal_type) as types FROM public.meals WHERE patient_id = p_user_id GROUP BY meal_date) as daily_meals WHERE daily_meals.types @> ARRAY['Café da Manhã', 'Almoço', 'Jantar']) INTO is_achieved;
                WHEN 'days_on_platform' THEN
                    SELECT (now()::date - (SELECT created_at::date FROM auth.users WHERE id = p_user_id)) >= (achievement_rec.criteria->>'days')::int INTO is_achieved;
                WHEN 'used_search' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id) INTO is_achieved;
                ELSE
                    is_achieved := FALSE;
            END CASE;

            IF is_achieved THEN
                INSERT INTO public.user_achievements (user_id, achievement_id)
                VALUES (p_user_id, achievement_rec.id)
                ON CONFLICT (user_id, achievement_id) DO NOTHING
                RETURNING achievement_id INTO newly_achieved;

                IF newly_achieved IS NOT NULL THEN
                    unlocked_achievements := unlocked_achievements || jsonb_build_object(
                        'name', achievement_rec.name,
                        'description', achievement_rec.description,
                        'icon_name', achievement_rec.icon_name
                    );

                    INSERT INTO public.notifications (user_id, type, content)
                    VALUES (p_user_id, 'new_achievement', jsonb_build_object('name', achievement_rec.name, 'description', achievement_rec.description));
                END IF;
            END IF;
        END;
    END LOOP;

    RETURN QUERY SELECT (value->>'name')::text, (value->>'description')::text, (value->>'icon_name')::text FROM jsonb_array_elements(unlocked_achievements);
END;
$function$;

-- Remove anonymous/default execution from non-public APIs, preserving effective
-- authenticated and service grants. Token APIs remain explicitly reviewed.
DO $block$ declare f record;v_allow text[]:=array['attach_anamnesis_file','detach_anamnesis_file','get_anamnesis_by_token','submit_anamnesis_by_token','verify_document_authenticity','get_invite_details','search_foods','get_food_stats','get_grams_from_measure','convert_custom_measure_to_grams','normalize_food_search','auth_uid','auth_role','auth_setting','get_user_id','is_nutritionist','is_patient'];begin
 for f in select p.oid,n.nspname,p.proname,p.prorettype,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') loop
  if f.prorettype<>'trigger'::regtype then
   if has_function_privilege('authenticated',f.oid,'EXECUTE') then execute format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',f.nspname,f.proname,f.args);end if;
   if has_function_privilege('service_role',f.oid,'EXECUTE') then execute format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',f.nspname,f.proname,f.args);end if;
  end if;
  execute format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC,anon',f.nspname,f.proname,f.args);
  if f.prorettype<>'trigger'::regtype and f.proname=any(v_allow) then execute format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon',f.nspname,f.proname,f.args);end if;
 end loop;
end $block$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public,private FROM anon;
-- Public document verification is an intentionally anonymous, token-bound API.
GRANT EXECUTE ON FUNCTION public.verify_document_authenticity(uuid) TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public,private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public,private REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public,private REVOKE ALL ON TABLES FROM anon,authenticated;

CREATE TABLE private.profile_authorization_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid,
 profile_id uuid NOT NULL,
 changed_fields text[] NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.profile_authorization_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_authorization_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON private.profile_authorization_events TO service_role;

CREATE OR REPLACE FUNCTION private.wave05_audit_profile_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_fields text[];
begin
 select array_agg(k order by k) into v_fields from jsonb_object_keys(to_jsonb(new)) k
 where to_jsonb(new)->k is distinct from to_jsonb(old)->k and k not in ('last_seen_at');
 if v_fields is not null then
  insert into private.profile_authorization_events(actor_id,profile_id,changed_fields) values(auth.uid(),new.id,v_fields);
 end if;
 return new;
end;
$function$;
REVOKE ALL ON FUNCTION private.wave05_audit_profile_update() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave05_profile_audit AFTER UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION private.wave05_audit_profile_update();
CREATE OR REPLACE FUNCTION private.can_read_care_episode(p_episode_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.wave05_active_actor() and (select auth.uid()) is not null and exists (
    select 1
    from public.care_episodes e
    where e.id=p_episode_id
      and (
        e.patient_id=(select auth.uid())
        or e.nutritionist_id=(select auth.uid())
        or e.student_id=(select auth.uid())
        or e.supervisor_id=(select auth.uid())
      )
  )
$function$;
CREATE OR REPLACE FUNCTION private.can_open_clinical_attachment(p_attachment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.wave05_active_actor() and private.can_list_clinical_attachment(p_attachment_id) and exists (
    select 1
    from public.clinical_attachments a
    where a.id=p_attachment_id
      and a.upload_confirmed_at is not null
      and a.status in ('pending_review','active','superseded','invalidated')
  )
$function$;
CREATE OR REPLACE FUNCTION private.can_access_patient_photo_object(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.wave05_active_actor() and
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.progress_photos photo
        join public.care_episodes episode on episode.id = photo.care_episode_id
        where photo.storage_path = p_name
          and photo.status = 'active'
          and (
            episode.patient_id = auth.uid()
            or episode.nutritionist_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.care_episodes episode
        where split_part(p_name, '/', 1) ~* '^[0-9a-f-]{36}$'
          and split_part(p_name, '/', 2) ~* '^[0-9a-f-]{36}$'
          and split_part(p_name, '/', 3) = 'anthropometry'
          and episode.patient_id = split_part(p_name, '/', 1)::uuid
          and episode.id = split_part(p_name, '/', 2)::uuid
          and (
            episode.patient_id = auth.uid()
            or episode.nutritionist_id = auth.uid()
          )
      )
    );
$function$;
CREATE OR REPLACE FUNCTION private.can_upload_patient_photo_object(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.wave05_active_actor() and
    auth.uid() is not null
    and split_part(p_name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and split_part(p_name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and split_part(p_name, '/', 3) in ('progress_photos', 'anthropometry')
    and exists (
      select 1 from public.care_episodes episode
      where episode.patient_id = split_part(p_name, '/', 1)::uuid
        and episode.id = split_part(p_name, '/', 2)::uuid
        and episode.status = 'active'
        and (
          episode.patient_id = auth.uid()
          or episode.nutritionist_id = auth.uid()
        )
    );
$function$;
CREATE OR REPLACE FUNCTION private.add_patient_xp(p_patient_id uuid, p_nutritionist_id uuid, p_xp integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  current_xp INTEGER;
  new_xp INTEGER;
  new_level TEXT;
BEGIN
 if auth.uid() is null or auth.uid() not in (p_patient_id,p_nutritionist_id) or not private.wave05_chat_relationship(p_patient_id,p_nutritionist_id) then raise exception using errcode='42501',message='forbidden';end if;

  SELECT xp_points INTO current_xp
  FROM nutritionist_patients
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  new_xp := COALESCE(current_xp, 0) + p_xp;
  
  new_level := CASE
    WHEN new_xp >= 5000 THEN 'Lendário'
    WHEN new_xp >= 2000 THEN 'Campeão'
    WHEN new_xp >= 1000 THEN 'Consistente'
    WHEN new_xp >= 500  THEN 'Dedicado'
    WHEN new_xp >= 200  THEN 'Comprometido'
    ELSE 'Iniciante'
  END;
  
  UPDATE nutritionist_patients SET
    xp_points = new_xp,
    level_name = new_level
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  RETURN jsonb_build_object('xp', new_xp, 'level', new_level, 'gained', p_xp);
END;
$function$;
CREATE OR REPLACE FUNCTION private.increment_checkin_streak(p_patient_id uuid, p_nutritionist_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  last_checkin TIMESTAMPTZ;
  current_streak INTEGER;
  best_streak INTEGER;
BEGIN
 if auth.uid() is null or auth.uid() not in (p_patient_id,p_nutritionist_id) or not private.wave05_chat_relationship(p_patient_id,p_nutritionist_id) then raise exception using errcode='42501',message='forbidden';end if;

  SELECT last_checkin_at, checkin_streak_current, checkin_streak_best
  INTO last_checkin, current_streak, best_streak
  FROM nutritionist_patients
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  IF last_checkin IS NULL OR last_checkin < now() - INTERVAL '2 days' THEN
    UPDATE nutritionist_patients SET
      checkin_streak_current = 1,
      last_checkin_at = now()
    WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  ELSE
    UPDATE nutritionist_patients SET
      checkin_streak_current = COALESCE(current_streak, 0) + 1,
      checkin_streak_best = GREATEST(COALESCE(best_streak, 0), COALESCE(current_streak, 0) + 1),
      last_checkin_at = now()
    WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_patient_progressive_profile(p_patient_id uuid, p_changes jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_key text; v_old jsonb; v_new jsonb; v_episode uuid; v_profile jsonb;
begin
 if not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb then raise exception using errcode='22023',message='profile_changes_required'; end if;
  if p_source not in ('patient','nutritionist','legal_guardian','migration') then raise exception using errcode='22023',message='invalid_profile_source'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('name','phone','birth_date','gender','email','occupation','civil_status','address')) then
    raise exception using errcode='22023',message='profile_field_not_allowed';
  end if;
  if v_actor=p_patient_id then if p_source<>'patient' then raise exception using errcode='42501',message='invalid_profile_source_for_actor'; end if;
  else v_episode:=private.resolve_active_care_episode(p_patient_id); if p_source<>'nutritionist' then raise exception using errcode='42501',message='invalid_profile_source_for_actor'; end if; end if;
  if p_changes ? 'name' and length(btrim(coalesce(p_changes->>'name','')))=0 then raise exception using errcode='23514',message='patient_name_required'; end if;
  select to_jsonb(p) into v_profile from public.user_profiles p where p.id=p_patient_id and p.user_type='patient' for update;
  if v_profile is null then raise exception using errcode='P0002',message='patient_not_found'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    v_old:=v_profile->v_key; v_new:=p_changes->v_key;
    case v_key
      when 'name' then update public.user_profiles set name=p_changes->>'name' where id=p_patient_id;
      when 'phone' then update public.user_profiles set phone=p_changes->>'phone' where id=p_patient_id;
      when 'birth_date' then update public.user_profiles set birth_date=nullif(p_changes->>'birth_date','')::date where id=p_patient_id;
      when 'gender' then update public.user_profiles set gender=p_changes->>'gender' where id=p_patient_id;
      when 'email' then update public.user_profiles set email=p_changes->>'email' where id=p_patient_id;
      when 'occupation' then update public.user_profiles set occupation=p_changes->>'occupation' where id=p_patient_id;
      when 'civil_status' then update public.user_profiles set civil_status=p_changes->>'civil_status' where id=p_patient_id;
      when 'address' then update public.user_profiles set address=p_changes->'address' where id=p_patient_id;
    end case;
    insert into public.patient_profile_events(patient_id,field_name,previous_value,new_value,source,actor_id,care_episode_id)
      values(p_patient_id,v_key,v_old,v_new,p_source,v_actor,v_episode);
  end loop;
  select jsonb_build_object('id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,'gender',p.gender,
    'email',p.email,'occupation',p.occupation,'civil_status',p.civil_status,'address',p.address)
    into v_profile from public.user_profiles p where p.id=p_patient_id;
  return v_profile;
end $function$;
CREATE OR REPLACE FUNCTION public.get_care_patient_profile(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_strip_nulls(
    (case when ce.status = 'active'
      then private.minimal_patient_snapshot(ce.patient_id)
      else coalesce(nullif(ce.patient_snapshot, '{}'::jsonb), private.minimal_patient_snapshot(ce.patient_id))
    end)
    || jsonb_build_object(
      'id', ce.patient_id,
      'care_episode_id', ce.id,
      'care_status', ce.status,
      'is_active', ce.status = 'active',
      'arquivadoHistorico', ce.status = 'ended',
      'care_started_at', ce.started_at,
      'care_ended_at', ce.ended_at
    )
  )
  from public.care_episodes ce
  where ce.patient_id = p_patient_id
    and ce.nutritionist_id = auth.uid() and private.wave05_active_actor()
  order by (ce.status = 'active') desc, ce.started_at desc
  limit 1;
$function$;
DO $block$ declare r record;begin
 for r in select c.relname,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity and c.relname not in ('user_profiles','chats','notifications') and exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polpermissive and p.polroles && array[0::oid,(select oid from pg_roles where rolname='authenticated')]) loop
  execute format('CREATE POLICY wave05_active_actor ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select private.wave05_active_actor())) WITH CHECK ((select private.wave05_active_actor()))',r.nspname,r.relname);
 end loop;
end $block$;
CREATE POLICY wave05_storage_active_actor ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING ((select private.wave05_active_actor())) WITH CHECK ((select private.wave05_active_actor()));

CREATE OR REPLACE FUNCTION private.wave05_require_active_actor() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
 if auth.uid() is not null and not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;
end;
$function$;
REVOKE ALL ON FUNCTION private.wave05_require_active_actor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.wave05_require_active_actor() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION private.add_patient_xp(p_patient_id uuid, p_nutritionist_id uuid, p_xp integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  current_xp INTEGER;
  new_xp INTEGER;
  new_level TEXT;
BEGIN
 perform private.wave05_require_active_actor();

 if auth.uid() is null or auth.uid() not in (p_patient_id,p_nutritionist_id) or not private.wave05_chat_relationship(p_patient_id,p_nutritionist_id) then raise exception using errcode='42501',message='forbidden';end if;

  SELECT xp_points INTO current_xp
  FROM nutritionist_patients
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  new_xp := COALESCE(current_xp, 0) + p_xp;
  
  new_level := CASE
    WHEN new_xp >= 5000 THEN 'Lendário'
    WHEN new_xp >= 2000 THEN 'Campeão'
    WHEN new_xp >= 1000 THEN 'Consistente'
    WHEN new_xp >= 500  THEN 'Dedicado'
    WHEN new_xp >= 200  THEN 'Comprometido'
    ELSE 'Iniciante'
  END;
  
  UPDATE nutritionist_patients SET
    xp_points = new_xp,
    level_name = new_level
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  RETURN jsonb_build_object('xp', new_xp, 'level', new_level, 'gained', p_xp);
END;
$function$;
CREATE OR REPLACE FUNCTION private.approve_patient_link(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_nutritionist_id uuid := auth.uid();
  v_link_status text;
begin
 perform private.wave05_require_active_actor();

  if v_nutritionist_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  select status into v_link_status
  from public.nutritionist_patients
  where nutritionist_id = v_nutritionist_id and patient_id = p_patient_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'SolicitaÃ§Ã£o nÃ£o encontrada');
  end if;

  if v_link_status not in ('pending', 'active', 'ended') then
    return jsonb_build_object('success', false, 'message', 'SolicitaÃ§Ã£o nÃ£o pode ser aprovada');
  end if;

  return private.start_care_episode(p_patient_id, 'link_approved');
end;
$function$;
CREATE OR REPLACE FUNCTION private.assert_plan_ready_to_activate(p_plan_id bigint, p_patient_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan public.meal_plans%rowtype;
begin
 perform private.wave05_require_active_actor();

  select * into v_plan from public.meal_plans where id=p_plan_id for update;
  if not found or v_plan.patient_id is distinct from p_patient_id
    or v_plan.nutritionist_id is distinct from auth.uid()
    or v_plan.archived_at is not null
    or not private.can_write_active_meal_plan(v_plan.patient_id,v_plan.nutritionist_id,v_plan.care_episode_id) then
    raise exception using errcode='42501',message='plan_activation_forbidden';
  end if;
  if v_plan.prescription_status not in ('finalized','signed')
    or v_plan.confirmed_by is distinct from auth.uid()
    or not exists(select 1 from public.meal_plan_meals m
      join public.meal_plan_foods f on f.meal_plan_meal_id=m.id
      where m.meal_plan_id=p_plan_id) then
    raise exception using errcode='22023',message='plan_requires_professional_finalization';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION private.can_manage_clinical_record_correction(p_replacement_record_id uuid, p_actor uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_amendment public.clinical_record_amendments%rowtype;
  v_target public.clinical_records%rowtype;
  v_episode public.care_episodes%rowtype;
begin
 perform private.wave05_require_active_actor();

  if p_actor is null or p_action not in ('edit','finalize','sign','abandon') then
    return false;
  end if;
  select * into v_amendment
  from public.clinical_record_amendments
  where replacement_record_id=p_replacement_record_id
    and amendment_type='correction' and status='draft';
  if not found then return false; end if;
  if p_actor=v_amendment.responsible_id then return true; end if;
  if p_action not in ('edit','abandon') or p_actor<>v_amendment.actor_id then
    return false;
  end if;
  select * into v_target from public.clinical_records where id=v_amendment.target_record_id;
  select * into v_episode from public.care_episodes where id=v_amendment.care_episode_id;
  return v_episode.status='active'
    and v_target.student_id=p_actor
    and v_target.supervisor_id=v_amendment.responsible_id
    and exists (
      select 1 from public.student_supervisions s
      where s.student_id=p_actor
        and s.supervisor_id=v_amendment.responsible_id
        and s.status='active'
    );
end
$function$;
CREATE OR REPLACE FUNCTION private.can_start_clinical_record_correction(p_record_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_record public.clinical_records%rowtype;
  v_episode public.care_episodes%rowtype;
  v_signer uuid;
begin
 perform private.wave05_require_active_actor();

  if p_actor is null then return false; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found or v_record.status<>'signed' then return false; end if;
  select * into v_episode from public.care_episodes where id=v_record.care_episode_id;
  if not found then return false; end if;
  v_signer:=private.clinical_record_signed_by(v_record.id);
  if v_signer is null then return false; end if;
  if p_actor=v_signer then return true; end if;
  if v_episode.status='active'
    and v_record.student_id=p_actor
    and v_record.supervisor_id=v_signer
    and exists (
      select 1 from public.student_supervisions s
      where s.student_id=p_actor and s.supervisor_id=v_signer and s.status='active'
    ) then
    return true;
  end if;
  return false;
end
$function$;
CREATE OR REPLACE FUNCTION private.capture_meal_plan_version(p_plan_id bigint, p_reason text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan public.meal_plans%rowtype;v_version integer;v_snapshot jsonb;
begin
 perform private.wave05_require_active_actor();

  select*into v_plan from public.meal_plans where id=p_plan_id;
  if not found then raise exception using errcode='P0002',message='meal_plan_not_found';end if;
  select coalesce(max(version_number),0)+1 into v_version from public.meal_plan_versions where meal_plan_id=p_plan_id;
  v_snapshot:=private.build_meal_plan_snapshot(p_plan_id);
  insert into public.meal_plan_versions(meal_plan_id,nutritionist_id,patient_id,care_episode_id,version_number,change_reason,snapshot,is_rollback,metadata,created_by)
  values(p_plan_id,v_plan.nutritionist_id,v_plan.patient_id,v_plan.care_episode_id,v_version,coalesce(nullif(btrim(p_reason),''),'EdiÃ§Ã£o do plano'),v_snapshot,false,coalesce(p_metadata,'{}'::jsonb),auth.uid());
  return v_version;
end$function$;
CREATE OR REPLACE FUNCTION private.check_and_grant_achievements(p_user_id uuid)
 RETURNS TABLE(name text, description text, icon_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    achievement_rec RECORD;
    newly_achieved RECORD;
    unlocked_achievements JSONB := '[]'::jsonb;
BEGIN
 perform private.wave05_require_active_actor();
 if p_user_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if; 
    FOR achievement_rec IN
        SELECT a.*
        FROM public.achievements a
        LEFT JOIN public.user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = p_user_id
        WHERE ua.id IS NULL
    LOOP
        DECLARE
            is_achieved BOOLEAN := FALSE;
        BEGIN
            CASE achievement_rec.criteria->>'type'
                WHEN 'meal_count' THEN
                    SELECT count(*) >= (achievement_rec.criteria->>'count')::int INTO is_achieved FROM public.meals WHERE patient_id = p_user_id;
                WHEN 'log_streak' THEN
                    WITH dates AS (
                        SELECT DISTINCT meal_date 
                        FROM public.meals 
                        WHERE patient_id = p_user_id 
                        ORDER BY meal_date DESC
                    ),
                    streaks AS (
                        SELECT meal_date, meal_date - (ROW_NUMBER() OVER (ORDER BY meal_date) * INTERVAL '1 day') as grp 
                        FROM dates
                    )
                    SELECT COALESCE(MAX(count), 0) >= (achievement_rec.criteria->>'days')::int INTO is_achieved FROM (SELECT COUNT(*) as count FROM streaks GROUP BY grp) s;
                WHEN 'food_variety' THEN
                     SELECT count(DISTINCT food_id) >= (achievement_rec.criteria->>'count')::int INTO is_achieved FROM public.meal_items mi JOIN public.meals m ON mi.meal_id = m.id WHERE m.patient_id = p_user_id AND mi.food_id IS NOT NULL;
                WHEN 'weekday_log' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = (achievement_rec.criteria->>'day')::int) INTO is_achieved;
                WHEN 'weekend_log' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = 6) AND EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id AND EXTRACT(ISODOW FROM meal_date) = 7) INTO is_achieved;
                WHEN 'meal_completion' THEN
                    SELECT EXISTS(SELECT 1 FROM (SELECT meal_date, array_agg(DISTINCT meal_type) as types FROM public.meals WHERE patient_id = p_user_id GROUP BY meal_date) as daily_meals WHERE daily_meals.types @> ARRAY['Café da Manhã', 'Almoço', 'Jantar']) INTO is_achieved;
                WHEN 'days_on_platform' THEN
                    SELECT (now()::date - (SELECT created_at::date FROM auth.users WHERE id = p_user_id)) >= (achievement_rec.criteria->>'days')::int INTO is_achieved;
                WHEN 'used_search' THEN
                    SELECT EXISTS(SELECT 1 FROM public.meals WHERE patient_id = p_user_id) INTO is_achieved;
                ELSE
                    is_achieved := FALSE;
            END CASE;

            IF is_achieved THEN
                INSERT INTO public.user_achievements (user_id, achievement_id)
                VALUES (p_user_id, achievement_rec.id)
                ON CONFLICT (user_id, achievement_id) DO NOTHING
                RETURNING achievement_id INTO newly_achieved;

                IF newly_achieved IS NOT NULL THEN
                    unlocked_achievements := unlocked_achievements || jsonb_build_object(
                        'name', achievement_rec.name,
                        'description', achievement_rec.description,
                        'icon_name', achievement_rec.icon_name
                    );

                    INSERT INTO public.notifications (user_id, type, content)
                    VALUES (p_user_id, 'new_achievement', jsonb_build_object('name', achievement_rec.name, 'description', achievement_rec.description));
                END IF;
            END IF;
        END;
    END LOOP;

    RETURN QUERY SELECT (value->>'name')::text, (value->>'description')::text, (value->>'icon_name')::text FROM jsonb_array_elements(unlocked_achievements);
END;
$function$;
CREATE OR REPLACE FUNCTION private.clear_message_notifications_from_sender(p_sender_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 perform private.wave05_require_active_actor();

  delete from public.notifications n
  where n.user_id = auth.uid()
    and n.type = 'new_message'
    and coalesce(n.content->>'from_id', '') = p_sender_id::text;
end;
$function$;
CREATE OR REPLACE FUNCTION private.clinical_record_canonical_payload(p_record clinical_records, p_content jsonb, p_retrospective_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  v_amendment public.clinical_record_amendments%rowtype;
begin
 perform private.wave05_require_active_actor();

  v_base:=jsonb_build_object(
    'record_id',p_record.id,'patient_id',p_record.patient_id,
    'care_episode_id',p_record.care_episode_id,'nutritionist_id',p_record.nutritionist_id,
    'author_id',p_record.author_id,'student_id',p_record.student_id,
    'supervisor_id',p_record.supervisor_id,'record_type',p_record.record_type,
    'template_code',p_record.template_code,'template_version',p_record.template_version,
    'encounter_at',p_record.encounter_at,'visibility',p_record.visibility,
    'content',p_content,'retrospective_reason',p_retrospective_reason
  );
  if p_record.canonical_format_version=1 then return v_base; end if;
  if p_record.canonical_format_version<>2 then
    raise exception using errcode='23514',message='unsupported_canonical_format_version';
  end if;
  select * into v_amendment
  from public.clinical_record_amendments
  where replacement_record_id=p_record.id and amendment_type='correction';
  if not found then
    raise exception using errcode='23514',message='correction_amendment_required_for_format_2';
  end if;
  return v_base || jsonb_build_object(
    'canonical_format_version',2,
    'root_record_id',p_record.root_record_id,
    'replaces_record_id',p_record.replaces_record_id,
    'chain_version',p_record.chain_version,
    'amendment_id',v_amendment.id,
    'amendment_type',v_amendment.amendment_type,
    'amendment_reason',v_amendment.reason,
    'responsible_id',v_amendment.responsible_id
  );
end
$function$;
CREATE OR REPLACE FUNCTION private.clone_diet_template_to_patient(p_template_id uuid, p_patient_id uuid, p_nutritionist_id uuid, p_name text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_template public.diet_templates%rowtype;
  v_episode uuid;
  v_plan bigint;
  v_meal_ids uuid[];
BEGIN
 perform private.wave05_require_active_actor();

  IF auth.uid() IS NULL OR p_nutritionist_id <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='template_clone_actor_mismatch';
  END IF;
  SELECT * INTO v_template FROM public.diet_templates
  WHERE id=p_template_id AND user_id=auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='template_not_found_or_forbidden';
  END IF;
  SELECT array_agg(id ORDER BY order_index,id) INTO v_meal_ids
  FROM public.diet_template_meals WHERE template_id=p_template_id;
  IF cardinality(coalesce(v_meal_ids,'{}'::uuid[])) = 0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='template_empty';
  END IF;
  v_episode:=private.resolve_active_care_episode(p_patient_id);
  INSERT INTO public.meal_plans(
    patient_id,nutritionist_id,care_episode_id,name,description,
    is_active,is_draft,start_date,plan_mode,prescription_status,source_snapshot
  ) VALUES (
    p_patient_id,auth.uid(),v_episode,coalesce(nullif(btrim(p_name),''),v_template.name),
    v_template.description,true,true,current_date,'hybrid','draft',
    jsonb_build_object('template_id',v_template.id,'template_version',v_template.current_version,'deep_copy',true)
  ) RETURNING id INTO v_plan;
  PERFORM private.copy_diet_template_meals_to_plan(p_template_id,v_plan,v_meal_ids);
  RETURN v_plan;
END;
$function$;
CREATE OR REPLACE FUNCTION private.clone_meal_template_to_plan(p_meal_template_id uuid, p_meal_plan_id bigint, p_meal_type text, p_meal_time time without time zone DEFAULT NULL::time without time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
    v_template public.meal_templates%ROWTYPE;
    v_new_meal_id BIGINT;
    v_food public.meal_template_foods%ROWTYPE;
    v_new_food_id BIGINT;
    v_sub public.meal_template_food_substitutions%ROWTYPE;
BEGIN
 perform private.wave05_require_active_actor();
 if not exists(select 1 from public.meal_plans p where p.id=p_meal_plan_id and private.can_write_active_meal_plan(p.patient_id,p.nutritionist_id,p.care_episode_id)) then raise exception using errcode='42501',message='forbidden';end if;

    -- Check permissions
    SELECT * INTO v_template FROM public.meal_templates WHERE id = p_meal_template_id AND user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found or access denied';
    END IF;

    -- Create Meal in Plan
    INSERT INTO public.meal_plan_meals (
        meal_plan_id,
        name,
        meal_type,
        meal_time,
        order_index
    ) VALUES (
        p_meal_plan_id,
        v_template.name,
        p_meal_type::public.meal_type_enum,
        p_meal_time,
        (SELECT COALESCE(MAX(order_index) + 1, 0) FROM public.meal_plan_meals WHERE meal_plan_id = p_meal_plan_id)
    ) RETURNING id INTO v_new_meal_id;

    -- Clone Foods
    FOR v_food IN SELECT * FROM public.meal_template_foods WHERE meal_template_id = p_meal_template_id ORDER BY order_index ASC LOOP
        INSERT INTO public.meal_plan_foods (
            meal_plan_meal_id,
            food_id,
            quantity,
            unit,
            notes,
            order_index,
            calories, protein, carbs, fat -- Defaults as 0
        ) VALUES (
            v_new_meal_id,
            v_food.food_id,
            v_food.quantity,
            v_food.unit,
            v_food.observation,
            v_food.order_index,
            0, 0, 0, 0
        ) RETURNING id INTO v_new_food_id;

        -- Clone Substitutions
        FOR v_sub IN SELECT * FROM public.meal_template_food_substitutions WHERE template_food_id = v_food.id LOOP
            INSERT INTO public.meal_plan_food_substitutions (
                meal_plan_food_id,
                substitute_food_id,
                quantity,
                unit
            ) VALUES (
                v_new_food_id,
                v_sub.substitute_food_id,
                v_sub.quantity,
                v_sub.unit
            );
        END LOOP;
    END LOOP;

    RETURN v_new_meal_id;
END;
$function$;
CREATE OR REPLACE FUNCTION private.compose_document_payload(p_layout_code text, p_layout_version integer, p_identity_id uuid, p_patient jsonb, p_content jsonb, p_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_layout public.document_layout_versions%rowtype;
  v_identity public.professional_document_identities%rowtype;
begin
 perform private.wave05_require_active_actor();

  if jsonb_typeof(coalesce(p_patient,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_content,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023',message='document_composition_objects_required';
  end if;
  select * into v_layout from public.document_layout_versions
  where layout_code=p_layout_code and version=p_layout_version;
  if not found then raise exception using errcode='P0002',message='document_layout_version_not_found'; end if;
  select * into v_identity from public.professional_document_identities where id=p_identity_id;
  if not found then raise exception using errcode='P0002',message='document_identity_not_found'; end if;

  return jsonb_build_object(
    'schema_version',v_layout.payload_schema_version,
    'layout',jsonb_build_object(
      'code',v_layout.layout_code,'version',v_layout.version,
      'blocks',v_layout.blocks,'tokens',v_layout.tokens
    ),
    'branding',jsonb_build_object(
      'product','Nello','attribution',v_layout.nello_attribution,'removable',false
    ),
    'professional',jsonb_strip_nulls(jsonb_build_object(
      'identity_id',v_identity.id,'identity_version',v_identity.version,
      'name',v_identity.professional_name,'clinic_name',v_identity.clinic_name,
      'email',v_identity.professional_email,'phone',v_identity.professional_phone,
      'address_line',v_identity.address_line,'address_city',v_identity.address_city,
      'address_state',v_identity.address_state,'address_postal_code',v_identity.address_postal_code,
      'crn_region',v_identity.crn_region,'crn_number',v_identity.crn_number,
      'normalized_crn',v_identity.normalized_crn,
      'primary_color',v_identity.primary_color,'accent_color',v_identity.accent_color,
      'header_text',v_identity.header_text,'footer_text',v_identity.footer_text,
      'logo_storage_path',v_identity.logo_storage_path,
      'signature_storage_path',v_identity.signature_storage_path,
      'stamp_storage_path',v_identity.stamp_storage_path
    )),
    'patient',coalesce(p_patient,'{}'::jsonb),
    'content',coalesce(p_content,'{}'::jsonb),
    'metadata',coalesce(p_metadata,'{}'::jsonb)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.copy_diet_template_meals_to_plan(p_template_id uuid, p_plan_id bigint, p_meal_ids uuid[])
 RETURNS bigint[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_meal public.diet_template_meals%rowtype;
  v_food public.diet_template_foods%rowtype;
  v_sub public.diet_template_food_substitutions%rowtype;
  v_nutrition public.foods%rowtype;
  v_grams numeric;
  v_ratio numeric;
  v_plan_meal bigint;
  v_plan_food bigint;
  v_next_order integer;
  v_ids bigint[] := '{}';
  v_bad_food uuid;
BEGIN
 perform private.wave05_require_active_actor();

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.diet_templates
    WHERE id = p_template_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'template_not_found_or_forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(p_plan_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.meal_plans
    WHERE id = p_plan_id AND nutritionist_id = auth.uid()
      AND is_draft IS TRUE AND prescription_status = 'draft'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'draft_plan_not_found_or_forbidden';
  END IF;
  IF p_meal_ids IS NULL OR cardinality(p_meal_ids) = 0
     OR cardinality(p_meal_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_meal_ids)))
     OR EXISTS (
       SELECT 1 FROM unnest(p_meal_ids) AS requested(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.diet_template_meals m
         WHERE m.id = requested.id AND m.template_id = p_template_id
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_meal_selection_invalid';
  END IF;

  SELECT tf.food_id INTO v_bad_food
  FROM public.diet_template_meals m
  JOIN public.diet_template_foods tf ON tf.meal_id = m.id
  LEFT JOIN public.foods f ON f.id = tf.food_id
  LEFT JOIN public.household_measures hm ON hm.id::text = tf.unit
  WHERE m.id = ANY(p_meal_ids)
    AND (f.id IS NULL OR f.is_active IS NOT TRUE
      OR f.calories IS NULL OR f.protein IS NULL OR f.carbs IS NULL OR f.fat IS NULL
      OR tf.quantity IS NULL
      OR tf.quantity <= 0 OR tf.quantity = 'NaN'::numeric
      OR (tf.unit IS DISTINCT FROM 'gram'
        AND (hm.grams_equivalent IS NULL OR hm.grams_equivalent <= 0)
        AND (coalesce(f.calories,0) <> 0 OR coalesce(f.protein,0) <> 0
          OR coalesce(f.carbs,0) <> 0 OR coalesce(f.fat,0) <> 0)))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_food_unavailable', DETAIL = v_bad_food::text;
  END IF;

  SELECT s.substitute_food_id INTO v_bad_food
  FROM public.diet_template_meals m
  JOIN public.diet_template_foods tf ON tf.meal_id = m.id
  JOIN public.diet_template_food_substitutions s ON s.template_food_id = tf.id
  LEFT JOIN public.foods f ON f.id = s.substitute_food_id
  WHERE m.id = ANY(p_meal_ids) AND (f.id IS NULL OR f.is_active IS NOT TRUE)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_substitute_unavailable', DETAIL = v_bad_food::text;
  END IF;

  SELECT coalesce(max(order_index) + 1, 0) INTO v_next_order
  FROM public.meal_plan_meals WHERE meal_plan_id = p_plan_id;

  FOR v_meal IN
    SELECT m.* FROM public.diet_template_meals m
    WHERE m.id = ANY(p_meal_ids)
    ORDER BY array_position(p_meal_ids, m.id)
  LOOP
    INSERT INTO public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,order_index)
    VALUES(p_plan_id,v_meal.name,'other',v_meal.time,v_next_order)
    RETURNING id INTO v_plan_meal;
    v_ids := array_append(v_ids, v_plan_meal);
    v_next_order := v_next_order + 1;

    FOR v_food IN
      SELECT * FROM public.diet_template_foods
      WHERE meal_id = v_meal.id ORDER BY order_index,id
    LOOP
      SELECT * INTO v_nutrition FROM public.foods
      WHERE id = v_food.food_id AND is_active IS TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_food_unavailable', DETAIL = v_food.food_id::text;
      END IF;
      IF v_nutrition.calories IS NULL OR v_nutrition.protein IS NULL
        OR v_nutrition.carbs IS NULL OR v_nutrition.fat IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_food_unavailable', DETAIL = v_food.food_id::text;
      END IF;
      IF v_food.unit = 'gram' THEN
        v_grams := v_food.quantity;
      ELSE
        SELECT v_food.quantity * grams_equivalent INTO v_grams
        FROM public.household_measures WHERE id::text = v_food.unit;
      END IF;
      IF v_grams IS NULL AND (coalesce(v_nutrition.calories,0) <> 0
        OR coalesce(v_nutrition.protein,0) <> 0 OR coalesce(v_nutrition.carbs,0) <> 0
        OR coalesce(v_nutrition.fat,0) <> 0) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'template_measure_unavailable', DETAIL = v_food.id::text;
      END IF;
      v_ratio := coalesce(v_grams, 0) / 100;
      INSERT INTO public.meal_plan_foods(
        meal_plan_meal_id,food_id,quantity,unit,notes,order_index,
        calories,protein,carbs,fat,food_snapshot
      ) VALUES (
        v_plan_meal,v_food.food_id,v_food.quantity,v_food.unit,v_food.observation,v_food.order_index,
        coalesce(v_nutrition.calories,0)*v_ratio,
        coalesce(v_nutrition.protein,0)*v_ratio,
        coalesce(v_nutrition.carbs,0)*v_ratio,
        coalesce(v_nutrition.fat,0)*v_ratio,
        jsonb_strip_nulls(jsonb_build_object(
          'name',v_nutrition.name,'source',v_nutrition.source,'source_id',v_nutrition.source_id,
          'base_quantity_g',100,'calories',v_nutrition.calories,'protein',v_nutrition.protein,
          'carbs',v_nutrition.carbs,'fat',v_nutrition.fat
        ))
      ) RETURNING id INTO v_plan_food;

      FOR v_sub IN SELECT * FROM public.diet_template_food_substitutions
        WHERE template_food_id = v_food.id
      LOOP
        INSERT INTO public.meal_plan_food_substitutions(
          meal_plan_food_id,substitute_food_id,quantity,unit
        ) VALUES(v_plan_food,v_sub.substitute_food_id,v_sub.quantity,v_sub.unit);
      END LOOP;
    END LOOP;

    UPDATE public.meal_plan_meals m SET
      total_calories = coalesce((SELECT sum(calories) FROM public.meal_plan_foods WHERE meal_plan_meal_id=m.id),0),
      total_protein = coalesce((SELECT sum(protein) FROM public.meal_plan_foods WHERE meal_plan_meal_id=m.id),0),
      total_carbs = coalesce((SELECT sum(carbs) FROM public.meal_plan_foods WHERE meal_plan_meal_id=m.id),0),
      total_fat = coalesce((SELECT sum(fat) FROM public.meal_plan_foods WHERE meal_plan_meal_id=m.id),0)
    WHERE m.id = v_plan_meal;
  END LOOP;

  UPDATE public.meal_plans p SET
    daily_calories = coalesce((SELECT sum(total_calories) FROM public.meal_plan_meals WHERE meal_plan_id=p.id),0),
    daily_protein = coalesce((SELECT sum(total_protein) FROM public.meal_plan_meals WHERE meal_plan_id=p.id),0),
    daily_carbs = coalesce((SELECT sum(total_carbs) FROM public.meal_plan_meals WHERE meal_plan_id=p.id),0),
    daily_fat = coalesce((SELECT sum(total_fat) FROM public.meal_plan_meals WHERE meal_plan_id=p.id),0)
  WHERE p.id = p_plan_id;

  RETURN v_ids;
END;
$function$;
CREATE OR REPLACE FUNCTION private.create_appointment_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  appointment_record record;
begin
 perform private.wave05_require_active_actor();

  for appointment_record in
    select appointment.id, appointment.patient_id, appointment.appointment_time
    from public.appointments appointment
    join auth.users account on account.id = appointment.patient_id
    where appointment.status = 'scheduled'
      and appointment.reminder_sent_at is null
      and appointment.appointment_time between now() and now() + interval '48 hours'
    for update of appointment skip locked
  loop
    insert into public.notifications (user_id, type, content, is_read)
    values (
      appointment_record.patient_id,
      'appointment_reminder',
      jsonb_build_object('appointment_time', appointment_record.appointment_time),
      false
    );

    update public.appointments
    set reminder_sent_at = now()
    where id = appointment_record.id;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION private.create_notification(p_user_id uuid, p_type text DEFAULT 'info'::text, p_title text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_link_url text DEFAULT NULL::text, p_content jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
begin
 perform private.wave05_require_active_actor();

  if not exists (select 1 from auth.users account where account.id = p_user_id) then
    return null;
  end if;

  insert into public.notifications (
    user_id, type, title, message, link_url, content, is_read
  ) values (
    p_user_id,
    coalesce(nullif(trim(p_type), ''), 'info'),
    p_title,
    p_message,
    p_link_url,
    jsonb_strip_nulls(
      coalesce(p_content, '{}'::jsonb) ||
      jsonb_build_object('title', p_title, 'message', p_message, 'link_url', p_link_url)
    ),
    false
  ) returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.current_recent_authentication_evidence()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_claims jsonb;
  v_auth_time numeric;
  v_session_id text;
begin
 perform private.wave05_require_active_actor();

  begin
    v_claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
    v_auth_time:=(v_claims->>'auth_time')::numeric;
  exception when others then
    raise exception using errcode='28000',message='recent_reauthentication_required';
  end;
  v_session_id:=nullif(v_claims->>'session_id','');
  if v_auth_time is null or v_session_id is null
    or v_auth_time<extract(epoch from clock_timestamp()-interval '10 minutes')
    or v_auth_time>extract(epoch from clock_timestamp()+interval '1 minute') then
    raise exception using errcode='28000',message='recent_reauthentication_required';
  end if;
  return jsonb_build_object(
    'auth_time',to_timestamp(v_auth_time),
    'aal',coalesce(nullif(v_claims->>'aal',''),'unknown'),
    'amr',coalesce(v_claims->'amr','[]'::jsonb),
    'session_fingerprint',encode(
      extensions.digest(convert_to(v_session_id,'UTF8'),'sha256'),'hex'
    )
  );
end
$function$;
CREATE OR REPLACE FUNCTION private.delete_patient(patient_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 perform private.wave05_require_active_actor();

  PERFORM auth.admin_delete_user(patient_id);
END;
$function$;
CREATE OR REPLACE FUNCTION private.dispatch_due_checkins()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_schedule record;
  v_session_id uuid;
  v_fields jsonb;
  v_sent integer := 0;
  v_now timestamptz := now();
BEGIN
 perform private.wave05_require_active_actor();

  UPDATE public.checkin_sessions SET status='expired'
  WHERE status='pending' AND expires_at<=v_now;
  FOR v_schedule IN
    SELECT s.*,t.name,t.frequency,t.send_days,t.send_time
    FROM public.checkin_schedules s
    JOIN public.checkin_templates t ON t.id=s.template_id
    JOIN public.care_episodes ce ON ce.id=s.care_episode_id
    WHERE s.is_active IS TRUE AND t.is_active IS TRUE
      AND s.channel='in_app' AND s.next_send_at<=v_now
      AND ce.status='active' AND coalesce(ce.is_simulation,false)=false
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id=s.patient_id)
    ORDER BY s.next_send_at,s.id
    LIMIT 100 FOR UPDATE OF s SKIP LOCKED
  LOOP
    SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.order_index,f.id),'[]'::jsonb)
      INTO v_fields FROM public.checkin_fields f WHERE f.template_id=v_schedule.template_id;
    IF jsonb_array_length(v_fields)=0 THEN
      RAISE WARNING 'Check-in schedule % has no fields',v_schedule.id;
      CONTINUE;
    END IF;
    INSERT INTO public.checkin_sessions(
      schedule_id,patient_id,nutritionist_id,template_id,care_episode_id,
      scheduled_for,sent_at,expires_at,fields_snapshot
    ) VALUES (
      v_schedule.id,v_schedule.patient_id,v_schedule.nutritionist_id,
      v_schedule.template_id,v_schedule.care_episode_id,v_schedule.next_send_at,
      v_now,v_now+interval '48 hours',v_fields
    ) ON CONFLICT (schedule_id,scheduled_for) DO NOTHING RETURNING id INTO v_session_id;
    IF v_session_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,type,title,message,link_url,content)
      VALUES (v_schedule.patient_id,'checkin','Novo check-in disponível',
        'Responda seu check-in no app Nello.','/patient/checkin/'||v_session_id::text,
        jsonb_build_object('session_id',v_session_id));
      v_sent:=v_sent+1;
    END IF;
    UPDATE public.checkin_schedules SET last_sent_at=v_now,
      next_send_at=private.next_checkin_send_at(v_schedule.frequency,
        v_schedule.send_days,v_schedule.send_time,v_schedule.time_zone,v_now)
    WHERE id=v_schedule.id;
    v_session_id:=NULL;
  END LOOP;
  RETURN v_sent;
END;
$function$;
CREATE OR REPLACE FUNCTION private.document_authenticity_fingerprint()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_headers jsonb;
  v_source text;
begin
 perform private.wave05_require_active_actor();

  begin
    v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then
    v_headers:='{}'::jsonb;
  end;
  v_source:=concat_ws('|',
    coalesce(v_headers->>'cf-connecting-ip',v_headers->>'x-real-ip',split_part(coalesce(v_headers->>'x-forwarded-for','unknown'),',',1)),
    left(coalesce(v_headers->>'user-agent','unknown'),300)
  );
  return encode(extensions.digest(convert_to(v_source,'UTF8'),'sha256'),'hex');
end
$function$;
CREATE OR REPLACE FUNCTION private.empty_patient_removal_status(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_episode public.care_episodes%rowtype;
  v_episode_count integer;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    return jsonb_build_object('can_remove', false, 'reason', 'authentication_required');
  end if;

  if not exists (
    select 1 from public.user_profiles
    where id = v_actor and user_type = 'nutritionist'
  ) then
    return jsonb_build_object('can_remove', false, 'reason', 'nutritionist_required');
  end if;

  select * into v_episode
  from public.care_episodes
  where patient_id = p_patient_id
    and nutritionist_id = v_actor
    and status = 'active'
  order by started_at desc
  limit 1;

  if not found then
    return jsonb_build_object('can_remove', false, 'reason', 'active_relationship_not_found');
  end if;

  if not exists (
    select 1 from public.user_profiles
    where id = p_patient_id and user_type = 'patient'
  ) then
    return jsonb_build_object('can_remove', false, 'reason', 'patient_not_found');
  end if;

  select count(*) into v_episode_count
  from public.care_episodes
  where patient_id = p_patient_id;

  if v_episode_count <> 1 or exists (
    select 1 from public.archived_patient_links where patient_id = p_patient_id
  ) then
    return jsonb_build_object('can_remove', false, 'reason', 'care_history_exists');
  end if;

  if private.patient_has_meaningful_data(p_patient_id) then
    return jsonb_build_object('can_remove', false, 'reason', 'clinical_data_exists');
  end if;

  return jsonb_build_object(
    'can_remove', true,
    'reason', null,
    'care_episode_id', v_episode.id
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.end_care_episode(p_patient_id uuid, p_end_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_episode public.care_episodes%rowtype;
  v_recipient_id uuid;
begin
 perform private.wave05_require_active_actor();

  if v_actor_user_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));

  select * into v_episode
  from public.care_episodes
  where patient_id = p_patient_id and status = 'active'
  for update;

  if not found then
    raise exception 'NÃ£o existe atendimento ativo para encerrar.' using errcode = 'P0002';
  end if;

  if v_actor_user_id not in (v_episode.patient_id, v_episode.nutritionist_id) then
    raise exception 'Sem permissÃ£o para encerrar este atendimento.' using errcode = '42501';
  end if;

  update public.care_episodes
  set status = 'ended',
      ended_at = now(),
      ended_by = v_actor_user_id,
      end_reason = coalesce(nullif(trim(p_end_reason), ''), 'ended_by_participant'),
      updated_at = now()
  where id = v_episode.id
  returning * into v_episode;

  update public.nutritionist_patients
  set status = 'ended'
  where nutritionist_id = v_episode.nutritionist_id
    and patient_id = v_episode.patient_id
    and status = 'active';

  update public.user_profiles
  set nutritionist_id = null
  where id = v_episode.patient_id
    and nutritionist_id = v_episode.nutritionist_id;

  perform private.write_care_episode_activity('care_episode.ended', v_episode, v_actor_user_id, v_episode.end_reason);

  v_recipient_id := case
    when v_actor_user_id = v_episode.patient_id then v_episode.nutritionist_id
    else v_episode.patient_id
  end;

  perform private.notify_care_episode_participant(
    v_recipient_id,
    'care_episode_ended',
    'Acompanhamento encerrado',
    'O vÃ­nculo de acompanhamento foi encerrado. O histÃ³rico clÃ­nico permanece preservado.',
    v_episode.id
  );

  return jsonb_build_object('success', true, 'episode_id', v_episode.id);
end;
$function$;
CREATE OR REPLACE FUNCTION private.export_subject_rows(p_table regclass, p_subject_column name, p_subject_id uuid, p_redacted_keys text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows jsonb;
begin
 perform private.wave05_require_active_actor();

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(source_row) - $2), ''[]''::jsonb) from %s source_row where %I = $1',
    p_table,
    p_subject_column
  ) into v_rows using p_subject_id, p_redacted_keys;
  return v_rows;
end;
$function$;
CREATE OR REPLACE FUNCTION private.get_admin_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result json;
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION private.get_chat_recipient_profile(recipient_id uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, user_type text, is_active boolean, nutritionist_id uuid, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 perform private.wave05_require_active_actor();

 if not private.wave05_active_actor() or not (recipient_id=auth.uid() or private.wave05_chat_relationship(auth.uid(),recipient_id) or exists(select 1 from public.chats c where (c.from_id=auth.uid() and c.to_id=recipient_id) or (c.to_id=auth.uid() and c.from_id=recipient_id))) then raise exception using errcode='42501',message='forbidden';end if;

    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.user_type,
        up.is_active,
        up.nutritionist_id,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.id = recipient_id;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_comprehensive_activity_feed_optimized(p_nutritionist_id uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(activity_type text, activity_id text, patient_id uuid, patient_name text, activity_date timestamp with time zone, activity_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare q text; queries text[] := '{}'; begin
 perform private.wave05_require_active_actor();
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;  if p_limit is null or p_limit < 1 then p_limit := 30; end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_audit_log') then q := 'select ''meal''::text as activity_type, mal.id::text as activity_id, mal.patient_id::uuid as patient_id, p.name as patient_name, mal.created_at as activity_date, jsonb_build_object(''meal_type'', mal.meal_type, ''total_calories'', case when mal.details is null then null else nullif(mal.details->>''total_calories'', '''')::numeric end, ''action'', mal.action) as activity_data from public.meal_audit_log mal join patients p on p.id = mal.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'growth_records') then q := 'select ''anthropometry''::text as activity_type, gr.id::text as activity_id, gr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(gr.record_date::timestamptz, gr.created_at, now()) as activity_date, jsonb_build_object(''weight'', gr.weight, ''height'', gr.height) as activity_data from public.growth_records gr join patients p on p.id = gr.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'anamnesis_records') then q := 'select ''anamnesis''::text as activity_type, anr.id::text as activity_id, anr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(anr.date::timestamptz, anr.created_at, now()) as activity_date, jsonb_build_object(''status'', ''completed'') as activity_data from public.anamnesis_records anr join patients p on p.id = anr.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_plans') then q := 'select ''meal_plan''::text as activity_type, mp.id::text as activity_id, mp.patient_id::uuid as patient_id, p.name as patient_name, mp.created_at as activity_date, jsonb_build_object(''name'', mp.name) as activity_data from public.meal_plans mp join patients p on p.id = mp.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then q := 'select ''appointment''::text as activity_type, a.id::text as activity_id, a.patient_id::uuid as patient_id, p.name as patient_name, coalesce(a.start_time, a.appointment_time, now()) as activity_date, jsonb_build_object(''notes'', a.notes) as activity_data from public.appointments a join patients p on p.id = a.patient_id'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_achievements') then q := 'select ''achievement''::text as activity_type, ua.id::text as activity_id, ua.user_id::uuid as patient_id, p.name as patient_name, ua.achieved_at as activity_date, jsonb_build_object(''achievement_id'', ua.achievement_id) as activity_data from public.user_achievements ua join patients p on p.id = ua.user_id'; queries := array_append(queries, q); end if; if array_length(queries, 1) is null then return; end if; q := 'with patients as (select id, name from public.user_profiles where nutritionist_id = $1) select * from (' || array_to_string(queries, ' union all ') || ') feed order by activity_date desc nulls last limit $2'; return query execute q using p_nutritionist_id, p_limit; end; $function$;
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
        WHERE pr.patient_id = p.id
          AND CURRENT_DATE >= pr.start_date
          AND CURRENT_DATE <= pr.end_date
      );

    -- 2. Desses pacientes, conta quantos registraram PELO MENOS UMA refeição hoje
    SELECT COUNT(DISTINCT m.patient_id)
    INTO patients_registered_today
    FROM public.meals m
    JOIN public.user_profiles p ON m.patient_id = p.id
    WHERE p.nutritionist_id = p_nutritionist_id
      AND m.meal_date = CURRENT_DATE;

    -- 3. Calcula a porcentagem
    IF total_patients_with_plan > 0 THEN
        adherence_percentage := (patients_registered_today::NUMERIC / total_patients_with_plan::NUMERIC) * 100;
    ELSE
        adherence_percentage := 0; -- Evita divisão por zero
    END IF;

    RETURN COALESCE(adherence_percentage, 0);
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_financial_summary(start_date date, end_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    total_income NUMERIC;
    total_expense NUMERIC;
    total_pending NUMERIC;
    records_count INT;
BEGIN
 perform private.wave05_require_active_actor();

    -- Calcular Receitas (Pagas)
    SELECT COALESCE(SUM(amount), 0) INTO total_income
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND type = 'income'
    AND status = 'paid'
    AND date BETWEEN start_date AND end_date;

    -- Calcular Despesas (Pagas)
    SELECT COALESCE(SUM(amount), 0) INTO total_expense
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND type = 'expense'
    AND status = 'paid'
    AND date BETWEEN start_date AND end_date;

    -- Calcular Valores Pendentes (A Receber/Pagar no período)
    SELECT COALESCE(SUM(amount), 0) INTO total_pending
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND status = 'pending'
    AND date BETWEEN start_date AND end_date;

    -- Contagem de registros
    SELECT COUNT(*) INTO records_count
    FROM financial_records
    WHERE nutritionist_id = auth.uid()
    AND date BETWEEN start_date AND end_date;

    RETURN json_build_object(
        'income', total_income,
        'expense', total_expense,
        'balance', (total_income - total_expense),
        'pending', total_pending,
        'count', records_count
    );
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_meal_plan_with_foods_optimized(p_meal_plan_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result JSON;
BEGIN
 perform private.wave05_require_active_actor();

    SELECT json_build_object(
        'id', mp.id,
        'name', mp.name,
        'patient_id', mp.patient_id,
        'nutritionist_id', mp.nutritionist_id,
        'is_active', mp.is_active,
        'start_date', mp.start_date,
        'end_date', mp.end_date,
        'description', mp.description,
        'created_at', mp.created_at,
        'updated_at', mp.updated_at,
        'meals', COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', m.id,
                        'name', m.name,
                        'meal_type', m.meal_type,
                        'time', m.time,
                        'description', m.description,
                        'sequence_order', m.sequence_order,
                        'foods', COALESCE(
                            (
                                SELECT json_agg(
                                    json_build_object(
                                        'id', mpf.id,
                                        'food_id', mpf.food_id,
                                        'food_name', f.name,
                                        'food_category', f.category,
                                        'quantity', mpf.quantity,
                                        'measure_unit', mpf.measure_unit,
                                        'calories', mpf.calories,
                                        'protein', mpf.protein,
                                        'carbs', mpf.carbs,
                                        'fats', mpf.fats,
                                        'sequence_order', mpf.sequence_order
                                    )
                                    ORDER BY mpf.sequence_order
                                )
                                FROM meal_plan_foods mpf
                                LEFT JOIN foods f ON f.id = mpf.food_id
                                WHERE mpf.meal_plan_meal_id = m.id
                            ),
                            '[]'::json
                        )
                    )
                    ORDER BY m.sequence_order
                )
                FROM meal_plan_meals m
                WHERE m.meal_plan_id = mp.id
            ),
            '[]'::json
        )
    ) INTO v_result
    FROM meal_plans mp
    WHERE mp.id = p_meal_plan_id;

    RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_nutritionist_conversations(p_nutritionist_id uuid)
 RETURNS TABLE(recipient_id uuid, recipient_name text, recipient_avatar text, last_message_content text, last_message_at timestamp with time zone, unread_count bigint, is_active boolean, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 perform private.wave05_require_active_actor();

 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;

    RETURN QUERY
    WITH last_messages AS (
        SELECT DISTINCT ON (
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END
        )
            from_id,
            to_id,
            message,
            message_type,
            media_url,
            created_at,
            CASE WHEN from_id = p_nutritionist_id THEN to_id ELSE from_id END as other_user_id
        FROM public.chats
        WHERE from_id = p_nutritionist_id OR to_id = p_nutritionist_id
        ORDER BY other_user_id, created_at DESC
    ),
    unread_counts AS (
        SELECT 
            (content->>'from_id')::uuid as other_user_id, 
            count(*) as count
        FROM public.notifications
        WHERE user_id = p_nutritionist_id AND type = 'new_message' AND (is_read = false OR is_read IS NULL)
        GROUP BY (content->>'from_id')::uuid
    )
    SELECT 
        up.id as recipient_id,
        up.name as recipient_name,
        up.avatar_url as recipient_avatar,
        CASE 
            WHEN lm.message_type = 'audio' THEN '🎤 Áudio'
            WHEN lm.message_type = 'image' THEN '📷 Imagem'
            WHEN lm.message_type = 'file' THEN '📁 Arquivo'
            ELSE lm.message
        END as last_message_content,
        lm.created_at as last_message_at,
        COALESCE(uc.count, 0) as unread_count,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    JOIN last_messages lm ON up.id = lm.other_user_id
    LEFT JOIN unread_counts uc ON up.id = uc.other_user_id
    ORDER BY lm.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_nutritionist_detail(p_nutritionist_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_result JSON;
  v_nutritionist RECORD;
BEGIN
 perform private.wave05_require_active_actor();

  -- Fetch nutritionist profile
  SELECT 
    up.id,
    up.name,
    up.email,
    up.phone,
    up.bio,
    up.crn,
    up.specialties,
    up.education,
    up.avatar_url,
    up.is_active,
    up.is_admin,
    up.created_at,
    up.user_type,
    au.last_sign_in_at,
    (SELECT COUNT(*) FROM user_profiles WHERE nutritionist_id = up.id AND user_type = 'patient') as patients_count,
    (SELECT COUNT(*) FROM user_profiles WHERE nutritionist_id = up.id AND user_type = 'patient' AND created_at >= NOW() - INTERVAL '30 days') as new_patients_30d
  INTO v_nutritionist
  FROM user_profiles up
  LEFT JOIN auth.users au ON au.id = up.id
  WHERE up.id = p_nutritionist_id AND up.user_type = 'nutritionist';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Build result with patients list
  SELECT json_build_object(
    'id', v_nutritionist.id,
    'name', v_nutritionist.name,
    'email', v_nutritionist.email,
    'phone', v_nutritionist.phone,
    'bio', v_nutritionist.bio,
    'crn', v_nutritionist.crn,
    'specialties', v_nutritionist.specialties,
    'education', v_nutritionist.education,
    'avatar_url', v_nutritionist.avatar_url,
    'is_active', v_nutritionist.is_active,
    'is_admin', v_nutritionist.is_admin,
    'created_at', v_nutritionist.created_at,
    'last_sign_in_at', v_nutritionist.last_sign_in_at,
    'patients_count', v_nutritionist.patients_count,
    'new_patients_30d', v_nutritionist.new_patients_30d,
    'patients', (
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'name', p.name,
          'email', p.email,
          'avatar_url', p.avatar_url,
          'gender', p.gender,
          'goal', p.goal,
          'patient_category', p.patient_category,
          'created_at', p.created_at,
          'is_active', p.is_active,
          'last_sign_in_at', au2.last_sign_in_at
        )
        ORDER BY p.created_at DESC
      )
      FROM user_profiles p
      LEFT JOIN auth.users au2 ON au2.id = p.id
      WHERE p.nutritionist_id = v_nutritionist.id AND p.user_type = 'patient'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_nutritionists_list()
 RETURNS TABLE(id uuid, name text, email text, created_at timestamp with time zone, is_active boolean, patients_count bigint, last_activity timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 perform private.wave05_require_active_actor();

  -- Need to ensure only admins can run this
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT 
    n.id,
    n.name,
    n.email,
    n.created_at,
    n.is_active,
    (SELECT count(*) FROM user_profiles p WHERE p.nutritionist_id = n.id AND p.user_type = 'patient') as patients_count,
    (SELECT max(occurred_at) FROM activity_log a WHERE a.nutritionist_id = n.id) as last_activity
  FROM user_profiles n
  WHERE n.user_type = 'nutritionist'
  ORDER BY n.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_operational_health_summary(p_nutritionist_id uuid DEFAULT auth.uid(), p_window_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_since timestamptz;
  v_total int := 0;
  v_errors int := 0;
  v_error_rate numeric := 0;
  v_avg_latency numeric := 0;
  v_module_stats jsonb := '[]'::jsonb;
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION private.get_patients_for_new_chat(p_nutritionist_id uuid)
 RETURNS TABLE(id uuid, name text, avatar_url text, is_active boolean, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 perform private.wave05_require_active_actor();

 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;

    RETURN QUERY
    SELECT 
        up.id,
        up.name,
        up.avatar_url,
        up.is_active,
        up.last_seen_at
    FROM public.user_profiles up
    WHERE up.nutritionist_id = p_nutritionist_id AND private.wave05_chat_relationship(p_nutritionist_id,up.id)
    ORDER BY up.is_active DESC, up.name ASC;
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
        LEFT JOIN meals m ON m.patient_id = up.id
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
        INNER JOIN active_patients ap ON ap.patient_id = ar.patient_id
    ),
    patient_anthropometry AS (
        SELECT DISTINCT gr.patient_id
        FROM growth_records gr
        INNER JOIN active_patients ap ON ap.patient_id = gr.patient_id
    ),
    patient_meal_plans AS (
        SELECT DISTINCT mp.patient_id
        FROM meal_plans mp
        INNER JOIN active_patients ap ON ap.patient_id = mp.patient_id
        WHERE mp.is_active = true
    ),
    patient_prescriptions AS (
        SELECT DISTINCT pr.patient_id
        FROM prescriptions pr
        INNER JOIN active_patients ap ON ap.patient_id = pr.patient_id
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
CREATE OR REPLACE FUNCTION private.get_system_live_logs(limit_count integer DEFAULT 50)
 RETURNS TABLE(id text, type text, message text, user_name text, event_timestamp timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 perform private.wave05_require_active_actor();

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    -- Activity logs
    SELECT 
      a.id::text,
      'info' as type,
      a.event_name as message,
      COALESCE(u.name, 'Sistema') as user_name,
      a.occurred_at as event_timestamp
    FROM activity_log a
    LEFT JOIN user_profiles u ON u.id = a.actor_user_id

    UNION ALL

    -- Observability logs (errors/warnings)
    SELECT 
      o.id::text,
      CASE WHEN o.event_type = 'ERROR' THEN 'error' ELSE 'warning' END as type,
      COALESCE(o.error_message, o.operation) as message,
      COALESCE(u.name, 'Sistema') as user_name,
      o.created_at as event_timestamp
    FROM operational_observability_log o
    LEFT JOIN user_profiles u ON u.id = o.nutritionist_id
  ) combined_logs
  ORDER BY event_timestamp DESC
  LIMIT limit_count;
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_tcc_study_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_result jsonb;

  -- Platform overview
  v_total_nutritionists int;
  v_total_patients int;
  v_active_nutritionists_30d int;
  v_active_patients_30d int;
  v_new_users_7d int;
  v_new_users_30d int;

  -- Clinical: Goals
  v_total_goals int;
  v_active_goals int;
  v_completed_goals int;
  v_avg_progress numeric;
  v_avg_viability_score numeric;
  v_goal_type_dist jsonb;

  -- Clinical: Anamnesis
  v_total_anamnesis int;
  v_completed_anamnesis int;
  v_anamnesis_completion_rate numeric;
  v_avg_fields_per_record int;

  -- Clinical: Growth Records (Anthropometry)
  v_total_growth_records int;
  v_patients_with_records int;
  v_avg_records_per_patient numeric;
  v_records_last_30d int;
  v_patients_with_bmi jsonb;

  -- Clinical: Nutrition Diary
  v_total_meals int;
  v_meals_last_7d int;
  v_meals_last_30d int;
  v_avg_adherence_score numeric;
  v_active_diarists int;  -- patients who logged at least once in 30d

  -- Clinical: Energy Calculations (TMB)
  v_total_tmb_calcs int;
  v_protocol_distribution jsonb;

  -- Clinical: Appointments
  v_total_appointments int;
  v_completed_appointments int;
  v_cancelled_appointments int;
  v_no_show_appointments int;
  v_attendance_rate numeric;
  v_appointment_type_dist jsonb;

  -- Engagement: Chat
  v_total_chat_messages int;
  v_chat_messages_30d int;
  v_active_chat_pairs int;

  -- Engagement: Platform modules
  v_module_usage jsonb;
  v_module_error_rates jsonb;
  v_avg_latency_ms numeric;

  -- Engagement: Notifications
  v_total_notifications int;
  v_read_notifications int;
  v_notification_read_rate numeric;

  -- Engagement: Achievements
  v_total_achievements_earned int;
  v_patients_with_achievements int;

  -- Engagement: Meal Plans
  v_total_meal_plans int;
  v_patients_with_plan int;

  -- Weekly activity
  v_activity_by_day jsonb;

BEGIN
 perform private.wave05_require_active_actor();


  -- ── Platform Overview ────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_nutritionists
  FROM user_profiles WHERE user_type = 'nutritionist';

  SELECT COUNT(*) INTO v_total_patients
  FROM user_profiles WHERE user_type = 'patient';

  SELECT COUNT(DISTINCT nutritionist_id) INTO v_active_nutritionists_30d
  FROM operational_observability_log
  WHERE created_at >= NOW() - INTERVAL '30 days' AND nutritionist_id IS NOT NULL;

  SELECT COUNT(DISTINCT patient_id) INTO v_active_patients_30d
  FROM meals
  WHERE created_at >= NOW() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_new_users_7d
  FROM user_profiles WHERE created_at >= NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_new_users_30d
  FROM user_profiles WHERE created_at >= NOW() - INTERVAL '30 days';

  -- ── Clinical: Goals ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_goals FROM patient_goals;
  SELECT COUNT(*) INTO v_active_goals FROM patient_goals WHERE status = 'active';
  SELECT COUNT(*) INTO v_completed_goals FROM patient_goals WHERE status = 'completed';
  SELECT ROUND(AVG(progress_percentage)::numeric, 1) INTO v_avg_progress FROM patient_goals WHERE progress_percentage IS NOT NULL;
  SELECT ROUND(AVG(viability_score)::numeric, 2) INTO v_avg_viability_score FROM patient_goals WHERE viability_score IS NOT NULL;

  SELECT jsonb_object_agg(goal_type, cnt) INTO v_goal_type_dist
  FROM (
    SELECT goal_type, COUNT(*) AS cnt
    FROM patient_goals
    GROUP BY goal_type
  ) t;

  -- ── Clinical: Anamnesis ─────────────────────────────────────
  SELECT COUNT(*) INTO v_total_anamnesis FROM anamnesis_records;
  SELECT COUNT(*) INTO v_completed_anamnesis FROM anamnesis_records WHERE status IN ('validated', 'completed');
  v_anamnesis_completion_rate := CASE WHEN v_total_anamnesis > 0
    THEN ROUND((v_completed_anamnesis::numeric / v_total_anamnesis * 100), 1)
    ELSE 0 END;

  SELECT ROUND(AVG(field_cnt)::numeric, 0) INTO v_avg_fields_per_record
  FROM (
    SELECT CASE
      WHEN jsonb_typeof(content) = 'object' THEN (SELECT COUNT(*) FROM jsonb_object_keys(content))
      WHEN jsonb_typeof(content) = 'array' THEN jsonb_array_length(content)
      ELSE 0
    END AS field_cnt
    FROM anamnesis_records
  ) t;

  -- ── Clinical: Growth Records ────────────────────────────────
  SELECT COUNT(*) INTO v_total_growth_records FROM growth_records WHERE is_latest_revision = true;
  SELECT COUNT(DISTINCT patient_id) INTO v_patients_with_records FROM growth_records;
  SELECT ROUND(AVG(cnt)::numeric, 1) INTO v_avg_records_per_patient
  FROM (SELECT patient_id, COUNT(*) AS cnt FROM growth_records GROUP BY patient_id) t;
  SELECT COUNT(*) INTO v_records_last_30d FROM growth_records WHERE created_at >= NOW() - INTERVAL '30 days';

  -- BMI distribution: count patients with calculated BMI ranges from latest record
  SELECT jsonb_build_object(
    'underweight', COUNT(*) FILTER (WHERE bmi < 18.5),
    'normal',      COUNT(*) FILTER (WHERE bmi BETWEEN 18.5 AND 24.9),
    'overweight',  COUNT(*) FILTER (WHERE bmi BETWEEN 25.0 AND 29.9),
    'obese',       COUNT(*) FILTER (WHERE bmi >= 30)
  ) INTO v_patients_with_bmi
  FROM (
    SELECT patient_id,
      ROUND((weight / ((height/100) * (height/100)))::numeric, 1) AS bmi
    FROM growth_records
    WHERE is_latest_revision = true
      AND weight IS NOT NULL AND height IS NOT NULL AND height > 0
  ) t;

  -- ── Clinical: Nutrition Diary ────────────────────────────────
  SELECT COUNT(*) INTO v_total_meals FROM meals WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO v_meals_last_7d FROM meals WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '7 days';
  SELECT COUNT(*) INTO v_meals_last_30d FROM meals WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days';
  SELECT ROUND(AVG(adherence_score)::numeric, 1) INTO v_avg_adherence_score FROM meals WHERE adherence_score IS NOT NULL AND deleted_at IS NULL;
  SELECT COUNT(DISTINCT patient_id) INTO v_active_diarists FROM meals WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days';

  -- ── Clinical: Energy Calculations ────────────────────────────
  SELECT COUNT(*) INTO v_total_tmb_calcs FROM energy_expenditure_calculations;
  SELECT jsonb_object_agg(proto, cnt) INTO v_protocol_distribution
  FROM (
    SELECT COALESCE(protocol, 'unknown') AS proto, COUNT(*) AS cnt
    FROM energy_expenditure_calculations
    GROUP BY protocol
  ) t;

  -- ── Clinical: Appointments ───────────────────────────────────
  SELECT COUNT(*) INTO v_total_appointments FROM appointments;
  SELECT COUNT(*) INTO v_completed_appointments FROM appointments WHERE status = 'completed';
  SELECT COUNT(*) INTO v_cancelled_appointments FROM appointments WHERE status = 'cancelled';
  SELECT COUNT(*) INTO v_no_show_appointments FROM appointments WHERE status = 'no_show';
  v_attendance_rate := CASE WHEN v_total_appointments > 0
    THEN ROUND((v_completed_appointments::numeric / v_total_appointments * 100), 1)
    ELSE 0 END;

  SELECT jsonb_object_agg(appointment_type, cnt) INTO v_appointment_type_dist
  FROM (
    SELECT COALESCE(appointment_type, 'unknown') AS appointment_type, COUNT(*) AS cnt
    FROM appointments
    GROUP BY appointment_type
  ) t;

  -- ── Engagement: Chat ─────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_chat_messages FROM chats;
  SELECT COUNT(*) INTO v_chat_messages_30d FROM chats WHERE created_at >= NOW() - INTERVAL '30 days';
  SELECT COUNT(*) INTO v_active_chat_pairs
  FROM (
    SELECT DISTINCT LEAST(from_id, to_id), GREATEST(from_id, to_id)
    FROM chats WHERE created_at >= NOW() - INTERVAL '30 days'
  ) t;

  -- ── Engagement: Module Usage ─────────────────────────────────
  SELECT jsonb_object_agg(module, cnt) INTO v_module_usage
  FROM (
    SELECT module, COUNT(*) AS cnt
    FROM operational_observability_log
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY module
    ORDER BY cnt DESC
  ) t;

  SELECT jsonb_object_agg(module, error_rate) INTO v_module_error_rates
  FROM (
    SELECT module,
      ROUND(100.0 * COUNT(*) FILTER (WHERE event_type = 'error') / NULLIF(COUNT(*), 0), 1) AS error_rate
    FROM operational_observability_log
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY module
  ) t;

  SELECT ROUND(AVG(latency_ms)::numeric, 0) INTO v_avg_latency_ms
  FROM operational_observability_log WHERE created_at >= NOW() - INTERVAL '30 days';

  -- ── Engagement: Notifications ─────────────────────────────────
  SELECT COUNT(*) INTO v_total_notifications FROM notifications;
  SELECT COUNT(*) INTO v_read_notifications FROM notifications WHERE is_read = true;
  v_notification_read_rate := CASE WHEN v_total_notifications > 0
    THEN ROUND((v_read_notifications::numeric / v_total_notifications * 100), 1)
    ELSE 0 END;

  -- ── Engagement: Achievements ─────────────────────────────────
  SELECT COUNT(*) INTO v_total_achievements_earned FROM user_achievements;
  SELECT COUNT(DISTINCT user_id) INTO v_patients_with_achievements FROM user_achievements;

  -- ── Engagement: Meal Plans ────────────────────────────────────
  SELECT COUNT(*) INTO v_total_meal_plans FROM meal_plans WHERE is_template = false;
  SELECT COUNT(DISTINCT patient_id) INTO v_patients_with_plan FROM meal_plans WHERE is_template = false AND patient_id IS NOT NULL;

  -- ── Weekly activity (last 7 days) ─────────────────────────────
  SELECT jsonb_agg(row_to_json(t) ORDER BY day_date) INTO v_activity_by_day
  FROM (
    SELECT
      TO_CHAR(d, 'YYYY-MM-DD') AS day_date,
      TO_CHAR(d, 'Dy') AS day_name,
      COUNT(DISTINCT ol.id) AS platform_events,
      COUNT(DISTINCT m.id) AS meal_logs,
      COUNT(DISTINCT gr.id) AS growth_records
    FROM generate_series(NOW() - INTERVAL '6 days', NOW(), INTERVAL '1 day') AS d
    LEFT JOIN operational_observability_log ol ON ol.created_at::date = d::date
    LEFT JOIN meals m ON m.created_at::date = d::date AND m.deleted_at IS NULL
    LEFT JOIN growth_records gr ON gr.created_at::date = d::date
    GROUP BY d
  ) t;

  -- ── Build final JSON ─────────────────────────────────────────
  v_result := jsonb_build_object(
    -- Platform
    'platform', jsonb_build_object(
      'total_nutritionists', v_total_nutritionists,
      'total_patients', v_total_patients,
      'active_nutritionists_30d', v_active_nutritionists_30d,
      'active_patients_30d', v_active_patients_30d,
      'new_users_7d', v_new_users_7d,
      'new_users_30d', v_new_users_30d
    ),
    -- Goals
    'goals', jsonb_build_object(
      'total', v_total_goals,
      'active', v_active_goals,
      'completed', v_completed_goals,
      'avg_progress_pct', v_avg_progress,
      'avg_viability_score', v_avg_viability_score,
      'type_distribution', v_goal_type_dist
    ),
    -- Anamnesis
    'anamnesis', jsonb_build_object(
      'total_records', v_total_anamnesis,
      'completed', v_completed_anamnesis,
      'completion_rate_pct', v_anamnesis_completion_rate,
      'avg_fields_per_record', v_avg_fields_per_record
    ),
    -- Anthropometry
    'anthropometry', jsonb_build_object(
      'total_records', v_total_growth_records,
      'patients_with_records', v_patients_with_records,
      'avg_records_per_patient', v_avg_records_per_patient,
      'records_last_30d', v_records_last_30d,
      'bmi_distribution', v_patients_with_bmi
    ),
    -- Nutrition diary
    'nutrition_diary', jsonb_build_object(
      'total_meals', v_total_meals,
      'meals_last_7d', v_meals_last_7d,
      'meals_last_30d', v_meals_last_30d,
      'avg_adherence_score', v_avg_adherence_score,
      'active_diarists_30d', v_active_diarists
    ),
    -- Energy calculations
    'energy_calcs', jsonb_build_object(
      'total', v_total_tmb_calcs,
      'protocol_distribution', v_protocol_distribution
    ),
    -- Appointments
    'appointments', jsonb_build_object(
      'total', v_total_appointments,
      'completed', v_completed_appointments,
      'cancelled', v_cancelled_appointments,
      'no_show', v_no_show_appointments,
      'attendance_rate_pct', v_attendance_rate,
      'type_distribution', v_appointment_type_dist
    ),
    -- Chat
    'chat', jsonb_build_object(
      'total_messages', v_total_chat_messages,
      'messages_last_30d', v_chat_messages_30d,
      'active_chat_pairs_30d', v_active_chat_pairs
    ),
    -- Modules
    'modules', jsonb_build_object(
      'usage_30d', v_module_usage,
      'error_rates_pct_30d', v_module_error_rates,
      'avg_latency_ms_30d', v_avg_latency_ms
    ),
    -- Notifications
    'notifications', jsonb_build_object(
      'total', v_total_notifications,
      'read', v_read_notifications,
      'read_rate_pct', v_notification_read_rate
    ),
    -- Gamification
    'gamification', jsonb_build_object(
      'total_achievements_earned', v_total_achievements_earned,
      'patients_with_achievements', v_patients_with_achievements
    ),
    -- Meal plans
    'meal_plans', jsonb_build_object(
      'total', v_total_meal_plans,
      'patients_with_plan', v_patients_with_plan
    ),
    -- Activity timeline
    'activity_by_day', v_activity_by_day
  );

  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION private.increment_checkin_streak(p_patient_id uuid, p_nutritionist_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  last_checkin TIMESTAMPTZ;
  current_streak INTEGER;
  best_streak INTEGER;
BEGIN
 perform private.wave05_require_active_actor();

 if auth.uid() is null or auth.uid() not in (p_patient_id,p_nutritionist_id) or not private.wave05_chat_relationship(p_patient_id,p_nutritionist_id) then raise exception using errcode='42501',message='forbidden';end if;

  SELECT last_checkin_at, checkin_streak_current, checkin_streak_best
  INTO last_checkin, current_streak, best_streak
  FROM nutritionist_patients
  WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  
  IF last_checkin IS NULL OR last_checkin < now() - INTERVAL '2 days' THEN
    UPDATE nutritionist_patients SET
      checkin_streak_current = 1,
      last_checkin_at = now()
    WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  ELSE
    UPDATE nutritionist_patients SET
      checkin_streak_current = COALESCE(current_streak, 0) + 1,
      checkin_streak_best = GREATEST(COALESCE(best_streak, 0), COALESCE(current_streak, 0) + 1),
      last_checkin_at = now()
    WHERE patient_id = p_patient_id AND nutritionist_id = p_nutritionist_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION private.interact_notification(p_notification_id uuid, p_delete_if_message boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text;
  v_owner uuid;
begin
 perform private.wave05_require_active_actor();

  select n.type, n.user_id
    into v_type, v_owner
  from public.notifications n
  where n.id = p_notification_id;

  if v_owner is null then
    return;
  end if;

  if auth.uid() is distinct from v_owner then
    raise exception 'Sem permissão para interagir com esta notificação.';
  end if;

  if p_delete_if_message and v_type = 'new_message' then
    delete from public.notifications
    where id = p_notification_id
      and user_id = auth.uid();
  else
    update public.notifications
    set is_read = true
    where id = p_notification_id
      and user_id = auth.uid();
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION private.lock_and_can_write_active_care_episode(p_episode_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then return false; end if;

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_episode_id
  for share;
  if not found or v_episode.status<>'active' then return false; end if;

  if v_episode.is_simulation then
    return v_episode.nutritionist_id=v_actor;
  end if;

  if v_episode.student_id is null and v_episode.supervisor_id is null then
    if v_episode.nutritionist_id<>v_actor then return false; end if;
    perform 1
    from public.professional_verifications pv
    where pv.user_id=v_episode.nutritionist_id
      and pv.professional_role='nutritionist'
      and pv.status='approved'
      and pv.valid_until>now()
    for share of pv;
    return found;
  end if;

  if v_actor not in (v_episode.student_id,v_episode.supervisor_id) then return false; end if;

  perform 1
  from public.student_supervisions s
  join public.professional_verifications student_pv on student_pv.user_id=s.student_id
  join public.professional_verifications supervisor_pv on supervisor_pv.user_id=s.supervisor_id
  where s.student_id=v_episode.student_id
    and s.supervisor_id=v_episode.supervisor_id
    and s.status='active'
    and student_pv.professional_role='student'
    and student_pv.status='approved'
    and student_pv.valid_until>now()
    and supervisor_pv.professional_role='nutritionist'
    and supervisor_pv.status='approved'
    and supervisor_pv.valid_until>now()
  for share of s,student_pv,supervisor_pv;
  return found;
end
$function$;
CREATE OR REPLACE FUNCTION private.log_activity_event(p_event_name text, p_event_version integer DEFAULT 1, p_source_module text DEFAULT NULL::text, p_patient_id uuid DEFAULT NULL::uuid, p_nutritionist_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
 perform private.wave05_require_active_actor();

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
CREATE OR REPLACE FUNCTION private.log_bug_report(p_error_type character varying DEFAULT 'Error'::character varying, p_error_message text DEFAULT NULL::text, p_stack_trace text DEFAULT NULL::text, p_route text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_user_email text DEFAULT NULL::text, p_user_name text DEFAULT NULL::text, p_user_type character varying DEFAULT NULL::character varying, p_user_agent text DEFAULT NULL::text, p_console_log jsonb DEFAULT '[]'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_component_stack text DEFAULT NULL::text, p_source_file text DEFAULT NULL::text, p_line_number integer DEFAULT NULL::integer, p_column_number integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_id uuid;
    v_severity varchar(20);
begin
 perform private.wave05_require_active_actor();

    if p_error_type in ('TypeError', 'ReferenceError', 'SyntaxError', 'RangeError') then
        v_severity := 'critical';
    elsif p_error_message ilike '%warning%' or p_error_message ilike '%deprecated%' then
        v_severity := 'warning';
    else
        v_severity := 'error';
    end if;

    insert into public.bug_reports (
        error_type,
        error_message,
        stack_trace,
        route,
        user_id,
        user_email,
        user_name,
        user_type,
        user_agent,
        console_log,
        metadata,
        component_stack,
        source_file,
        line_number,
        column_number,
        severity,
        bug_type
    ) values (
        p_error_type,
        p_error_message,
        p_stack_trace,
        p_route,
        p_user_id,
        p_user_email,
        p_user_name,
        p_user_type,
        p_user_agent,
        p_console_log,
        p_metadata,
        p_component_stack,
        p_source_file,
        p_line_number,
        p_column_number,
        v_severity,
        case
            when p_source_file like '%/api/%' or p_source_file like '%supabase%' then 'api'
            else 'frontend'
        end
    )
    returning id into v_id;

    return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.log_meal_action(p_patient_id uuid, p_meal_id bigint, p_action text, p_meal_type text DEFAULT NULL::text, p_meal_date date DEFAULT NULL::date, p_meal_time time without time zone DEFAULT NULL::time without time zone, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_log_id BIGINT;
BEGIN
 perform private.wave05_require_active_actor();
 if auth.uid() is not null and (p_patient_id is distinct from auth.uid() or exists(select 1 from public.meals m where m.id=p_meal_id and m.patient_id is distinct from p_patient_id)) then raise exception using errcode='42501',message='forbidden';end if;

    INSERT INTO meal_audit_log (
        patient_id,
        meal_id,
        action,
        meal_type,
        meal_date,
        meal_time,
        details
    ) VALUES (
        p_patient_id,
        p_meal_id,
        p_action,
        p_meal_type,
        p_meal_date,
        p_meal_time,
        p_details
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$function$;
CREATE OR REPLACE FUNCTION private.log_meal_action_secure(p_meal_id text, p_action text, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_patient_id uuid;
  v_has_meal_nutritionist boolean;
  v_has_audit_nutritionist boolean;
  v_nutritionist_id uuid;
begin
 perform private.wave05_require_active_actor();

  -- buscar patient_id de forma resiliente (id pode ser uuid ou bigint)
  select m.patient_id
    into v_patient_id
  from public.meals m
  where m.id::text = p_meal_id
  limit 1;

  if v_patient_id is null then
    raise exception 'meal not found';
  end if;

  -- verificar se existe coluna nutritionist_id em meals
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meals'
      and column_name = 'nutritionist_id'
  ) into v_has_meal_nutritionist;

  if v_has_meal_nutritionist then
    execute format('select nutritionist_id from public.meals where id::text = %L', p_meal_id)
      into v_nutritionist_id;
  else
    -- derivar nutritionist_id pelo patient_id (via user_profiles)
    select p.nutritionist_id into v_nutritionist_id
    from public.user_profiles p
    where p.id = v_patient_id
    limit 1;
  end if;

  if not (v_patient_id = auth.uid() or v_nutritionist_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- verificar se audit_log possui nutritionist_id
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'meal_audit_log'
      and column_name = 'nutritionist_id'
  ) into v_has_audit_nutritionist;

  if v_has_audit_nutritionist then
    execute format(
      'insert into public.meal_audit_log (meal_id, patient_id, nutritionist_id, action, details, created_at)
       values (%L, %L, %L, %L, %L, now())',
      p_meal_id,
      v_patient_id::text,
      v_nutritionist_id::text,
      p_action,
      p_details::text
    );
  else
    execute format(
      'insert into public.meal_audit_log (meal_id, patient_id, action, details, created_at)
       values (%L, %L, %L, %L, now())',
      p_meal_id,
      v_patient_id::text,
      p_action,
      p_details::text
    );
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION private.log_operational_event(p_module text, p_operation text, p_event_type text DEFAULT 'success'::text, p_latency_ms integer DEFAULT 0, p_nutritionist_id uuid DEFAULT NULL::uuid, p_patient_id uuid DEFAULT NULL::uuid, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_event_id bigint;
begin
 perform private.wave05_require_active_actor();
 if auth.uid() is not null and ((p_nutritionist_id is not null and p_nutritionist_id<>auth.uid()) or (p_patient_id is not null and p_patient_id<>auth.uid() and not private.wave05_can_edit_profile(p_patient_id))) then raise exception using errcode='42501',message='forbidden';end if;

  if p_module is null or trim(p_module) = '' then p_module := 'system'; end if;
  if p_operation is null or trim(p_operation) = '' then p_operation := 'unknown_operation'; end if;
  if p_event_type not in ('success', 'error') then p_event_type := 'error'; end if;
  insert into public.operational_observability_log (nutritionist_id, patient_id, module, operation, event_type, latency_ms, error_message, metadata)
  values (p_nutritionist_id, p_patient_id, p_module, p_operation, p_event_type, greatest(coalesce(p_latency_ms, 0), 0), p_error_message, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_event_id;
  return v_event_id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.notify_care_episode_participant(p_user_id uuid, p_type text, p_title text, p_message text, p_episode_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not exists (select 1 from auth.users where id = p_user_id) then
    return;
  end if;

  insert into public.notifications (user_id, type, title, message, content)
  values (
    p_user_id,
    p_type,
    p_title,
    p_message,
    jsonb_build_object('care_episode_id', p_episode_id)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.patient_has_meaningful_data(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_column record;
  v_found boolean;
begin
 perform private.wave05_require_active_actor();

  -- Any current or future base table carrying patient/user-owned data blocks
  -- removal. Only relationship/bootstrap/audit rows are intentionally ignored.
  for v_column in
    select n.nspname as schema_name, c.relname as table_name, a.attname as column_name
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and a.attname in ('patient_id', 'user_id')
      and c.relname not in (
        'activity_log',
        'archived_patient_links',
        'bug_reports',
        'care_episodes',
        'notifications',
        'nutritionist_patients',
        'operational_observability_log',
        'patient_module_sync_flags',
        'patient_profile_events',
        'patient_reminder_preferences',
        'professional_verifications',
        'reminder_delivery_log'
      )
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_column.schema_name,
      v_column.table_name,
      v_column.column_name
    ) using p_patient_id into v_found;

    if v_found then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;
CREATE OR REPLACE FUNCTION private.process_patient_reminders(p_patient_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_patient_id uuid := coalesce(p_patient_id, auth.uid());
  v_now timestamptz := now();
  v_today date;
  v_now_time time;
  v_timezone text;
  v_prefs record;
  v_daily_due boolean := false;
  v_measurement_due boolean := false;
  v_has_meal_today boolean := false;
  v_last_measurement_date date;
  v_notification_id bigint;
  v_daily_sent integer := 0;
  v_measurement_sent integer := 0;
begin
 perform private.wave05_require_active_actor();

  if v_actor_id is null or v_patient_id is null or v_patient_id <> v_actor_id then
    raise exception using errcode = '42501', message = 'patient_reminder_forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('patient-reminders:' || v_patient_id::text, 0));

  insert into public.patient_reminder_preferences (patient_id)
  values (v_patient_id)
  on conflict (patient_id) do nothing;

  select * into v_prefs
  from public.patient_reminder_preferences
  where patient_id = v_patient_id;

  if not found then
    return jsonb_build_object('processed', false, 'reason', 'missing_preferences');
  end if;

  v_timezone := coalesce(nullif(v_prefs.timezone, ''), 'America/Sao_Paulo');
  begin
    v_today := (v_now at time zone v_timezone)::date;
    v_now_time := (v_now at time zone v_timezone)::time;
  exception when invalid_parameter_value then
    v_timezone := 'America/Sao_Paulo';
    v_today := (v_now at time zone v_timezone)::date;
    v_now_time := (v_now at time zone v_timezone)::time;
  end;

  select exists (
    select 1 from public.meals m
    where m.patient_id = v_patient_id
      and m.meal_date = v_today
      and m.deleted_at is null
  ) into v_has_meal_today;

  select max(gr.record_date) into v_last_measurement_date
  from public.growth_records gr
  where gr.patient_id = v_patient_id;

  if coalesce(v_prefs.channel_in_app, true) then
    v_daily_due := coalesce(v_prefs.daily_log_enabled, true)
      and v_now_time >= coalesce(v_prefs.daily_log_time, '20:00'::time)
      and not v_has_meal_today;
    v_measurement_due := coalesce(v_prefs.measurement_enabled, true)
      and v_now_time >= coalesce(v_prefs.measurement_time, '09:00'::time)
      and (v_last_measurement_date is null or v_last_measurement_date <= v_today - 7);
  end if;

  if v_daily_due and not exists (
    select 1 from public.reminder_delivery_log r
    where r.patient_id = v_patient_id
      and r.reminder_type = 'daily_log_reminder'
      and r.delivery_channel = 'in_app'
      and r.reminder_date = v_today
  ) then
    insert into public.notifications(user_id, type, content, is_read)
    values (v_patient_id, 'daily_log_reminder', jsonb_build_object(
      'title', 'Lembrete DiÃ¡rio',
      'message', 'NÃ£o se esqueÃ§a de registrar suas refeiÃ§Ãµes hoje!',
      'source_module', 'reminder_engine'
    ), false)
    returning id into v_notification_id;

    insert into public.reminder_delivery_log(
      patient_id, reminder_type, delivery_channel, reminder_date,
      reminder_time, status, notification_id
    ) values (
      v_patient_id, 'daily_log_reminder', 'in_app', v_today,
      coalesce(v_prefs.daily_log_time, '20:00'::time), 'sent', v_notification_id
    );
    v_daily_sent := 1;
  end if;

  if v_measurement_due and not exists (
    select 1 from public.reminder_delivery_log r
    where r.patient_id = v_patient_id
      and r.reminder_type = 'measurement_reminder'
      and r.delivery_channel = 'in_app'
      and r.reminder_date = v_today
  ) then
    insert into public.notifications(user_id, type, content, is_read)
    values (v_patient_id, 'measurement_reminder', jsonb_build_object(
      'title', 'Atualizar Medidas',
      'message', 'Atualize suas medidas para manter seu plano calibrado.',
      'source_module', 'reminder_engine'
    ), false)
    returning id into v_notification_id;

    insert into public.reminder_delivery_log(
      patient_id, reminder_type, delivery_channel, reminder_date,
      reminder_time, status, notification_id
    ) values (
      v_patient_id, 'measurement_reminder', 'in_app', v_today,
      coalesce(v_prefs.measurement_time, '09:00'::time), 'sent', v_notification_id
    );
    v_measurement_sent := 1;
  end if;

  return jsonb_build_object(
    'processed', true,
    'patient_id', v_patient_id,
    'daily_sent', v_daily_sent,
    'measurement_sent', v_measurement_sent,
    'timezone', v_timezone,
    'local_date', v_today,
    'timestamp', v_now
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.promote_draft_to_active(p_draft_id bigint, p_patient_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if p_patient_id is null then raise exception using errcode='42501',message='plan_activation_forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext(p_patient_id::text));
  perform private.assert_plan_ready_to_activate(p_draft_id,p_patient_id);
  update public.meal_plans set is_active=false
  where patient_id=p_patient_id and is_active=true and id<>p_draft_id;
  update public.meal_plans set is_draft=false,is_active=true,updated_at=now()
  where id=p_draft_id and patient_id=p_patient_id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.redeem_invite_code(input_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_nutritionist_id uuid;
  v_target public.user_profiles%rowtype;
  v_current public.user_profiles%rowtype;
  v_fk record;
  v_has_related boolean;
begin
 perform private.wave05_require_active_actor();

  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
  end if;
  if input_code is null or length(btrim(input_code)) not between 1 and 128 then
    return jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
  end if;

  select id into v_nutritionist_id
  from public.user_profiles
  where lower(invite_code) = lower(btrim(input_code)) and user_type = 'nutritionist';
  if v_nutritionist_id is not null then
    insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
    values (v_nutritionist_id, v_user_id, 'pending')
    on conflict (nutritionist_id, patient_id) do update set status = 'pending'
    where public.nutritionist_patients.status is null;
    update public.user_profiles set nutritionist_id = v_nutritionist_id
    where id = v_user_id and nutritionist_id is null;
    return jsonb_build_object('success', true, 'type', 'link_pending',
      'message', 'Solicitação de vínculo enviada. Aguarde a aprovação do seu nutricionista.');
  end if;

  select * into v_target from public.user_profiles
  where lower(patient_invite_code) = lower(btrim(input_code)) and user_type = 'patient'
  for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
  end if;
  if v_target.id = v_user_id then
    return jsonb_build_object('success', false, 'message', 'Você já é o dono deste perfil');
  end if;
  -- The code may only claim a profile that has not yet been authenticated.
  if exists (select 1 from auth.users where id = v_target.id) then
    return jsonb_build_object('success', false, 'code', 'profile_already_claimed',
      'message', 'Este perfil já possui acesso. Procure suporte para recuperar a conta.');
  end if;

  select * into v_current from public.user_profiles where id = v_user_id for update;
  if not found or v_current.user_type <> 'patient' or v_current.nutritionist_id is not null then
    return jsonb_build_object('success', false, 'code', 'current_profile_not_claimable',
      'message', 'Esta conta já possui um vínculo. Procure suporte para unir os perfis.');
  end if;
  if not exists (select 1 from public.nutritionist_patients
                 where patient_id = v_target.id and nutritionist_id = v_target.nutritionist_id) then
    return jsonb_build_object('success', false, 'code', 'offline_profile_without_link',
      'message', 'O perfil do convite precisa ser conferido pelo nutricionista.');
  end if;

  -- Avoid a silent merge into an account that already contains clinical data.
  for v_fk in
    select distinct ns.nspname as schema_name, rel.relname as table_name,
      att.attname as column_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class rel on rel.oid = c.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
    join pg_catalog.pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.user_profiles'::pg_catalog.regclass
      and pg_catalog.array_length(c.conkey, 1) = 1
  loop
    execute pg_catalog.format('select exists(select 1 from %I.%I where %I = $1)',
      v_fk.schema_name, v_fk.table_name, v_fk.column_name)
      into v_has_related using v_user_id;
    if v_has_related then
      return jsonb_build_object('success', false, 'code', 'current_profile_has_data',
        'message', 'Esta conta já contém dados. Procure suporte para unir os perfis.');
    end if;
  end loop;

  begin
    -- Both profiles exist here, so NO ACTION and CASCADE FKs can be moved
    -- without a broken reference. An exception rolls back the entire merge.
    for v_fk in
      select distinct ns.nspname as schema_name, rel.relname as table_name,
        att.attname as column_name
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class rel on rel.oid = c.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
      join pg_catalog.pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'public.user_profiles'::pg_catalog.regclass
        and pg_catalog.array_length(c.conkey, 1) = 1
    loop
      execute pg_catalog.format('update %I.%I set %I = $1 where %I = $2',
        v_fk.schema_name, v_fk.table_name, v_fk.column_name, v_fk.column_name)
        using v_user_id, v_target.id;
    end loop;

    delete from public.user_profiles where id = v_target.id;
    update public.user_profiles set
      name = v_target.name, user_type = 'patient', crn = v_target.crn,
      birth_date = v_target.birth_date, gender = v_target.gender,
      height = v_target.height, weight = v_target.weight, goal = v_target.goal,
      nutritionist_id = v_target.nutritionist_id, created_at = v_target.created_at,
      patient_category = v_target.patient_category, fiscal_data = v_target.fiscal_data,
      preferences = v_target.preferences, avatar_url = v_target.avatar_url,
      phone = v_target.phone, address = v_target.address,
      specialties = v_target.specialties, education = v_target.education,
      bio = v_target.bio, is_active = v_target.is_active, cpf = v_target.cpf,
      occupation = v_target.occupation, civil_status = v_target.civil_status,
      email = coalesce(v_current.email, v_target.email),
      observations = v_target.observations,
      clinic_settings = v_target.clinic_settings, slug = v_target.slug,
      needs_password_reset = v_target.needs_password_reset,
      ethnicity = v_target.ethnicity, clinical_flags = v_target.clinical_flags,
      is_simulation = v_target.is_simulation,
      simulation_owner_id = v_target.simulation_owner_id,
      patient_invite_code = null
    where id = v_user_id;
    update public.nutritionist_patients set status = 'active'
    where patient_id = v_user_id and nutritionist_id = v_target.nutritionist_id;
    if not found then
      raise exception using errcode = '23514', message = 'offline_link_not_preserved';
    end if;
    return jsonb_build_object('success', true, 'type', 'profile_claimed',
      'message', 'Cadastro vinculado ao perfil clínico com sucesso');
  exception when others then
    return jsonb_build_object('success', false, 'code', 'profile_claim_failed',
      'message', 'Não foi possível vincular o perfil. Procure suporte para concluir com segurança.');
  end;
end;
$function$;
CREATE OR REPLACE FUNCTION private.reject_patient_link(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_nutri_id uuid;
BEGIN
 perform private.wave05_require_active_actor();

    v_nutri_id := auth.uid();
    
    -- Remove the link request
    DELETE FROM public.nutritionist_patients 
    WHERE nutritionist_id = v_nutri_id AND patient_id = p_patient_id;

    IF FOUND THEN
        -- Optional: Clear nutritionist_id from patient's profile if they were linked to this nutri
        UPDATE public.user_profiles 
        SET nutritionist_id = NULL 
        WHERE id = p_patient_id AND nutritionist_id = v_nutri_id;

        RETURN jsonb_build_object('success', true, 'message', 'Solicitação recusada e removida');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
    END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION private.require_verification_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION private.resolve_active_care_episode(p_patient_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  select e.id into strict v_id from public.care_episodes e
  where e.patient_id=p_patient_id and e.status='active';
  if not private.can_write_active_care_episode(v_id) then
    raise exception using errcode='42501',message='active_episode_write_forbidden';
  end if;
  return v_id;
exception when no_data_found then
  raise exception using errcode='42501',message='active_episode_write_forbidden';
end $function$;
CREATE OR REPLACE FUNCTION private.seed_nello_protocol_examples(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_parent uuid; v_meal uuid; v_food uuid; BEGIN
 perform private.wave05_require_active_actor();

IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id=p_user AND user_type='nutritionist') THEN RETURN; END IF;
IF NOT EXISTS (SELECT 1 FROM public.checkin_templates WHERE nutritionist_id=p_user AND name='Nello | Acompanhamento semanal de hábitos') THEN
INSERT INTO public.checkin_templates (nutritionist_id,name,description,frequency,send_time,send_days,channel,is_active,metadata) VALUES (p_user,'Nello | Acompanhamento semanal de hábitos','Exemplo editável para conversa sobre rotina e barreiras; respostas não representam diagnóstico ou adesão clínica automática.','weekly','09:00',ARRAY[1],'in_app',true,'{"nello_example":true}'::jsonb) RETURNING id INTO v_parent;
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Como foi a regularidade das refeições nesta semana? (1 a 10)','scale_1_10','[]'::jsonb,0,NULL,true,0);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Conseguiu incluir frutas ou hortaliças na maioria dos dias?','yes_no','[]'::jsonb,0,NULL,true,1);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Quantos dias preparou ou comeu refeições feitas em casa?','number','[]'::jsonb,0,'dias',true,2);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'O que facilitou sua alimentação nesta semana?','text','[]'::jsonb,0,NULL,false,3);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Qual foi a maior dificuldade?','multiple_choice','["Tempo","Custo","Acesso","Preferências","Sintomas","Outra"]'::jsonb,0,NULL,false,4);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Gostaria de conversar sobre algum sintoma ou reação a alimento?','text','[]'::jsonb,0,NULL,false,5);
END IF;
IF NOT EXISTS (SELECT 1 FROM public.checkin_templates WHERE nutritionist_id=p_user AND name='Nello | Revisão breve de sintomas e plano') THEN
INSERT INTO public.checkin_templates (nutritionist_id,name,description,frequency,send_time,send_days,channel,is_active,metadata) VALUES (p_user,'Nello | Revisão breve de sintomas e plano','Exemplo editável de acompanhamento; sintomas persistentes exigem avaliação profissional.','weekly','09:00',ARRAY[1],'in_app',true,'{"nello_example":true}'::jsonb) RETURNING id INTO v_parent;
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Como avalia seu bem-estar geral hoje? (1 a 10)','scale_1_10','[]'::jsonb,0,NULL,true,0);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Houve mudança de medicamento ou suplemento desde o último contato?','yes_no','[]'::jsonb,0,NULL,true,1);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Notou dificuldade para mastigar, engolir ou sintomas digestivos?','yes_no','[]'::jsonb,0,NULL,true,2);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Descreva mudanças ou sintomas que deseja relatar','text','[]'::jsonb,0,NULL,false,3);
INSERT INTO public.checkin_fields (template_id,label,field_type,options,score_weight,unit,is_required,order_index) VALUES (v_parent,'Qual ajuste no plano seria mais útil discutir?','text','[]'::jsonb,0,NULL,false,4);
END IF;
IF (SELECT count(*) FROM public.reference_foods WHERE source='TACO' AND is_active=true AND source_id IN ('TACO-003','TACO-550','TACO-403','TACO-182','TACO-007','TACO-480','TACO-226','TACO-064','TACO-110','TACO-078','TACO-157','TACO-222','TACO-088','TACO-441')) = 14 THEN
IF NOT EXISTS (SELECT 1 FROM public.diet_templates WHERE user_id=p_user AND name='Nello | Dia alimentar brasileiro - exemplo') THEN
INSERT INTO public.diet_templates (user_id,name,description,tags) VALUES (p_user,'Nello | Dia alimentar brasileiro - exemplo','Modelo didático editável com alimentos do banco TACO. Quantidades ilustrativas, sem meta calórica universal. Avalie paciente, alergias, VET e prescrição antes de publicar.',ARRAY['Nello','Exemplo','Alimentos in natura']) RETURNING id INTO v_parent;
INSERT INTO public.diet_template_meals (template_id,name,time,order_index) VALUES (v_parent,'Café da manhã','07:30',0) RETURNING id INTO v_meal;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-226' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,120,'gram',0);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-007' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,30,'gram',1);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-480' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,50,'gram',2);
INSERT INTO public.diet_template_meals (template_id,name,time,order_index) VALUES (v_parent,'Almoço','12:30',1) RETURNING id INTO v_meal;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-003' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,100,'gram',0);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-550' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,90,'gram',1);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-403' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,100,'gram',2);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-110' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,60,'gram',3);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-078' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,30,'gram',4);
INSERT INTO public.diet_template_meals (template_id,name,time,order_index) VALUES (v_parent,'Lanche','16:00',2) RETURNING id INTO v_meal;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-182' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,80,'gram',0);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-441' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,170,'gram',1);
INSERT INTO public.diet_template_meals (template_id,name,time,order_index) VALUES (v_parent,'Jantar','19:30',3) RETURNING id INTO v_meal;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-088' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,130,'gram',0);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-480' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,100,'gram',1);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-157' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,80,'gram',2);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-064' AND is_active=true;
INSERT INTO public.diet_template_foods (meal_id,food_id,quantity,unit,order_index) VALUES (v_meal,v_food,80,'gram',3);
END IF;
IF NOT EXISTS (SELECT 1 FROM public.meal_templates WHERE user_id=p_user AND name='Nello | Arroz, feijão, frango e salada') THEN
INSERT INTO public.meal_templates (user_id,name,description,tags) VALUES (p_user,'Nello | Arroz, feijão, frango e salada','Exemplo editável de refeição brasileira. Ajuste porções e composição para cada paciente.',ARRAY['Nello','Exemplo']) RETURNING id INTO v_parent;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-003' AND is_active=true;
INSERT INTO public.meal_template_foods (meal_template_id,food_id,quantity,unit,order_index) VALUES (v_parent,v_food,100,'gram',0);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-550' AND is_active=true;
INSERT INTO public.meal_template_foods (meal_template_id,food_id,quantity,unit,order_index) VALUES (v_parent,v_food,90,'gram',1);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-403' AND is_active=true;
INSERT INTO public.meal_template_foods (meal_template_id,food_id,quantity,unit,order_index) VALUES (v_parent,v_food,100,'gram',2);
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-157' AND is_active=true;
INSERT INTO public.meal_template_foods (meal_template_id,food_id,quantity,unit,order_index) VALUES (v_parent,v_food,80,'gram',3);
END IF;
IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE user_id=p_user AND name='Nello | Salada de feijão com frango' AND is_deleted=false) THEN
INSERT INTO public.recipes (user_id,name,description,preparation_method,yield_quantity,yield_unit) VALUES (p_user,'Nello | Salada de feijão com frango','Exemplo de preparação culinária. Verifique alergias, textura, porção e necessidades individuais.','Cozinhe o feijão e o frango, deixe amornar e misture com tomate e alface higienizados. Sirva em duas porções.',2,'porção') RETURNING id INTO v_parent;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-550' AND is_active=true;
INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,180,'gram');
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-403' AND is_active=true;
INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,160,'gram');
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-157' AND is_active=true;
INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,100,'gram');
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-078' AND is_active=true;
INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,40,'gram');
UPDATE public.recipes r SET (base_calories,base_protein,base_carbs,base_fat) = (SELECT round(sum(i.quantity * coalesce((i.food_snapshot->>'calories')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'protein')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'carbs')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'fat')::numeric,0) / 100),2) FROM public.recipe_ingredients i WHERE i.recipe_id=v_parent) WHERE r.id=v_parent;
END IF;
IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE user_id=p_user AND name='Nello | Creme de abóbora e cenoura' AND is_deleted=false) THEN
INSERT INTO public.recipes (user_id,name,description,preparation_method,yield_quantity,yield_unit) VALUES (p_user,'Nello | Creme de abóbora e cenoura','Exemplo de preparação. Ajuste consistência, temperos, porção e composição nutricional na avaliação individual.','Cozinhe abóbora e cenoura em água, bata até obter creme e aqueça novamente. Sirva em duas porções.',2,'porção') RETURNING id INTO v_parent;
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-064' AND is_active=true;
INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,250,'gram');
SELECT id INTO v_food FROM public.reference_foods WHERE source='TACO' AND source_id='TACO-110' AND is_active=true;
INSERT INTO public.recipe_ingredients (recipe_id,food_id,quantity,unit) VALUES (v_parent,v_food,120,'gram');
UPDATE public.recipes r SET (base_calories,base_protein,base_carbs,base_fat) = (SELECT round(sum(i.quantity * coalesce((i.food_snapshot->>'calories')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'protein')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'carbs')::numeric,0) / 100),2),round(sum(i.quantity * coalesce((i.food_snapshot->>'fat')::numeric,0) / 100),2) FROM public.recipe_ingredients i WHERE i.recipe_id=v_parent) WHERE r.id=v_parent;
END IF;
END IF; END; $function$;
CREATE OR REPLACE FUNCTION private.set_active_meal_plan(p_plan_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_patient uuid;
begin
 perform private.wave05_require_active_actor();

  select patient_id into v_patient from public.meal_plans where id=p_plan_id;
  if v_patient is null then raise exception using errcode='42501',message='plan_activation_forbidden'; end if;
  perform pg_advisory_xact_lock(hashtext(v_patient::text));
  perform private.assert_plan_ready_to_activate(p_plan_id,v_patient);
  update public.meal_plans set is_active=false
  where patient_id=v_patient and is_active=true and id<>p_plan_id;
  update public.meal_plans set is_active=true where id=p_plan_id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.soft_delete_meal(p_meal_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 perform private.wave05_require_active_actor();
 if auth.uid() is not null and not exists(select 1 from public.meals m where m.id=p_meal_id and m.patient_id=auth.uid()) then raise exception using errcode='42501',message='forbidden';end if;

    UPDATE meals
    SET deleted_at = NOW()
    WHERE id = p_meal_id
    AND deleted_at IS NULL;

    RETURN FOUND;
END;
$function$;
CREATE OR REPLACE FUNCTION private.start_care_episode(p_patient_id uuid, p_start_reason text DEFAULT 'care_started'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nutritionist_id uuid := auth.uid();
  v_existing public.care_episodes%rowtype;
  v_episode public.care_episodes%rowtype;
  v_user_type text;
begin
 perform private.wave05_require_active_actor();

  if v_nutritionist_id is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  select profile.user_type into v_user_type
  from public.user_profiles profile
  where profile.id = v_nutritionist_id;

  if v_user_type <> 'nutritionist' then
    raise exception 'Apenas nutricionistas podem iniciar um atendimento.' using errcode = '42501';
  end if;

  perform 1
  from public.user_profiles profile
  where profile.id = p_patient_id and profile.user_type = 'patient';
  if not found then
    raise exception 'Paciente nÃ£o encontrado.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));

  select episode.* into v_existing
  from public.care_episodes episode
  where episode.patient_id = p_patient_id and episode.status = 'active'
  for update;

  if found then
    if v_existing.nutritionist_id = v_nutritionist_id then
      return jsonb_build_object('success', true, 'episode_id', v_existing.id, 'already_active', true);
    end if;

    raise exception 'O paciente possui atendimento ativo com outro nutricionista; ele deve encerrar o vÃ­nculo atual antes de iniciar outro.'
      using errcode = '23505';
  end if;

  -- The active-link trigger owns compatibility episode creation. Selecting
  -- its result avoids the previous double insert; the fallback repairs an
  -- old active link that predates the trigger.
  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (v_nutritionist_id, p_patient_id, 'active')
  on conflict (nutritionist_id, patient_id) do update
    set status = 'active';

  select episode.* into v_episode
  from public.care_episodes episode
  where episode.patient_id = p_patient_id
    and episode.nutritionist_id = v_nutritionist_id
    and episode.status = 'active'
  for update;

  if not found then
    insert into public.care_episodes (
      patient_id, nutritionist_id, status, start_reason, started_by
    ) values (
      p_patient_id,
      v_nutritionist_id,
      'active',
      coalesce(nullif(trim(p_start_reason), ''), 'care_started'),
      v_nutritionist_id
    ) returning * into v_episode;
  else
    update public.care_episodes
    set start_reason = coalesce(nullif(trim(p_start_reason), ''), start_reason),
        started_by = coalesce(started_by, v_nutritionist_id),
        updated_at = now()
    where id = v_episode.id
    returning * into v_episode;
  end if;

  update public.user_profiles
  set nutritionist_id = v_nutritionist_id,
      is_active = true
  where id = p_patient_id;

  perform private.write_care_episode_activity(
    'care_episode.started', v_episode, v_nutritionist_id, v_episode.start_reason
  );
  perform private.notify_care_episode_participant(
    p_patient_id,
    'care_episode_started',
    'Novo acompanhamento iniciado',
    'Seu acompanhamento nutricional foi iniciado.',
    v_episode.id
  );

  return jsonb_build_object(
    'success', true,
    'episode_id', v_episode.id,
    'already_active', false
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.transition_appointment_status(p_appointment_id uuid, p_next_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_appt record;
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_next text := p_next_status;
begin
 perform private.wave05_require_active_actor();

  if p_appointment_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  end if;

  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_actor');
  end if;

  if v_actor <> v_appt.nutritionist_id and (v_appt.patient_id is null or v_actor <> v_appt.patient_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if v_next = 'cancelled' then
    v_next := 'canceled';
  end if;

  if v_next = v_appt.status::text or (v_next = 'canceled' and v_appt.status::text = 'cancelled') then
    return jsonb_build_object('ok', true, 'appointment_id', p_appointment_id, 'status', v_appt.status, 'no_change', true);
  end if;

  -- Validações de transição
  if v_appt.status::text = 'scheduled' and v_next not in ('confirmed', 'canceled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', v_next);
  end if;
  if v_appt.status::text = 'confirmed' and v_next not in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition', 'from', v_appt.status, 'to', v_next);
  end if;
  if v_appt.status::text in ('completed', 'canceled', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'terminal_status_locked', 'from', v_appt.status, 'to', v_next);
  end if;

  -- Update do status
  update public.appointments
  set status = v_next
  where id = p_appointment_id;

  select to_jsonb(a.*) into v_result
  from public.appointments a
  where a.id = p_appointment_id;

  return jsonb_build_object('ok', true, 'appointment', v_result);
end;
$function$;
CREATE OR REPLACE FUNCTION private.upsert_full_meal_plan(p_plan_id bigint, p_plan_data jsonb, p_meals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan public.meal_plans%rowtype;v_result jsonb;v_version integer;v_reason text;
begin
 perform private.wave05_require_active_actor();

  if auth.uid()is null then raise exception using errcode='28000',message='authentication_required';end if;
  if jsonb_typeof(coalesce(p_plan_data,'{}'::jsonb))<>'object'or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_meal_plan_payload';end if;
  select*into v_plan from public.meal_plans where id=p_plan_id for update;
  if not found or not private.can_write_active_meal_plan(v_plan.patient_id,v_plan.nutritionist_id,v_plan.care_episode_id)or v_plan.prescription_status in('archived','invalidated')then raise exception using errcode='42501',message='meal_plan_write_forbidden';end if;
  if not coalesce((p_plan_data->>'is_draft')::boolean,false) and (jsonb_array_length(coalesce(p_meals,'[]'))=0 or exists(select 1 from jsonb_array_elements(p_meals)m where jsonb_array_length(coalesce(m->'foods','[]'))=0))then raise exception using errcode='22023',message='finalized_meal_plan_requires_foods';end if;
  v_reason:=coalesce(nullif(btrim(p_plan_data->>'change_reason'),''),'EdiÃ§Ã£o confirmada pelo nutricionista');
  if not exists(select 1 from public.meal_plan_versions where meal_plan_id=p_plan_id)then
    perform private.capture_meal_plan_version(p_plan_id,'VersÃ£o inicial antes da primeira ediÃ§Ã£o',jsonb_build_object('origin','server_baseline'));
  end if;
  v_result:=private.write_full_meal_plan_storage(p_plan_id,p_plan_data,p_meals);
  update public.meal_plans set
    active_days=case when jsonb_typeof(p_plan_data->'active_days')='array'then p_plan_data->'active_days'else active_days end,
    plan_mode=case when p_plan_data->>'plan_mode'in('quantitative','qualitative','hybrid')then p_plan_data->>'plan_mode'else plan_mode end,
    prescription_status=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then'draft'else'finalized'end,
    confirmed_by=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then null else auth.uid()end,
    confirmed_at=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then null else now()end,
    source_snapshot=jsonb_build_object('protocol_code','meal_plan.cfn_record','protocol_version',1,'professional_confirmed',not coalesce((p_plan_data->>'is_draft')::boolean,false),'captured_at',now()),
    updated_at=now()
  where id=p_plan_id;
  v_version:=private.capture_meal_plan_version(p_plan_id,v_reason,jsonb_build_object('origin','upsert_full_meal_plan','atomic',true));
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('version_number',v_version);
end$function$;
CREATE OR REPLACE FUNCTION private.version_document_identity_asset(p_professional_id uuid, p_expected_identity_id uuid, p_asset_type text, p_storage_path text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current public.professional_document_identities%rowtype;
  v_saved public.professional_document_identities%rowtype;
begin
 perform private.wave05_require_active_actor();

  select * into v_current
  from public.professional_document_identities
  where professional_id = p_professional_id and status = 'active'
  for update;

  if not found or v_current.id is distinct from p_expected_identity_id then
    raise exception using errcode = '40001', message = 'identity_changed_since_upload_intent';
  end if;

  update public.professional_document_identities
  set status = 'archived', archived_at = now(), archive_reason = p_reason
  where id = v_current.id;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_current.id, p_professional_id, p_professional_id, 'superseded', p_reason,
    jsonb_build_object('version', v_current.version, 'superseded_by_version', v_current.version + 1)
  );

  insert into public.professional_document_identities(
    professional_id, verification_id, version, status,
    professional_name, clinic_name, professional_email, professional_phone,
    address_line, address_city, address_state, address_postal_code,
    primary_color, accent_color, header_text, footer_text,
    crn_region, crn_number, normalized_crn,
    logo_storage_path, signature_storage_path, stamp_storage_path, created_by
  ) values (
    v_current.professional_id, v_current.verification_id, v_current.version + 1, 'active',
    v_current.professional_name, v_current.clinic_name, v_current.professional_email, v_current.professional_phone,
    v_current.address_line, v_current.address_city, v_current.address_state, v_current.address_postal_code,
    v_current.primary_color, v_current.accent_color, v_current.header_text, v_current.footer_text,
    v_current.crn_region, v_current.crn_number, v_current.normalized_crn,
    case when p_asset_type = 'logo' then p_storage_path else v_current.logo_storage_path end,
    case when p_asset_type = 'visual_signature' then p_storage_path else v_current.signature_storage_path end,
    case when p_asset_type = 'stamp' then p_storage_path else v_current.stamp_storage_path end,
    p_professional_id
  ) returning * into v_saved;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_saved.id, p_professional_id, p_professional_id, 'created', p_reason,
    jsonb_build_object(
      'version', v_saved.version,
      'previous_version', v_current.version,
      'asset_type', p_asset_type
    )
  );

  return v_saved.id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.write_care_episode_activity(p_event_name text, p_episode care_episodes, p_actor_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform private.wave05_require_active_actor();

  insert into public.activity_log (
    event_name,
    patient_id,
    nutritionist_id,
    actor_user_id,
    source_module,
    payload
  ) values (
    p_event_name,
    p_episode.patient_id,
    p_episode.nutritionist_id,
    p_actor_user_id,
    'care_episodes',
    jsonb_strip_nulls(jsonb_build_object(
      'care_episode_id', p_episode.id,
      'status', p_episode.status,
      'reason', p_reason
    ))
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.write_full_meal_plan_storage(p_plan_id bigint, p_plan_data jsonb, p_meals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meal JSONB;
  v_food JSONB;
  v_sub JSONB;
  v_new_meal_id BIGINT;
  v_new_food_id BIGINT;
BEGIN
 perform private.wave05_require_active_actor();

  -- 1. Update the meal plan itself
  UPDATE meal_plans
  SET 
    name = (p_plan_data->>'name'),
    description = (p_plan_data->>'description'),
    start_date = (p_plan_data->>'start_date')::DATE,
    end_date = (p_plan_data->>'end_date')::DATE,
    is_active = COALESCE((p_plan_data->>'is_active')::BOOLEAN, true),
    is_draft = COALESCE((p_plan_data->>'is_draft')::BOOLEAN, false),
    daily_calories = COALESCE((p_plan_data->>'daily_calories')::NUMERIC, 0),
    daily_protein = COALESCE((p_plan_data->>'daily_protein')::NUMERIC, 0),
    daily_carbs = COALESCE((p_plan_data->>'daily_carbs')::NUMERIC, 0),
    daily_fat = COALESCE((p_plan_data->>'daily_fat')::NUMERIC, 0),
    updated_at = NOW()
  WHERE id = p_plan_id;

  -- 2. Clear old structure (Deletes cascade to foods and subs if constraints permit, 
  --    but we'll be explicit to ensure performance and correctness)
  -- Assuming ON DELETE CASCADE is set. If not, we should delete children first.
  DELETE FROM meal_plan_food_substitutions 
  WHERE meal_plan_food_id IN (
    SELECT id FROM meal_plan_foods 
    WHERE meal_plan_meal_id IN (
      SELECT id FROM meal_plan_meals WHERE meal_plan_id = p_plan_id
    )
  );
  
  DELETE FROM meal_plan_foods 
  WHERE meal_plan_meal_id IN (
    SELECT id FROM meal_plan_meals WHERE meal_plan_id = p_plan_id
  );

  DELETE FROM meal_plan_meals WHERE meal_plan_id = p_plan_id;

  -- 3. Insert new structure
  FOR v_meal IN SELECT * FROM jsonb_array_elements(p_meals)
  LOOP
    INSERT INTO meal_plan_meals (
      meal_plan_id, name, meal_type, meal_time, order_index, notes,
      total_calories, total_protein, total_carbs, total_fat
    ) VALUES (
      p_plan_id,
      v_meal->>'name',
      COALESCE((v_meal->>'meal_type'), 'other')::meal_type_enum,
      private.normalize_meal_time(v_meal->>'meal_time'),
      COALESCE((v_meal->>'order_index')::INTEGER, 0),
      v_meal->>'notes',
      COALESCE((v_meal->>'total_calories')::NUMERIC, 0),
      COALESCE((v_meal->>'total_protein')::NUMERIC, 0),
      COALESCE((v_meal->>'total_carbs')::NUMERIC, 0),
      COALESCE((v_meal->>'total_fat')::NUMERIC, 0)
    ) RETURNING id INTO v_new_meal_id;

    -- Insert foods for this meal
    IF v_meal ? 'foods' THEN
      FOR v_food IN SELECT * FROM jsonb_array_elements(v_meal->'foods')
      LOOP
        INSERT INTO meal_plan_foods (
          meal_plan_meal_id, food_id, quantity, unit, 
          calories, protein, carbs, fat, notes, order_index,
          patient_description
        ) VALUES (
          v_new_meal_id,
          (v_food->>'food_id')::UUID,
          COALESCE((v_food->>'quantity')::NUMERIC, 0),
          v_food->>'unit',
          COALESCE((v_food->>'calories')::NUMERIC, 0),
          COALESCE((v_food->>'protein')::NUMERIC, 0),
          COALESCE((v_food->>'carbs')::NUMERIC, 0),
          COALESCE((v_food->>'fat')::NUMERIC, 0),
          v_food->>'notes',
          COALESCE((v_food->>'order_index')::INTEGER, 0),
          v_food->>'patient_description'
        ) RETURNING id INTO v_new_food_id;

        -- Insert substitutes
        IF v_food ? 'substitutes' THEN
          FOR v_sub IN SELECT * FROM jsonb_array_elements(v_food->'substitutes')
          LOOP
            INSERT INTO meal_plan_food_substitutions (
              meal_plan_food_id, substitute_food_id, notes
            ) VALUES (
              v_new_food_id,
              (v_sub->>'id')::UUID,
              v_sub->>'notes'
            );
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'plan_id', p_plan_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.abandon_clinical_record_correction(p_amendment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_amendment public.clinical_record_amendments%rowtype;
  v_updated public.clinical_record_amendments%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='abandonment_reason_length_invalid'; end if;
  select * into v_amendment from public.clinical_record_amendments where id=p_amendment_id;
  if not found then raise exception using errcode='P0002',message='amendment_not_found'; end if;
  perform r.id from public.clinical_records r
  where r.id in (v_amendment.root_record_id,v_amendment.target_record_id,v_amendment.replacement_record_id)
  order by r.id for update;
  select * into v_amendment from public.clinical_record_amendments
  where id=p_amendment_id for update;
  if v_amendment.status<>'draft'
    or not private.can_manage_clinical_record_correction(
      v_amendment.replacement_record_id,v_actor,'abandon'
    ) then
    raise exception using errcode='42501',message='correction_abandon_forbidden';
  end if;
  update public.clinical_records set status='invalidated',updated_at=now()
  where id=v_amendment.replacement_record_id and status='draft';
  if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;
  update public.clinical_record_amendments set
    status='abandoned',abandoned_at=clock_timestamp(),abandonment_reason=v_reason
  where id=p_amendment_id and status='draft'
  returning * into v_updated;
  if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;
  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_amendment.replacement_record_id,'draft','invalidated',v_actor,v_reason,
    jsonb_build_object('action','abandoned_correction_draft','amendment_id',p_amendment_id)
  );
  return jsonb_build_object(
    'id',v_updated.id,'status',v_updated.status,
    'target_record_id',v_updated.target_record_id,
    'replacement_record_id',v_updated.replacement_record_id,
    'abandoned_at',v_updated.abandoned_at,
    'abandonment_reason',v_updated.abandonment_reason
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.accept_clinical_protocol(p_code text, p_version integer, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_actor uuid:=auth.uid();v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();
 if not exists(select 1 from public.professional_verifications where user_id=v_actor and professional_role='nutritionist'and status='approved'and valid_until>now())then raise exception using errcode='42501',message='verified_nutritionist_required';end if;if p_decision not in('accepted','rejected','restricted')or length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='protocol_decision_and_reason_required';end if;if not exists(select 1 from public.clinical_protocol_catalog where code=p_code and version=p_version)then raise exception using errcode='P0002',message='clinical_protocol_not_found';end if;update public.clinical_protocol_acceptances set superseded_at=now()where(protocol_code,protocol_version,nutritionist_id)=(p_code,p_version,v_actor)and superseded_at is null;insert into public.clinical_protocol_acceptances(protocol_code,protocol_version,nutritionist_id,decision,reason)values(p_code,p_version,v_actor,p_decision,v_reason);return jsonb_build_object('code',p_code,'version',p_version,'decision',p_decision);end$function$;
CREATE OR REPLACE FUNCTION public.admin_access_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  member boolean := private.admin_member();
  allowed boolean := private.is_admin();
begin
 perform private.wave05_require_active_actor();

  if member then
    insert into private.admin_access_events(operator_id, hour_bucket, outcome)
    values (auth.uid(), date_trunc('hour', now()), case when allowed then 'authorized' else 'mfa_required' end)
    on conflict (operator_id, hour_bucket, outcome)
    do update set attempts = private.admin_access_events.attempts + 1, last_seen_at = now();
  end if;
  return jsonb_build_object('eligible', member, 'authorized', allowed, 'mfa_required', member and not allowed);
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_brand_migration_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'legacy_auth_accounts', (
      select count(*) from auth.users
      where split_part(lower(email), '@', 2) in ('hipozero.com', 'hipozero.com.br')
    ),
    'legacy_public_assets', (
      select count(*) from storage.objects o
      join storage.buckets b on b.id = o.bucket_id
      where b.public and o.name ilike '%hipozero%'
    ),
    'legacy_visible_achievements', (
      select count(*) from public.achievements
      where name ilike '%hipozero%' or description ilike '%hipozero%'
    ),
    'historical_reports', (
      select count(*) from public.bug_reports
      where user_email ilike '%hipozero%'
    )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_list_people(p_search text DEFAULT ''::text, p_type text DEFAULT 'all'::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q text := left(btrim(coalesce(p_search, '')), 80);
  kind text := coalesce(p_type, 'all');
  page_number integer := least(greatest(coalesce(p_page, 1), 1), 400);
  result jsonb;
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION public.admin_security_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', o.user_id,
        'email', u.email,
        'role', o.role,
        'granted_at', o.granted_at,
        'revoked_at', o.revoked_at,
        'mfa_verified', exists (select 1 from auth.mfa_factors f where f.user_id = o.user_id and f.status::text = 'verified'),
        'last_mfa_challenge_at', (select max(f.last_challenged_at) from auth.mfa_factors f where f.user_id = o.user_id and f.status::text = 'verified')
      ) order by o.granted_at)
      from private.admin_operators o join auth.users u on u.id = o.user_id
    ), '[]'::jsonb),
    'access_last_7d', coalesce((
      select jsonb_agg(jsonb_build_object('hour', e.hour_bucket, 'outcome', e.outcome, 'attempts', e.attempts, 'operator_id', e.operator_id) order by e.hour_bucket desc)
      from (select * from private.admin_access_events where hour_bucket >= now() - interval '7 days' order by hour_bucket desc limit 200) e
    ), '[]'::jsonb)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_workflow_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION public.archive_meal_plan(p_plan_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.meal_plans%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='meal_plan_archive_reason_required';end if;select*into v from public.meal_plans where id=p_plan_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or auth.uid()<>v.nutritionist_id then raise exception using errcode='42501',message='meal_plan_archive_forbidden';end if;update public.meal_plans set is_active=false,is_draft=false,prescription_status='archived',archived_at=now(),archived_by=auth.uid(),archive_reason=v_reason,updated_at=now()where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,nutritionist_id,actor_user_id)values('meal_plan.archived',now(),jsonb_build_object('plan_id',v.id,'reason',v_reason),v.patient_id,'meal_plan',v.nutritionist_id,auth.uid());return jsonb_build_object('id',v.id,'status','archived');end$function$;
CREATE OR REPLACE FUNCTION public.archive_private_evolution_template(p_template_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_template public.clinical_evolution_templates%rowtype;
  v_version integer;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select t.* into v_template from public.clinical_evolution_templates t
  where t.code=p_template_code for update;
  if not found or v_template.category<>'private' or v_template.owner_id<>v_actor then
    raise exception using errcode='42501',message='private_template_owner_required';
  end if;
  if not v_template.is_active then
    raise exception using errcode='23514',message='private_template_already_archived';
  end if;
  select max(v.version) into v_version
  from public.clinical_evolution_template_versions v where v.template_code=p_template_code;
  update public.clinical_evolution_templates
  set is_active=false,updated_at=now() where code=p_template_code;
  insert into public.clinical_evolution_template_events(
    template_code,version,action,actor_id
  ) values (p_template_code,v_version,'archived',v_actor);
  return (select to_jsonb(t) from public.clinical_evolution_templates t
    where t.code=p_template_code);
end $function$;
CREATE OR REPLACE FUNCTION public.authorize_my_data_export_attachment(p_attachment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_attachment public.clinical_attachments%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_attachment
    from public.clinical_attachments
   where id = p_attachment_id
     and patient_id = v_actor
     and upload_confirmed_at is not null
     and status in ('active', 'invalidated');

  if not found then
    raise exception using errcode = '42501', message = 'data_export_attachment_forbidden';
  end if;

  insert into public.activity_log(event_name, occurred_at, payload, patient_id, source_module, actor_user_id)
  values (
    'patient_data_export_attachment_authorized',
    statement_timestamp(),
    jsonb_build_object('attachment_id', v_attachment.id),
    v_actor,
    'privacy',
    v_actor
  );

  return jsonb_build_object(
    'attachment_id', v_attachment.id,
    'storage_bucket', v_attachment.storage_bucket,
    'storage_path', v_attachment.storage_path,
    'expires_in', 300,
    'authorization_expires_at', statement_timestamp() + interval '300 seconds'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.build_my_data_export_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile jsonb;
  v_categories jsonb;
  v_attachments jsonb;
  v_chats jsonb;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select to_jsonb(profile_row)
         - array['is_admin', 'simulation_owner_id', 'invite_code', 'patient_invite_code']::text[]
    into v_profile
    from public.user_profiles profile_row
   where profile_row.id = v_actor
     and profile_row.user_type = 'patient';

  if v_profile is null then
    raise exception using errcode = '42501', message = 'patient_export_only';
  end if;

  v_attachments := private.export_subject_rows(
    'public.clinical_attachments'::regclass,
    'patient_id',
    v_actor,
    array['storage_bucket', 'storage_path', 'upload_expires_at']
  );
  select coalesce(jsonb_agg(to_jsonb(chat_row) - 'media_url' order by chat_row.created_at), '[]'::jsonb)
    into v_chats from public.chats chat_row where chat_row.from_id=v_actor or chat_row.to_id=v_actor;

  v_categories := jsonb_build_object(
    'care_episodes', private.export_subject_rows('public.care_episodes'::regclass, 'patient_id', v_actor),
    'care_relationships', private.export_subject_rows('public.nutritionist_patients'::regclass, 'patient_id', v_actor),
    'archived_care_relationships', private.export_subject_rows('public.archived_patient_links'::regclass, 'patient_id', v_actor),
    'anamneses', private.export_subject_rows(
      'public.anamnesis_records'::regclass,
      'patient_id',
      v_actor,
      array['public_access_token', 'token_expires_at', 'lgpd_ip_address']
    ),
    'appointments', private.export_subject_rows('public.appointments'::regclass, 'patient_id', v_actor),
    'checkins', private.export_subject_rows(
      'public.checkin_sessions'::regclass,
      'patient_id',
      v_actor,
      array['token']
    ),
    'clinical_records', private.export_subject_rows('public.clinical_records'::regclass, 'patient_id', v_actor),
    'clinical_attachments', v_attachments,
    'clinical_attachment_events', private.export_subject_rows('public.clinical_attachment_events'::regclass, 'patient_id', v_actor),
    'clinical_amendments', private.export_subject_rows('public.clinical_record_amendments'::regclass, 'patient_id', v_actor),
    'official_documents', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'source_type',a.source_type,'source_key',a.source_key,'signed_at',a.signed_at,'sha256',a.canonical_sha256,'authenticity_code',a.authenticity_code,'canonical_payload',a.canonical_payload #- '{professional,logo_storage_path}' #- '{professional,signature_storage_path}' #- '{professional,stamp_storage_path}')) from public.document_artifacts a where a.patient_id=v_actor and a.visibility='shared_with_patient' and a.status in('signed','superseded','invalidated')),'[]'::jsonb),
    'privacy_requests', private.export_subject_rows('public.data_subject_requests'::regclass,'subject_id',v_actor,array['assigned_to']),
    'anthropometry', private.export_subject_rows('public.growth_records'::regclass, 'patient_id', v_actor),
    'energy_calculations', private.export_subject_rows('public.energy_expenditure_calculations'::regclass, 'patient_id', v_actor),
    'glycemia', private.export_subject_rows('public.glycemia_records'::regclass, 'patient_id', v_actor),
    'laboratory_results', private.export_subject_rows(
      'public.lab_results'::regclass,
      'patient_id',
      v_actor,
      array['pdf_url']
    ),
    'goals', private.export_subject_rows('public.patient_goals'::regclass, 'patient_id', v_actor),
    'meal_plans', private.export_subject_rows('public.meal_plans'::regclass, 'patient_id', v_actor),
    'food_diary', private.export_subject_rows(
      'public.meals'::regclass,
      'patient_id',
      v_actor,
      array['photo_url']
    ),
    'food_diary_audit', private.export_subject_rows('public.meal_audit_log'::regclass, 'patient_id', v_actor),
    'food_diary_edit_history', private.export_subject_rows('public.meal_edit_history'::regclass, 'patient_id', v_actor),
    'meal_plan_versions', private.export_subject_rows('public.meal_plan_versions'::regclass, 'patient_id', v_actor),
    'prescriptions', private.export_subject_rows('public.prescriptions'::regclass, 'patient_id', v_actor),
    'progress_photos', private.export_subject_rows(
      'public.progress_photos'::regclass,
      'patient_id',
      v_actor,
      array['photo_url', 'storage_path']
    ),
    'progress_photo_events', private.export_subject_rows('public.progress_photo_events'::regclass, 'patient_id', v_actor),
    'legal_guardians', private.export_subject_rows('public.patient_episode_legal_guardians'::regclass, 'patient_id', v_actor, array['cpf_fingerprint']),
    'reminder_preferences', private.export_subject_rows('public.patient_reminder_preferences'::regclass, 'patient_id', v_actor),
    'module_sync_flags', private.export_subject_rows('public.patient_module_sync_flags'::regclass, 'patient_id', v_actor),
    'financial_records', private.export_subject_rows('public.financial_records'::regclass, 'patient_id', v_actor, array['attachment_url']),
    'financial_transactions', private.export_subject_rows('public.financial_transactions'::regclass, 'patient_id', v_actor),
    'messages', v_chats,
    'dispatched_communications', private.export_subject_rows('public.template_dispatch_log'::regclass, 'patient_id', v_actor),
    'supplement_logs', private.export_subject_rows('public.supplement_logs'::regclass, 'patient_id', v_actor),
    'weekly_summaries', private.export_subject_rows('public.weekly_summaries'::regclass, 'patient_id', v_actor),
    'achievements', private.export_subject_rows('public.user_achievements'::regclass, 'user_id', v_actor),
    'notifications', private.export_subject_rows(
      'public.notifications'::regclass,
      'user_id',
      v_actor,
      array['link_url']
    ),
    'notification_events', private.export_subject_rows('public.notification_events'::regclass, 'user_id', v_actor),
    'activity_history', private.export_subject_rows('public.activity_log'::regclass, 'patient_id', v_actor)
  );

  insert into public.activity_log(event_name, occurred_at, payload, patient_id, source_module, actor_user_id)
  values ('patient_data_export_generated', statement_timestamp(), jsonb_build_object('schema_version', 'nello-portability-1'), v_actor, 'privacy', v_actor);

  return jsonb_build_object(
    'schema_version', 'nello-portability-1',
    'generated_at', statement_timestamp(),
    'data_controller', 'Nello',
    'subject', v_profile,
    'categories', v_categories,
    'attachment_manifest', v_attachments,
    'scope_notice', 'Copia de portabilidade gerada pelo titular. URLs temporarias, segredos, tokens e dados tecnicos de seguranca foram omitidos.'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.cancel_my_data_subject_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.data_subject_requests%rowtype;
begin
 perform private.wave05_require_active_actor();

 select * into v_request from public.data_subject_requests where id=p_request_id and subject_id=auth.uid() for update;
 if not found then raise exception using errcode='42501',message='data_subject_request_cancel_forbidden';end if;
 if v_request.status not in('submitted','triaged') then raise exception using errcode='23514',message='data_subject_request_cannot_be_cancelled';end if;
 update public.data_subject_requests set status='cancelled',cancelled_at=now(),updated_at=now(),revision=revision+1 where id=v_request.id;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,from_status,to_status,reason)values(v_request.id,auth.uid(),'cancelled',v_request.status,'cancelled','SolicitaÃ§Ã£o cancelada pelo titular');
 return jsonb_build_object('id',v_request.id,'status','cancelled');
end$function$;
CREATE OR REPLACE FUNCTION public.change_clinical_attachment_visibility(p_attachment_id uuid, p_visibility text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_attachment_visibility';
  end if;
  if length(coalesce(v_reason,''))<10 then
    raise exception using errcode='22023',message='visibility_change_reason_required';
  end if;
  select * into v_attachment from public.clinical_attachments where id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_attachment.status<>'active' then
    raise exception using errcode='23514',message='only_active_attachment_can_change_visibility';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_visibility_forbidden';
  end if;
  if v_attachment.visibility=p_visibility then
    return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
      'visibility',v_attachment.visibility,'unchanged',true);
  end if;
  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set visibility=p_visibility where id=v_attachment.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,'visibility',p_visibility);
end
$function$;
CREATE OR REPLACE FUNCTION public.claim_food_proxy_quota(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  allowed boolean;
  quota_time timestamptz := statement_timestamp();
begin
 perform private.wave05_require_active_actor();

  if p_user_id is null then return false; end if;

  insert into private.food_proxy_quotas as quota
    (user_id, window_started_at, request_count)
  values (p_user_id, quota_time, 1)
  on conflict (user_id) do update
    set window_started_at = case
      when quota.window_started_at <= quota_time - interval '1 minute'
        then quota_time else quota.window_started_at end,
      request_count = case
        when quota.window_started_at <= quota_time - interval '1 minute'
          then 1 else quota.request_count + 1 end
  returning request_count <= 60 into allowed;

  return coalesce(allowed, false);
end;
$function$;
CREATE OR REPLACE FUNCTION public.clone_evolution_template(p_source_code text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_source public.clinical_evolution_templates%rowtype;
  v_sections jsonb;
  v_code text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 200 then
    raise exception using errcode='22023',message='invalid_template_name';
  end if;

  select t.* into v_source from public.clinical_evolution_templates t
  where t.code=p_source_code and t.is_active
    and (t.category='system' or t.owner_id=v_actor);
  if not found then
    raise exception using errcode='42501',message='source_template_forbidden';
  end if;
  select v.sections_snapshot into v_sections
  from public.clinical_evolution_template_versions v
  where v.template_code=v_source.code order by v.version desc limit 1;

  v_code:='private_' || substring(replace(v_actor::text,'-','') from 1 for 8)
    || '_' || replace(gen_random_uuid()::text,'-','');
  insert into public.clinical_evolution_templates(
    code,name,description,category,owner_id,sections
  ) values (
    v_code,btrim(p_name),v_source.description,'private',v_actor,v_sections
  );
  insert into public.clinical_evolution_template_versions(
    template_code,version,sections_snapshot,created_by
  ) values (v_code,1,v_sections,v_actor);
  insert into public.clinical_evolution_template_events(
    template_code,version,action,actor_id,metadata
  ) values (v_code,1,'created',v_actor,jsonb_build_object('source_code',v_source.code));

  return (select to_jsonb(t) || jsonb_build_object('current_version',1)
    from public.clinical_evolution_templates t where t.code=v_code);
end $function$;
CREATE OR REPLACE FUNCTION public.compare_clinical_record_versions(p_left_record_id uuid, p_right_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_left public.clinical_records%rowtype;
  v_right public.clinical_records%rowtype;
  v_sections jsonb;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select * into v_left from public.clinical_records where id=p_left_record_id;
  select * into v_right from public.clinical_records where id=p_right_record_id;
  if not found
    or not private.can_read_clinical_record(p_left_record_id)
    or not private.can_read_clinical_record(p_right_record_id) then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;
  if v_left.root_record_id<>v_right.root_record_id then
    raise exception using errcode='22023',message='clinical_record_versions_not_in_same_chain';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key',keys.key,
      'left_value',v_left.content->keys.key,
      'right_value',v_right.content->keys.key,
      'change_type',case
        when not (v_left.content ? keys.key) then 'added'
        when not (v_right.content ? keys.key) then 'removed'
        when v_left.content->keys.key is distinct from v_right.content->keys.key then 'changed'
        else 'unchanged'
      end
    ) order by keys.key
  ),'[]'::jsonb) into v_sections
  from (
    select key from jsonb_object_keys(v_left.content) key
    union
    select key from jsonb_object_keys(v_right.content) key
  ) keys;

  if v_actor=v_left.patient_id then
    return jsonb_build_object(
      'left',private.project_patient_clinical_record(v_left),
      'right',private.project_patient_clinical_record(v_right),
      'sections',v_sections
    );
  end if;
  return jsonb_build_object(
    'root_record_id',v_left.root_record_id,
    'left',private.project_clinical_record_chain_item(v_left),
    'right',private.project_clinical_record_chain_item(v_right),
    'sections',v_sections
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.confirm_clinical_attachment_replacement(p_attachment_id uuid, p_sha256 text, p_size_bytes bigint, p_mime_type text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_previous public.clinical_attachments%rowtype;
  v_metadata jsonb;
  v_owner text;
  v_reason text:=nullif(btrim(p_reason),'');
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(coalesce(v_reason,''))<10 then
    raise exception using errcode='22023',message='attachment_replacement_reason_required';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_sha256';
  end if;
  select * into v_attachment from public.clinical_attachments where id=p_attachment_id for update;
  if not found or v_attachment.replaces_attachment_id is null then
    raise exception using errcode='P0002',message='replacement_intent_not_found';
  end if;
  if v_attachment.author_id<>v_actor or v_attachment.status<>'uploading'
    or v_attachment.upload_confirmed_at is not null or v_attachment.upload_expires_at<=now() then
    raise exception using errcode='42501',message='replacement_confirmation_forbidden';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_replacement_forbidden';
  end if;
  select * into v_previous from public.clinical_attachments
    where id=v_attachment.replaces_attachment_id for update;
  if v_previous.status<>'active' then
    raise exception using errcode='23514',message='replacement_source_not_active';
  end if;
  select metadata,owner_id into v_metadata,v_owner from storage.objects
    where bucket_id=v_attachment.storage_bucket and name=v_attachment.storage_path;
  if not found or v_owner is distinct from v_actor::text
    or (v_metadata->>'size')::bigint is distinct from v_attachment.size_bytes
    or v_metadata->>'mimetype' is distinct from v_attachment.mime_type
    or p_size_bytes is distinct from v_attachment.size_bytes
    or p_mime_type is distinct from v_attachment.mime_type then
    raise exception using errcode='22023',message='upload_metadata_mismatch';
  end if;

  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set sha256=p_sha256,status='active',upload_confirmed_at=now()
    where id=v_attachment.id;
  update public.clinical_attachments set status='superseded' where id=v_previous.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
    'replaced_attachment_id',v_previous.id,'status','active');
end
$function$;
CREATE OR REPLACE FUNCTION public.confirm_clinical_attachment_upload(p_attachment_id uuid, p_sha256 text, p_size_bytes bigint, p_mime_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_object_metadata jsonb;
  v_object_owner_id text;
  v_object_size_text text;
  v_object_mime text;
  v_target_status text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;

  select a.* into v_attachment
  from public.clinical_attachments a
  where a.id=p_attachment_id
  for update;
  if not found then raise exception using errcode='P0002',message='upload_intent_not_found'; end if;
  if v_attachment.author_id<>v_actor then
    raise exception using errcode='42501',message='upload_confirmation_forbidden';
  end if;
  if v_attachment.status<>'uploading' or v_attachment.upload_confirmed_at is not null then
    raise exception 'upload_already_finalized';
  end if;
  if v_attachment.upload_expires_at<=now() then
    perform set_config('app.clinical_attachment_reason','upload_intent_expired',true);
    update public.clinical_attachments set status='upload_failed' where id=v_attachment.id;
    return jsonb_build_object('success',false,'code','upload_expired','attachment_id',v_attachment.id);
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_sha256';
  end if;
  if v_attachment.source='patient' then
    if not exists(
      select 1 from public.care_episodes e
      where e.id=v_attachment.care_episode_id and e.patient_id=v_actor and e.status='active'
    ) then raise exception using errcode='42501',message='upload_confirmation_forbidden'; end if;
  elsif not private.lock_and_can_write_active_care_episode(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='upload_confirmation_forbidden';
  end if;

  select o.metadata,o.owner_id into v_object_metadata,v_object_owner_id
  from storage.objects o
  where o.bucket_id=v_attachment.storage_bucket and o.name=v_attachment.storage_path;
  if not found then raise exception 'uploaded_object_not_found'; end if;

  v_object_size_text:=v_object_metadata->>'size';
  v_object_mime:=v_object_metadata->>'mimetype';
  if v_object_owner_id is distinct from v_actor::text
    or v_object_size_text is null or v_object_size_text !~ '^[0-9]+$'
    or v_object_size_text::bigint<>v_attachment.size_bytes
    or p_size_bytes is null or p_size_bytes<>v_attachment.size_bytes
    or v_object_mime is distinct from v_attachment.mime_type
    or p_mime_type is distinct from v_attachment.mime_type then
    raise exception 'upload_metadata_mismatch';
  end if;

  v_target_status:=case when v_attachment.source='patient' then 'pending_review' else 'active' end;
  perform set_config('app.clinical_attachment_reason','upload_confirmed',true);
  update public.clinical_attachments
  set sha256=p_sha256,status=v_target_status,upload_confirmed_at=now()
  where id=v_attachment.id;

  return jsonb_build_object(
    'success',true,'attachment_id',v_attachment.id,'status',v_target_status
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.confirm_document_asset_upload_verified(p_upload_id uuid, p_actor_id uuid, p_sha256 text, p_size_bytes bigint, p_mime_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_upload public.document_asset_uploads%rowtype;
  v_metadata jsonb;
  v_owner_id text;
  v_created_identity_id uuid;
begin
 perform private.wave05_require_active_actor();

  if auth.role() is distinct from 'service_role' or p_actor_id is null then
    raise exception using errcode = '42501', message = 'trusted_document_confirmation_required';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_sha256';
  end if;

  select * into v_upload
  from public.document_asset_uploads
  where id = p_upload_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'document_asset_upload_not_found'; end if;
  if v_upload.professional_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'document_asset_confirmation_forbidden';
  end if;
  if v_upload.status <> 'uploading' then
    raise exception using errcode = '23514', message = 'document_asset_upload_already_finalized';
  end if;
  if v_upload.expires_at <= now() then
    update public.document_asset_uploads
    set status = 'expired', failure_code = 'upload_expired'
    where id = v_upload.id;
    return jsonb_build_object('success', false, 'code', 'upload_expired', 'upload_id', v_upload.id);
  end if;

  select metadata, owner_id into v_metadata, v_owner_id
  from storage.objects
  where bucket_id = v_upload.storage_bucket and name = v_upload.storage_path;
  if not found then raise exception using errcode = 'P0002', message = 'uploaded_document_asset_not_found'; end if;
  if v_owner_id is distinct from p_actor_id::text
     or v_metadata->>'size' is null
     or (v_metadata->>'size')::bigint is distinct from v_upload.size_bytes
     or v_metadata->>'mimetype' is distinct from v_upload.mime_type
     or p_size_bytes is distinct from v_upload.size_bytes
     or p_mime_type is distinct from v_upload.mime_type then
    raise exception using errcode = '22023', message = 'document_asset_metadata_mismatch';
  end if;

  v_created_identity_id := private.version_document_identity_asset(
    p_actor_id, v_upload.identity_id, v_upload.asset_type, v_upload.storage_path,
    'document_' || v_upload.asset_type || '_updated'
  );

  update public.document_asset_uploads
  set status = 'confirmed', sha256 = p_sha256, confirmed_at = now(),
      created_identity_id = v_created_identity_id
  where id = v_upload.id;

  return jsonb_build_object(
    'success', true,
    'upload_id', v_upload.id,
    'asset_type', v_upload.asset_type,
    'identity_id', v_created_identity_id
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.confirm_lab_result_interpretation(p_result_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.lab_results%rowtype;v_reason text:=nullif(btrim(p_reason),'');v_nutritionist uuid;
begin
 perform private.wave05_require_active_actor();

  if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='interpretation_confirmation_reason_required';end if;
  select*into v from public.lab_results where id=p_result_id for update;
  if not found or not private.can_write_active_care_episode(v.care_episode_id)or not v.is_latest_revision or v.record_status<>'active'then raise exception using errcode='42501',message='lab_interpretation_confirmation_forbidden';end if;
  if v.interpretation_status='confirmed'then return jsonb_build_object('id',v.id,'interpretation_status','confirmed','already_confirmed',true,'confirmed_at',v.confirmed_at);end if;
  select nutritionist_id into v_nutritionist from public.care_episodes where id=v.care_episode_id;
  update public.lab_results set interpretation_status='confirmed',confirmed_by=auth.uid(),confirmed_at=now()where id=v.id;
  insert into public.clinical_calculation_snapshots(patient_id,care_episode_id,nutritionist_id,domain,source_entity,source_id,protocol_code,protocol_version,input_snapshot,output_snapshot,professional_decision,confirmed_by,confirmed_at)
  values(v.patient_id,v.care_episode_id,v_nutritionist,'laboratory','lab_results',v.id::text,'laboratory.manual_reference',1,
    jsonb_strip_nulls(jsonb_build_object('test_name',v.test_name,'value',v.test_value,'unit',v.test_unit,'reference_min',v.reference_min,'reference_max',v.reference_max,'reference_source',v.reference_source,'reference_snapshot',v.reference_snapshot)),
    jsonb_build_object('assisted_status',v.status,'interpretation_status','confirmed'),v_reason,auth.uid(),now());
  insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.interpretation.confirmed',now(),jsonb_build_object('result_id',v.id,'reason',v_reason,'assisted_status',v.status),v.patient_id,'laboratory',auth.uid());
  return jsonb_build_object('id',v.id,'interpretation_status','confirmed','confirmed_at',now());
end$function$;
CREATE OR REPLACE FUNCTION public.copy_meal_plan_to_patient_atomic(p_source_plan_id bigint, p_target_patient_id uuid, p_name text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.meal_plans%rowtype;
  v_episode uuid;
  v_plan_id bigint;
  v_meal record;
  v_food record;
  v_sub record;
  v_meal_id bigint;
  v_food_id bigint;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then
    raise exception using errcode='42501', message='authentication_required';
  end if;
  select * into v_source from public.meal_plans
  where id=p_source_plan_id and nutritionist_id=auth.uid() and archived_at is null;
  if not found then
    raise exception using errcode='42501', message='source_plan_not_found_or_forbidden';
  end if;
  if p_target_patient_id is null or length(coalesce(btrim(coalesce(p_name,v_source.name)),'')) not between 3 and 100 then
    raise exception using errcode='22023', message='invalid_plan_copy_payload';
  end if;
  v_episode := private.resolve_active_care_episode(p_target_patient_id);
  if not private.can_write_active_meal_plan(p_target_patient_id,auth.uid(),v_episode) then
    raise exception using errcode='42501', message='target_patient_not_in_active_care';
  end if;
  if not exists(select 1 from public.meal_plan_meals where meal_plan_id=p_source_plan_id) then
    raise exception using errcode='22023', message='source_plan_has_no_meals';
  end if;
  insert into public.meal_plans
    (patient_id,nutritionist_id,care_episode_id,name,description,active_days,
     start_date,is_active,is_draft,plan_mode,prescription_status,source_snapshot)
  values
    (p_target_patient_id,auth.uid(),v_episode,btrim(coalesce(p_name,v_source.name)),
     v_source.description,v_source.active_days,current_date,false,false,
     v_source.plan_mode,'draft',
     jsonb_build_object('origin','copy_meal_plan_to_patient','source_plan_id',p_source_plan_id,
       'copied_at',now(),'requires_professional_review',true))
  returning id into v_plan_id;

  for v_meal in select * from public.meal_plan_meals
      where meal_plan_id=p_source_plan_id order by order_index,id loop
    insert into public.meal_plan_meals
      (meal_plan_id,name,meal_type,meal_time,order_index,notes,
       total_calories,total_protein,total_carbs,total_fat)
    values
      (v_plan_id,v_meal.name,v_meal.meal_type,v_meal.meal_time,v_meal.order_index,
       v_meal.notes,v_meal.total_calories,v_meal.total_protein,v_meal.total_carbs,v_meal.total_fat)
    returning id into v_meal_id;
    for v_food in select * from public.meal_plan_foods
        where meal_plan_meal_id=v_meal.id order by order_index,id loop
      if not exists(select 1 from public.foods f where f.id=v_food.food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id=auth.uid())) then
        raise exception using errcode='22023', message='source_plan_food_unavailable';
      end if;
      insert into public.meal_plan_foods
        (meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,notes,
         order_index,patient_description,food_snapshot,measure_snapshot,equivalent_group)
      values
        (v_meal_id,v_food.food_id,v_food.quantity,v_food.unit,v_food.calories,
         v_food.protein,v_food.carbs,v_food.fat,v_food.notes,v_food.order_index,
         v_food.patient_description,v_food.food_snapshot,v_food.measure_snapshot,
         v_food.equivalent_group)
      returning id into v_food_id;
      for v_sub in select * from public.meal_plan_food_substitutions
          where meal_plan_food_id=v_food.id order by id loop
        if not exists(select 1 from public.foods f where f.id=v_sub.substitute_food_id and f.is_active
          and (f.nutritionist_id is null or f.nutritionist_id=auth.uid())) then
          raise exception using errcode='22023', message='source_plan_substitute_unavailable';
        end if;
        insert into public.meal_plan_food_substitutions
          (meal_plan_food_id,substitute_food_id,notes,quantity,unit,food_snapshot,equivalence_basis)
        values
          (v_food_id,v_sub.substitute_food_id,v_sub.notes,v_sub.quantity,v_sub.unit,
           v_sub.food_snapshot,v_sub.equivalence_basis);
      end loop;
    end loop;
  end loop;
  return v_plan_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_clinical_attachment_replacement_intent(p_replaces_attachment_id uuid, p_original_filename text, p_mime_type text, p_size_bytes bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_previous public.clinical_attachments%rowtype;
  v_id uuid:=gen_random_uuid();
  v_expires_at timestamptz:=now()+interval '15 minutes';
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then
    raise exception using errcode='22023',message='unsupported_mime_type';
  end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>15728640 then
    raise exception using errcode='22023',message='invalid_file_size';
  end if;
  if p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 255
    or btrim(p_original_filename) ~ '[[:cntrl:]/\\]' then
    raise exception using errcode='22023',message='invalid_original_filename';
  end if;
  select * into v_previous from public.clinical_attachments
    where id=p_replaces_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_previous.status<>'active' then
    raise exception using errcode='23514',message='only_active_attachment_can_be_replaced';
  end if;
  if not private.can_manage_clinical_attachment(v_previous.care_episode_id) then
    raise exception using errcode='42501',message='attachment_replacement_forbidden';
  end if;

  insert into public.clinical_attachments(
    id,patient_id,care_episode_id,clinical_record_id,root_attachment_id,version,
    replaces_attachment_id,category_code,description,clinical_date,source,author_id,
    storage_bucket,storage_path,original_filename,mime_type,size_bytes,status,visibility,
    upload_expires_at
  ) values (
    v_id,v_previous.patient_id,v_previous.care_episode_id,v_previous.clinical_record_id,
    v_previous.root_attachment_id,v_previous.version+1,v_previous.id,v_previous.category_code,
    v_previous.description,v_previous.clinical_date,'nutritionist',v_actor,
    'clinical-attachments',v_id::text,btrim(p_original_filename),p_mime_type,p_size_bytes,
    'uploading',v_previous.visibility,v_expires_at
  );
  return jsonb_build_object('attachment_id',v_id,'storage_bucket','clinical-attachments',
    'storage_path',v_id::text,'status','uploading','expires_at',v_expires_at);
end
$function$;
CREATE OR REPLACE FUNCTION public.create_clinical_attachment_signed_url(p_attachment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_expires_at timestamptz:=now()+interval '5 minutes';
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_attachment_id is null then
    raise exception using errcode='22023',message='attachment_required';
  end if;
  if not private.can_open_clinical_attachment(p_attachment_id) then
    raise exception using errcode='42501',message='attachment_open_forbidden';
  end if;

  select a.* into v_attachment
  from public.clinical_attachments a where a.id=p_attachment_id;
  if not found then raise exception using errcode='P0002',message='attachment_not_found'; end if;

  return jsonb_build_object(
    'attachment_id',v_attachment.id,'storage_bucket',v_attachment.storage_bucket,
    'storage_path',v_attachment.storage_path,'expires_in',300,
    'authorization_expires_at',v_expires_at
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.create_clinical_attachment_upload_intent(p_patient_id uuid, p_care_episode_id uuid, p_clinical_record_id uuid, p_category_code text, p_description text, p_clinical_date date, p_original_filename text, p_mime_type text, p_size_bytes bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
  v_source text;
  v_attachment_id uuid:=gen_random_uuid();
  v_storage_path text:=v_attachment_id::text;
  v_filename text:=btrim(p_original_filename);
  v_expires_at timestamptz:=now()+interval '15 minutes';
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_patient_id is null or p_care_episode_id is null then
    raise exception using errcode='22023',message='patient_and_episode_required';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then
    raise exception using errcode='22023',message='unsupported_mime_type';
  end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>15728640 then
    raise exception using errcode='22023',message='invalid_file_size';
  end if;
  if v_filename is null or length(v_filename)<1 or length(v_filename)>255
    or v_filename ~ '[[:cntrl:]/\\]' then
    raise exception using errcode='22023',message='invalid_original_filename';
  end if;
  if not exists(
    select 1 from public.clinical_attachment_categories c
    where c.code=p_category_code and c.is_active
  ) then raise exception using errcode='22023',message='invalid_attachment_category'; end if;

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_care_episode_id and e.patient_id=p_patient_id
  for share;
  if not found then
    raise exception using errcode='42501',message='episode_upload_forbidden';
  end if;
  if v_episode.status<>'active' then
    raise exception using errcode='42501',message='active_episode_required';
  end if;

  if v_actor=v_episode.patient_id then
    v_source:='patient';
    if p_clinical_record_id is not null then
      raise exception using errcode='42501',message='patient_cannot_link_clinical_record';
    end if;
  elsif private.lock_and_can_write_active_care_episode(p_care_episode_id) then
    v_source:=case when v_actor=v_episode.student_id then 'student' else 'nutritionist' end;
  else
    raise exception using errcode='42501',message='episode_upload_forbidden';
  end if;

  if p_clinical_record_id is not null and not exists(
    select 1 from public.clinical_records r
    where r.id=p_clinical_record_id and r.patient_id=p_patient_id
      and r.care_episode_id=p_care_episode_id
  ) then raise exception using errcode='23503',message='clinical_record_scope_mismatch'; end if;

  insert into public.clinical_attachments(
    id,patient_id,care_episode_id,clinical_record_id,category_code,description,
    clinical_date,source,author_id,storage_bucket,storage_path,original_filename,
    mime_type,size_bytes,sha256,status,visibility,upload_expires_at
  ) values (
    v_attachment_id,p_patient_id,p_care_episode_id,p_clinical_record_id,p_category_code,
    nullif(btrim(p_description),''),p_clinical_date,v_source,v_actor,
    'clinical-attachments',v_storage_path,v_filename,p_mime_type,p_size_bytes,null,
    'uploading','professional_private',v_expires_at
  );

  return jsonb_build_object(
    'attachment_id',v_attachment_id,
    'storage_bucket','clinical-attachments',
    'storage_path',v_storage_path,
    'status','uploading',
    'expires_at',v_expires_at
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.create_clinical_evolution_draft(p_patient_id uuid, p_episode_id uuid, p_template_code text, p_encounter_at timestamp with time zone, p_visibility text, p_retrospective_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
  v_template public.clinical_evolution_templates%rowtype;
  v_template_version integer;
  v_student uuid;
  v_supervisor uuid;
  v_reason text;
  v_id uuid;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_patient_id is null or p_episode_id is null or p_encounter_at is null then
    raise exception using errcode='22023',message='patient_episode_and_encounter_required';
  end if;
  if p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_visibility';
  end if;

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_episode_id and e.patient_id=p_patient_id
  for update;
  if not found or v_episode.status<>'active'
    or not private.can_write_active_care_episode(p_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden';
  end if;

  if v_episode.is_simulation then
    if v_actor<>v_episode.nutritionist_id then
      raise exception using errcode='42501',message='episode_write_forbidden';
    end if;
  elsif v_episode.student_id is not null then
    if v_actor<>v_episode.student_id or v_episode.supervisor_id is null then
      raise exception using errcode='42501',message='student_required_to_create';
    end if;
    v_student:=v_episode.student_id;
    v_supervisor:=v_episode.supervisor_id;
  else
    if v_actor<>v_episode.nutritionist_id or not exists (
      select 1
      from public.professional_verifications pv
      where pv.user_id=v_actor
        and pv.professional_role='nutritionist'
        and pv.status='approved'
        and pv.valid_until>now()
    ) then
      raise exception using errcode='42501',message='professional_capacity_required';
    end if;
  end if;

  select t.* into v_template
  from public.clinical_evolution_templates t
  where t.code=p_template_code
    and t.is_active
    and (t.category='system' or t.owner_id=v_actor)
  for share;
  if not found then
    raise exception using errcode='22023',message='active_template_required';
  end if;
  select max(v.version) into v_template_version
  from public.clinical_evolution_template_versions v
  where v.template_code=v_template.code;
  if v_template_version is null then
    raise exception using errcode='22023',message='active_template_required';
  end if;

  if p_encounter_at<now()-interval '5 minutes' then
    v_reason:=btrim(coalesce(p_retrospective_reason,''));
    if length(v_reason) not between 10 and 500 then
      raise exception using errcode='22023',message='retrospective_reason_required';
    end if;
  else
    v_reason:=null;
  end if;

  insert into public.clinical_records(
    patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,visibility,encounter_at,retrospective_reason,template_code,
    template_version,revision
  ) values (
    p_patient_id,p_episode_id,v_episode.nutritionist_id,v_actor,v_student,v_supervisor,
    'clinical_evolution',p_visibility,p_encounter_at,v_reason,p_template_code,
    v_template_version,1
  ) returning id into v_id;

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,metadata
  ) values (
    v_id,null,'draft',v_actor,
    jsonb_build_object('action','created','template_code',p_template_code,
      'template_version',v_template_version)
  );

  return (
    select private.project_clinical_evolution_record(r)
    from public.clinical_records r
    where r.id=v_id
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.create_clinical_record_draft(p_patient_id uuid, p_record_type text, p_encounter_at timestamp with time zone, p_visibility text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_episode uuid; v_nutritionist uuid;
  v_student uuid; v_supervisor uuid; v_id uuid;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_record_type='clinical_evolution' then
    raise exception using errcode='22023',message='specialized_evolution_draft_required'; end if;
  if p_encounter_at<now()-interval '5 minutes' then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if not exists(
    select 1 from public.clinical_record_types t where t.code=p_record_type and t.is_active
  ) then raise exception using errcode='22023',message='active_record_type_required'; end if;
  v_episode:=private.resolve_active_care_episode(p_patient_id);
  select nutritionist_id into v_nutritionist from public.care_episodes
  where id=v_episode for update;
  if exists(
    select 1 from public.professional_verifications
    where user_id=v_actor and professional_role='student'
      and status='approved' and valid_until>now()
  ) then
    v_student:=v_actor;
    select s.supervisor_id into v_supervisor from public.student_supervisions s
    where s.student_id=v_actor and s.status='active' and s.supervisor_id=v_nutritionist
    order by s.started_at desc nulls last,s.id limit 1;
    if v_supervisor is null then
      raise exception using errcode='42501',message='active_supervisor_required'; end if;
  elsif v_actor<>v_nutritionist then
    raise exception using errcode='42501',message='professional_capacity_required';
  end if;
  insert into public.clinical_records(
    patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,visibility,encounter_at
  ) values (
    p_patient_id,v_episode,v_nutritionist,v_actor,v_student,v_supervisor,
    p_record_type,p_visibility,p_encounter_at
  ) returning id into v_id;
  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id
  ) values(v_id,null,'draft',v_actor);
  return (select to_jsonb(r) from public.clinical_records r where r.id=v_id);
end $function$;
CREATE OR REPLACE FUNCTION public.create_diet_template(p_user_id uuid, p_name text, p_description text, p_tags text[], p_meals jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_id uuid;v_meal jsonb;v_meal_id uuid;v_food jsonb;begin
 perform private.wave05_require_active_actor();
 if auth.uid()is null or p_user_id<>auth.uid()then raise exception using errcode='42501',message='template_owner_mismatch';end if;if length(coalesce(btrim(p_name),''))<3 or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_diet_template_payload';end if;insert into public.diet_templates(user_id,name,description,tags,current_version)values(auth.uid(),btrim(p_name),nullif(btrim(p_description),''),coalesce(p_tags,'{}'::text[]),1)returning id into v_id;for v_meal in select value from jsonb_array_elements(coalesce(p_meals,'[]'::jsonb))loop insert into public.diet_template_meals(template_id,name,time,order_index)values(v_id,coalesce(nullif(btrim(v_meal->>'name'),''),'RefeiÃ§Ã£o'),nullif(v_meal->>'time','')::time,coalesce((v_meal->>'order_index')::integer,0))returning id into v_meal_id;for v_food in select value from jsonb_array_elements(coalesce(v_meal->'foods','[]'::jsonb))loop insert into public.diet_template_foods(meal_id,food_id,quantity,unit,observation,order_index)values(v_meal_id,(v_food->>'food_id')::uuid,(v_food->>'quantity')::numeric,coalesce(nullif(v_food->>'unit',''),'g'),nullif(v_food->>'observation',''),coalesce((v_food->>'order_index')::integer,0));end loop;end loop;insert into public.diet_template_versions(template_id,version,snapshot,change_reason,created_by)values(v_id,1,private.build_diet_template_snapshot(v_id),'CriaÃ§Ã£o do template',auth.uid());return v_id;end$function$;
CREATE OR REPLACE FUNCTION public.create_document_artifact_from_clinical_record(p_record_id uuid, p_visibility text DEFAULT 'professional_private'::text, p_supersedes_id uuid DEFAULT NULL::uuid, p_replacement_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_r public.clinical_records%rowtype;v_i public.professional_document_identities%rowtype;v_id uuid:=gen_random_uuid();v_old public.document_artifacts%rowtype;v_responsible uuid;
begin
 perform private.wave05_require_active_actor();

 if v_actor is null then raise exception using errcode='42501',message='authentication_required';end if;
 if p_visibility not in('professional_private','shared_with_patient','share_later') then raise exception using errcode='22023',message='invalid_document_visibility';end if;
 select * into v_r from public.clinical_records where id=p_record_id for update;
 if not found or v_r.status not in('finalized','signed','corrected') or not private.can_write_active_care_episode(v_r.care_episode_id) then raise exception using errcode='42501',message='clinical_record_document_forbidden';end if;
 if v_actor not in(v_r.nutritionist_id,coalesce(v_r.student_id,v_r.nutritionist_id),coalesce(v_r.supervisor_id,v_r.nutritionist_id)) then raise exception using errcode='42501',message='clinical_record_document_forbidden';end if;
 v_responsible:=coalesce(v_r.supervisor_id,v_r.nutritionist_id);
 select * into v_i from public.professional_document_identities where professional_id=v_responsible and status='active';
 if not found then raise exception using errcode='23514',message='responsible_document_identity_required';end if;
 if p_supersedes_id is null and exists(select 1 from public.document_artifacts a where a.source_type='clinical_record' and a.source_id=v_r.id and a.status in('draft','finalized','signed')) then raise exception using errcode='23505',message='clinical_record_document_already_exists';end if;
 if p_supersedes_id is not null then select * into v_old from public.document_artifacts where id=p_supersedes_id for update;
   if not found or v_old.status not in ('signed','invalidated') or v_old.professional_id is distinct from v_responsible
   or v_old.patient_id is distinct from v_r.patient_id or v_old.care_episode_id is distinct from v_r.care_episode_id
   or v_old.source_type is distinct from 'clinical_record'
   or not exists(select 1 from public.clinical_records prior where prior.id=v_old.source_id and coalesce(prior.root_record_id,prior.id)=coalesce(v_r.root_record_id,v_r.id)) or length(coalesce(btrim(p_replacement_reason),''))<10 then raise exception using errcode='22023',message='invalid_document_replacement';end if;end if;
 insert into public.document_artifacts(id,layout_code,layout_version,source_type,source_id,patient_id,care_episode_id,professional_id,preparer_id,supervisor_id,identity_id,visibility,draft_payload,supersedes_id,replacement_reason)
 values(v_id,'clinical_record',1,'clinical_record',v_r.id,v_r.patient_id,v_r.care_episode_id,v_responsible,v_actor,v_r.supervisor_id,v_i.id,p_visibility,
 jsonb_build_object('title','REGISTRO CLÍNICO','record_type',v_r.record_type,'encounter_at',v_r.encounter_at,'content',v_r.content,'source_canonical_hash',v_r.canonical_hash),p_supersedes_id,nullif(btrim(p_replacement_reason),''));
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,to_status,reason)values(v_id,v_actor,'created','draft','document_created_from_clinical_record');
 return jsonb_build_object('artifact_id',v_id,'status','draft','revision',1);
end$function$;
CREATE OR REPLACE FUNCTION public.create_document_artifact_from_meal_plan(p_plan_id bigint, p_visibility text DEFAULT 'shared_with_patient'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_actor uuid:=auth.uid();v_plan public.meal_plans%rowtype;v_episode public.care_episodes%rowtype;v_identity public.professional_document_identities%rowtype;v_responsible uuid;v_id uuid;v_payload jsonb;begin
 perform private.wave05_require_active_actor();
 if v_actor is null then raise exception using errcode='42501',message='authentication_required';end if;if p_visibility not in('professional_private','shared_with_patient','share_later')then raise exception using errcode='22023',message='invalid_document_visibility';end if;select*into v_plan from public.meal_plans where id=p_plan_id;select*into v_episode from public.care_episodes where id=v_plan.care_episode_id;if v_plan.id is null or v_plan.is_draft or v_plan.prescription_status in('archived','invalidated')or not private.can_write_active_care_episode(v_plan.care_episode_id)or v_actor not in(v_plan.nutritionist_id,coalesce(v_episode.student_id,v_plan.nutritionist_id),coalesce(v_episode.supervisor_id,v_plan.nutritionist_id))then raise exception using errcode='42501',message='meal_plan_document_forbidden';end if;v_responsible:=coalesce(v_episode.supervisor_id,v_plan.nutritionist_id);select*into v_identity from public.professional_document_identities where professional_id=v_responsible and status='active';if not found then raise exception using errcode='23514',message='responsible_document_identity_required';end if;if exists(select 1 from public.document_artifacts where source_type='meal_plan'and source_key=p_plan_id::text and status in('draft','finalized','signed'))then raise exception using errcode='23505',message='meal_plan_document_already_exists';end if;select jsonb_build_object('title','PLANO ALIMENTAR','plan_name',v_plan.name,'issued_on',current_date,'diet_characteristics',jsonb_strip_nulls(jsonb_build_object('mode',v_plan.plan_mode,'description',v_plan.description,'active_days',v_plan.active_days,'start_date',v_plan.start_date,'end_date',v_plan.end_date)),'nutritional_targets',jsonb_build_object('energy_kcal',v_plan.daily_calories,'protein_g',v_plan.daily_protein,'carbohydrate_g',v_plan.daily_carbs,'fat_g',v_plan.daily_fat),'meals',coalesce((select jsonb_agg(jsonb_build_object('name',m.name,'type',m.meal_type,'time',m.meal_time,'notes',m.notes,'foods',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name',coalesce(f.food_snapshot->>'name',fd.name),'quantity',f.quantity,'unit',f.unit,'patient_description',f.patient_description,'calories',f.calories,'protein',f.protein,'carbs',f.carbs,'fat',f.fat,'source',coalesce(f.food_snapshot->>'source',fd.source)))order by f.order_index,f.id)from public.meal_plan_foods f left join public.foods fd on fd.id=f.food_id where f.meal_plan_meal_id=m.id),'[]'::jsonb))order by m.order_index,m.id)from public.meal_plan_meals m where m.meal_plan_id=v_plan.id),'[]'::jsonb),'professional_confirmation',jsonb_build_object('responsible_id',v_responsible,'prepared_by',v_actor),'source_snapshot',v_plan.source_snapshot)into v_payload;insert into public.document_artifacts(layout_code,layout_version,source_type,source_key,patient_id,care_episode_id,professional_id,preparer_id,supervisor_id,identity_id,visibility,draft_payload)values('meal_plan',1,'meal_plan',p_plan_id::text,v_plan.patient_id,v_plan.care_episode_id,v_responsible,v_actor,v_episode.supervisor_id,v_identity.id,p_visibility,v_payload)returning id into v_id;insert into public.document_artifact_events(artifact_id,actor_id,event_type,to_status,reason)values(v_id,v_actor,'created','draft','document_created_from_meal_plan');return jsonb_build_object('artifact_id',v_id,'status','draft','revision',1,'source_key',p_plan_id::text);end$function$;
CREATE OR REPLACE FUNCTION public.create_document_asset_upload_intent(p_asset_type text, p_original_filename text, p_mime_type text, p_size_bytes bigint, p_expected_identity_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_identity public.professional_document_identities%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_limit bigint;
  v_filename text := nullif(btrim(p_original_filename), '');
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_asset_type not in ('logo', 'visual_signature', 'stamp') then
    raise exception using errcode = '22023', message = 'invalid_document_asset_type';
  end if;
  if p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception using errcode = '22023', message = 'unsupported_document_asset_mime';
  end if;
  v_limit := case when p_asset_type = 'logo' then 5242880 else 2097152 end;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > v_limit then
    raise exception using errcode = '22023', message = 'invalid_document_asset_size';
  end if;
  if v_filename is null or length(v_filename) > 255 or v_filename ~ '[[:cntrl:]/\\]' then
    raise exception using errcode = '22023', message = 'invalid_document_asset_filename';
  end if;
  if not exists (
    select 1 from public.professional_verifications v
    where v.user_id = v_actor and v.professional_role = 'nutritionist'
      and v.status = 'approved' and v.valid_until > now()
  ) then
    raise exception using errcode = '42501', message = 'document_asset_requires_verified_nutritionist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('document_asset:' || v_actor::text, 0));
  select * into v_identity
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '23514', message = 'active_document_identity_required';
  end if;
  if p_expected_identity_version is null or p_expected_identity_version <> v_identity.version then
    raise exception using errcode = '40001', message = 'document_identity_revision_conflict';
  end if;

  v_path := v_actor::text || '/' || p_asset_type || '/' || v_id::text;
  insert into public.document_asset_uploads(
    id, professional_id, identity_id, asset_type, storage_path,
    original_filename, mime_type, size_bytes, expires_at
  ) values (
    v_id, v_actor, v_identity.id, p_asset_type, v_path,
    v_filename, p_mime_type, p_size_bytes, v_expires_at
  );

  return jsonb_build_object(
    'upload_id', v_id,
    'storage_bucket', 'document-assets',
    'storage_path', v_path,
    'asset_type', p_asset_type,
    'expires_at', v_expires_at
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_lab_result_record(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_patient uuid:=(p_payload->>'patient_id')::uuid;v_episode uuid;v_id bigint;begin
 perform private.wave05_require_active_actor();

 if coalesce((p_payload->>'interpretation_confirmed')::boolean,false) then raise exception using errcode='23514',message='explicit_lab_interpretation_confirmation_required';end if;
 if nullif(p_payload->>'reference_min','')::numeric > nullif(p_payload->>'reference_max','')::numeric then raise exception using errcode='22023',message='invalid_laboratory_reference_range';end if;
 v_episode:=private.resolve_active_care_episode(v_patient);insert into public.lab_results(patient_id,care_episode_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,pdf_url,pdf_filename,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at)values(v_patient,v_episode,nullif(btrim(p_payload->>'test_name'),''),nullif(p_payload->>'test_value',''),nullif(p_payload->>'test_unit',''),nullif(p_payload->>'reference_min','')::numeric,nullif(p_payload->>'reference_max','')::numeric,coalesce(nullif(p_payload->>'status',''),'pending'),(p_payload->>'test_date')::date,nullif(p_payload->>'notes',''),nullif(p_payload->>'pdf_url',''),nullif(p_payload->>'pdf_filename',''),coalesce(nullif(p_payload->>'reference_source',''),'laboratory_report'),coalesce(p_payload->'reference_snapshot','{}'::jsonb),case when(p_payload->>'interpretation_confirmed')::boolean then'confirmed'else'pending'end,case when(p_payload->>'interpretation_confirmed')::boolean then auth.uid()else null end,case when(p_payload->>'interpretation_confirmed')::boolean then now()else null end)returning id into v_id;update public.lab_results set root_result_id=id where id=v_id;return(select to_jsonb(r)from public.lab_results r where id=v_id);end$function$;
CREATE OR REPLACE FUNCTION public.create_meal_plan_atomic(p_plan_data jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_patient uuid; v_episode uuid; v_plan_id bigint; v_name text; v_days jsonb;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if jsonb_typeof(p_plan_data)<>'object' then raise exception using errcode='22023',message='invalid_meal_plan_payload'; end if;
  v_patient:=(p_plan_data->>'patient_id')::uuid;
  v_name:=btrim(coalesce(p_plan_data->>'name',''));
  v_days:=coalesce(p_plan_data->'active_days',
    '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb);
  if v_patient is null or length(v_name) not between 3 and 100
    or jsonb_typeof(v_days)<>'array' or jsonb_array_length(v_days)=0
    or coalesce(p_plan_data->>'plan_mode','hybrid') not in ('quantitative','qualitative','hybrid')
    or (p_plan_data ? 'nutritionist_id' and (p_plan_data->>'nutritionist_id')::uuid<>auth.uid()) then
    raise exception using errcode='22023',message='invalid_meal_plan_payload';
  end if;
  if coalesce((p_plan_data->>'is_active')::boolean,false) then
    raise exception using errcode='22023',message='create_plan_inactive_then_finalize';
  end if;
  v_episode:=private.resolve_active_care_episode(v_patient);
  if not private.can_write_active_meal_plan(v_patient,auth.uid(),v_episode) then
    raise exception using errcode='42501',message='meal_plan_write_forbidden';
  end if;
  insert into public.meal_plans
    (patient_id,nutritionist_id,care_episode_id,name,description,active_days,
     start_date,end_date,is_active,plan_mode,prescription_status)
  values
    (v_patient,auth.uid(),v_episode,v_name,nullif(btrim(p_plan_data->>'description'),''),
     v_days,coalesce((p_plan_data->>'start_date')::date,current_date),
     nullif(p_plan_data->>'end_date','')::date,false,
     coalesce(p_plan_data->>'plan_mode','hybrid'),'draft')
  returning id into v_plan_id;
  return v_plan_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_my_data_subject_request(p_request_type text, p_subject_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_id uuid;v_note text:=nullif(btrim(p_subject_note),'');
begin
 perform private.wave05_require_active_actor();

 if v_actor is null or not exists(select 1 from public.user_profiles where id=v_actor and user_type='patient') then raise exception using errcode='42501',message='patient_request_only';end if;
 if p_request_type not in('access','portability','correction','deletion','revocation','objection') then raise exception using errcode='22023',message='invalid_data_subject_request_type';end if;
 if length(coalesce(v_note,''))>1000 then raise exception using errcode='22023',message='data_subject_request_note_too_long';end if;
 begin
  insert into public.data_subject_requests(subject_id,request_type,subject_note)values(v_actor,p_request_type,v_note)returning id into v_id;
 exception when unique_violation then raise exception using errcode='23505',message='active_data_subject_request_already_exists';end;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,to_status,reason)values(v_id,v_actor,'submitted','submitted','SolicitaÃ§Ã£o criada pelo titular');
 insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('data_subject_request_submitted',now(),jsonb_build_object('request_id',v_id,'request_type',p_request_type),v_actor,'privacy',v_actor);
 return jsonb_build_object('id',v_id,'status','submitted','request_type',p_request_type);
end$function$;
CREATE OR REPLACE FUNCTION public.create_offline_patient_atomic(p_request_id uuid, p_nutritionist_id uuid, p_patient_id uuid, p_invite_code text, p_email text, p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing private.offline_patient_requests%rowtype;
  inserted boolean := false;
  affected bigint;
begin
 perform private.wave05_require_active_actor();

  if p_request_id is null or p_nutritionist_id is null or p_patient_id is null
    or p_invite_code !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    or jsonb_typeof(p_profile) <> 'object'
    or nullif(trim(p_profile->>'name'), '') is null then
    raise exception 'invalid_offline_patient_request' using errcode = '22023';
  end if;

  insert into private.offline_patient_requests
    (request_id, nutritionist_id, patient_id, invite_code)
  values (p_request_id, p_nutritionist_id, p_patient_id, p_invite_code)
  on conflict (request_id) do nothing;
  get diagnostics affected = row_count;
  inserted := affected = 1;

  select * into existing from private.offline_patient_requests where request_id = p_request_id;
  if existing.nutritionist_id <> p_nutritionist_id then
    raise exception 'offline_patient_request_owner_mismatch' using errcode = '42501';
  end if;
  if not inserted then
    return jsonb_build_object('userId', existing.patient_id, 'inviteCode', existing.invite_code);
  end if;

  insert into public.user_profiles (
    id, name, email, birth_date, user_type, nutritionist_id,
    patient_invite_code, is_active, phone, cpf, gender, occupation,
    civil_status, observations, address, needs_password_reset
  ) values (
    p_patient_id, p_profile->>'name', nullif(trim(p_email), ''),
    nullif(p_profile->>'birth_date', '')::date, 'patient', p_nutritionist_id,
    p_invite_code, true, nullif(p_profile->>'phone', ''), nullif(p_profile->>'cpf', ''),
    nullif(p_profile->>'gender', ''), nullif(p_profile->>'occupation', ''),
    nullif(p_profile->>'civil_status', ''), nullif(p_profile->>'observations', ''),
    case when jsonb_typeof(p_profile->'address') = 'object' then p_profile->'address' else null end,
    true
  );

  insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
  values (p_nutritionist_id, p_patient_id, 'active');

  return jsonb_build_object('userId', p_patient_id, 'inviteCode', p_invite_code);
end;
$function$;
CREATE OR REPLACE FUNCTION public.end_student_supervision(p_supervision_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_row public.student_supervisions%rowtype; v_recipient uuid;
begin
 perform private.wave05_require_active_actor();

  if length(btrim(coalesce(p_reason,'')))<5 then raise exception using errcode='22023',message='decision_reason_required'; end if;
  select * into v_row from public.student_supervisions where id=p_supervision_id for update;
  if not found then raise exception using errcode='P0002',message='supervision_not_found'; end if;
  if v_actor not in (v_row.student_id,v_row.supervisor_id) then raise exception using errcode='42501',message='supervision_participant_required'; end if;
  if v_row.status<>'active' then raise exception using errcode='55000',message='invalid_supervision_transition'; end if;
  update public.student_supervisions set status='ended',ended_at=now(),end_reason=btrim(p_reason),updated_at=now() where id=p_supervision_id;
  insert into public.student_supervision_events(supervision_id,student_id,supervisor_id,actor_id,from_status,to_status,reason)
  values(v_row.id,v_row.student_id,v_row.supervisor_id,v_actor,v_row.status,'ended',btrim(p_reason));
  v_recipient:=case when v_actor=v_row.student_id then v_row.supervisor_id else v_row.student_id end;
  insert into public.notifications(user_id,type,title,message,content)
  values(v_recipient,'student_supervision_ended','Supervisão encerrada','O vínculo de supervisão foi encerrado.',jsonb_build_object('supervision_id',v_row.id));
  return jsonb_build_object('success',true,'status','ended');
end;
$function$;
CREATE OR REPLACE FUNCTION public.expire_clinical_attachment_uploads(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
 perform private.wave05_require_active_actor();

  if p_limit is null or p_limit<1 or p_limit>1000 then
    raise exception using errcode='22023',message='invalid_expiration_limit';
  end if;
  perform set_config('app.clinical_attachment_reason','upload_intent_expired',true);
  with expired as (
    select a.id from public.clinical_attachments a
    where a.status='uploading' and a.upload_confirmed_at is null and a.upload_expires_at<=now()
    order by a.upload_expires_at,a.id
    for update skip locked limit p_limit
  )
  update public.clinical_attachments a set status='upload_failed'
  from expired e where a.id=e.id;
  get diagnostics v_count=row_count;
  return v_count;
end
$function$;
CREATE OR REPLACE FUNCTION public.expire_document_asset_uploads(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer;
begin
 perform private.wave05_require_active_actor();

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'invalid_expiration_limit';
  end if;
  with expired as (
    select id from public.document_asset_uploads
    where status = 'uploading' and expires_at <= now()
    order by expires_at, id for update skip locked limit p_limit
  )
  update public.document_asset_uploads u
  set status = 'expired', failure_code = 'upload_expired'
  from expired e where u.id = e.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
CREATE OR REPLACE FUNCTION public.extract_and_inject_clinical_flags(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_record record;
  v_new_flags jsonb := '{}'::jsonb;
  v_field record;
  v_section record;
  v_answer text;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select r.*, t.sections
  into v_record
  from public.anamnesis_records r
  left join public.anamnesis_templates t on t.id = r.template_id
  where r.id = p_record_id
    and r.nutritionist_id = auth.uid();

  if not found then
    raise exception 'Acesso negado.';
  end if;

  for v_section in
    select * from jsonb_array_elements(coalesce(v_record.sections, '[]'::jsonb)) s
  loop
    for v_field in
      select * from jsonb_array_elements(coalesce(v_section.value->'fields', '[]'::jsonb)) f
    loop
      if v_field.value->>'clinical_flag_key' is not null then
        v_answer := v_record.content->>(v_field.value->>'id');
        if v_answer is not null
           and v_answer <> ''
           and v_answer not in ('false', 'nao', 'não') then
          v_new_flags := v_new_flags || jsonb_build_object(
            v_field.value->>'clinical_flag_key',
            jsonb_build_object(
              'value', v_answer,
              'label', v_field.value->>'label',
              'captured_at', now()::text,
              'source', 'anamnesis',
              'record_id', p_record_id::text
            )
          );
        end if;
      end if;
    end loop;
  end loop;

  if v_new_flags <> '{}'::jsonb then
    update public.user_profiles
    set clinical_flags = coalesce(clinical_flags, '{}'::jsonb) || v_new_flags
    where id = v_record.patient_id;
  end if;

  return jsonb_build_object('success', true, 'flags_injected', v_new_flags);
end;
$function$;
CREATE OR REPLACE FUNCTION public.fail_clinical_attachment_upload(p_attachment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=btrim(p_reason);
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if v_reason is null or v_reason !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception using errcode='22023',message='invalid_upload_failure_code';
  end if;

  select a.* into v_attachment from public.clinical_attachments a
  where a.id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='upload_intent_not_found'; end if;
  if v_attachment.author_id<>v_actor then
    raise exception using errcode='42501',message='upload_failure_forbidden';
  end if;
  if v_attachment.status<>'uploading' or v_attachment.upload_confirmed_at is not null then
    raise exception 'upload_already_finalized';
  end if;

  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set status='upload_failed' where id=v_attachment.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,'status','upload_failed');
end
$function$;
CREATE OR REPLACE FUNCTION public.fail_document_asset_upload(p_upload_id uuid, p_failure_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_code text := nullif(btrim(p_failure_code), '');
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if v_code is null or v_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception using errcode = '22023', message = 'invalid_document_asset_failure_code';
  end if;
  update public.document_asset_uploads
  set status = 'failed', failure_code = v_code
  where id = p_upload_id and professional_id = v_actor and status = 'uploading';
  if not found then raise exception using errcode = '42501', message = 'document_asset_failure_forbidden'; end if;
  return jsonb_build_object('success', true, 'upload_id', p_upload_id, 'status', 'failed');
end;
$function$;
CREATE OR REPLACE FUNCTION public.finalize_clinical_record(p_record_id uuid, p_content jsonb, p_expected_revision bigint DEFAULT NULL::bigint, p_retrospective_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_hash text;
  v_filled_sections integer;
  v_template_sections jsonb;
  v_reason text;
  v_canonical jsonb;
  v_episode_status text;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status<>'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_finalized'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction' and status='draft';
  v_is_correction:=found;

  if v_is_correction then
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'finalize') then
      raise exception using errcode='42501',message='correction_finalize_forbidden';
    end if;
  else
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if v_record.student_id is not null then
      if v_actor<>v_record.supervisor_id then
        raise exception using errcode='42501',message='supervisor_required_to_finalize'; end if;
    elsif v_actor<>v_record.author_id or v_actor<>v_record.nutritionist_id then
      raise exception using errcode='42501',message='finalize_forbidden';
    end if;
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  v_filled_sections:=private.validate_clinical_record_content(p_content,v_template_sections,true);
  v_reason:=nullif(btrim(coalesce(p_retrospective_reason,v_record.retrospective_reason,'')),'');
  if v_record.encounter_at<v_record.created_at-interval '5 minutes'
    and (v_reason is null or length(v_reason) not between 10 and 500) then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if v_reason is not null and length(v_reason)>500 then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;

  v_canonical:=private.clinical_record_canonical_payload(v_record,p_content,v_reason);
  v_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  update public.clinical_records set
    content=p_content,status='finalized',canonical_hash=v_hash,
    retrospective_reason=v_reason,revision=revision+1,updated_at=now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then raise exception using errcode='40001',message='draft_revision_conflict'; end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','finalized',v_actor,jsonb_build_object(
    'canonical_hash',v_hash,'canonical_format_version',v_record.canonical_format_version,
    'filled_sections',v_filled_sections,
    'amendment_id',case when v_is_correction then v_amendment.id else null end));
  return private.project_clinical_evolution_record(v_updated);
end
$function$;
CREATE OR REPLACE FUNCTION public.finalize_document_artifact(p_artifact_id uuid, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.document_artifacts%rowtype;v_p public.user_profiles%rowtype;v_c jsonb;v_hash text;
begin
 perform private.wave05_require_active_actor();

 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or not private.can_manage_document_artifact(p_artifact_id) then raise exception using errcode='42501',message='document_artifact_finalize_forbidden';end if;
 if v_a.status<>'draft' then raise exception using errcode='23514',message='only_draft_document_can_finalize';end if;
 if p_expected_revision is distinct from v_a.revision then raise exception using errcode='40001',message='document_artifact_revision_conflict';end if;
 select * into v_p from public.user_profiles where id=v_a.patient_id;
 v_c:=private.compose_document_payload(v_a.layout_code,v_a.layout_version,v_a.identity_id,
   jsonb_strip_nulls(jsonb_build_object('id',v_p.id,'name',v_p.name,'birth_date',v_p.birth_date)),
   v_a.draft_payload,jsonb_build_object('artifact_id',v_a.id,'source_type',v_a.source_type,'source_id',v_a.source_id,'visibility',v_a.visibility,'created_at',v_a.created_at));
 v_hash:=encode(extensions.digest(convert_to(v_c::text,'UTF8'),'sha256'),'hex');
 update public.document_artifacts set status='finalized',canonical_payload=v_c,canonical_sha256=v_hash,finalized_at=now(),finalized_by=auth.uid(),revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,auth.uid(),'finalized','draft','finalized','document_finalized',jsonb_build_object('sha256',v_hash));
 return jsonb_build_object('artifact_id',v_a.id,'status','finalized','revision',v_a.revision+1,'sha256',v_hash);
end$function$;
CREATE OR REPLACE FUNCTION public.generate_anamnesis_link(p_record_id uuid, p_nutritionist_id uuid, p_expires_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token uuid;
  v_expires_at timestamptz;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null or auth.uid() is distinct from p_nutritionist_id then
    raise exception 'Acesso negado.';
  end if;
  if p_expires_days not between 1 and 30 then
    raise exception 'Prazo inválido.';
  end if;
  if not exists (
    select 1
    from public.anamnesis_records
    where id = p_record_id
      and nutritionist_id = auth.uid()
  ) then
    raise exception 'Acesso negado.';
  end if;

  v_token := gen_random_uuid();
  v_expires_at := now() + (p_expires_days || ' days')::interval;
  update public.anamnesis_records
  set public_access_token = v_token,
      token_expires_at = v_expires_at,
      status = case when status = 'draft' then 'pending_patient' else status end,
      updated_at = now()
  where id = p_record_id;

  return jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'status', 'pending_patient'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return private.get_admin_dashboard_stats();
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_clinical_record_amendment_impact(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_snapshot jsonb;
  v_hash text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found or not private.can_start_clinical_record_correction(p_record_id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  v_snapshot:=private.build_clinical_record_amendment_impact(v_record);
  v_hash:=encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex');
  return v_snapshot || jsonb_build_object('impact_hash',v_hash);
end
$function$;
CREATE OR REPLACE FUNCTION public.get_document_artifact(p_artifact_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_a public.document_artifacts%rowtype;begin
 perform private.wave05_require_active_actor();
 if auth.uid()is null then raise exception using errcode='42501',message='authentication_required';end if;select*into v_a from public.document_artifacts where id=p_artifact_id;if not found then raise exception using errcode='P0002',message='document_artifact_not_found';end if;if auth.uid()=v_a.patient_id then if v_a.status not in('signed','invalidated','superseded')or v_a.visibility<>'shared_with_patient'then raise exception using errcode='42501',message='document_artifact_read_forbidden';end if;elsif auth.uid()not in(v_a.professional_id,v_a.preparer_id,coalesce(v_a.supervisor_id,v_a.professional_id))then raise exception using errcode='42501',message='document_artifact_read_forbidden';end if;return jsonb_strip_nulls(jsonb_build_object('id',v_a.id,'status',v_a.status,'visibility',v_a.visibility,'revision',v_a.revision,'source_type',v_a.source_type,'source_id',v_a.source_id,'source_key',v_a.source_key,'patient_id',v_a.patient_id,'care_episode_id',v_a.care_episode_id,'professional_id',v_a.professional_id,'preparer_id',v_a.preparer_id,'supervisor_id',v_a.supervisor_id,'canonical_payload',v_a.canonical_payload,'sha256',v_a.canonical_sha256,'signed_at',v_a.signed_at,'authenticity_code',v_a.authenticity_code,'invalidation_reason',v_a.invalidation_reason));end$function$;
CREATE OR REPLACE FUNCTION public.get_my_document_asset_preview(p_asset_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_identity public.professional_document_identities%rowtype;
  v_path text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_asset_type not in ('logo', 'visual_signature', 'stamp') then
    raise exception using errcode = '22023', message = 'invalid_document_asset_type';
  end if;
  select * into v_identity from public.professional_document_identities
  where professional_id = v_actor and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'active_document_identity_not_found'; end if;
  v_path := case p_asset_type
    when 'logo' then v_identity.logo_storage_path
    when 'visual_signature' then v_identity.signature_storage_path
    else v_identity.stamp_storage_path end;
  return jsonb_build_object(
    'available', v_path is not null,
    'asset_type', p_asset_type,
    'storage_bucket', case when v_path is not null then 'document-assets' end,
    'storage_path', v_path,
    'expires_in', 300
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_my_document_identity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_verification public.professional_verifications%rowtype;
  v_identity public.professional_document_identities%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select * into v_profile from public.user_profiles where id = v_actor;
  if not found then
    raise exception using errcode = '42501', message = 'profile_not_found';
  end if;
  if v_profile.user_type is distinct from 'nutritionist' then
    raise exception using errcode = '42501', message = 'document_identity_professional_only';
  end if;

  select * into v_verification
  from public.professional_verifications
  where user_id = v_actor;

  select * into v_identity
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active';

  if found then
    return jsonb_strip_nulls(jsonb_build_object(
      'source', 'saved',
      'id', v_identity.id,
      'version', v_identity.version,
      'professional_name', v_identity.professional_name,
      'clinic_name', v_identity.clinic_name,
      'professional_email', v_identity.professional_email,
      'professional_phone', v_identity.professional_phone,
      'address_line', v_identity.address_line,
      'address_city', v_identity.address_city,
      'address_state', v_identity.address_state,
      'address_postal_code', v_identity.address_postal_code,
      'primary_color', v_identity.primary_color,
      'accent_color', v_identity.accent_color,
      'header_text', v_identity.header_text,
      'footer_text', v_identity.footer_text,
      'crn_region', v_identity.crn_region,
      'crn_number', v_identity.crn_number,
      'normalized_crn', v_identity.normalized_crn,
      'verification_status', v_verification.status,
      'can_sign', coalesce(v_verification.professional_role = 'nutritionist'
        and v_verification.status = 'approved'
        and v_verification.valid_until > now()
        and v_identity.normalized_crn is not null, false),
      'assets', jsonb_build_object(
        'has_logo', v_identity.logo_storage_path is not null,
        'has_visual_signature', v_identity.signature_storage_path is not null,
        'has_stamp', v_identity.stamp_storage_path is not null
      ),
      'created_at', v_identity.created_at
    ));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'source', 'profile_default',
    'version', 0,
    'professional_name', v_profile.name,
    'professional_email', v_profile.email,
    'professional_phone', v_profile.phone,
    'primary_color', '#4F8A3C',
    'accent_color', '#7DAF69',
    'crn_region', case when v_verification.status = 'approved' then v_verification.crn_region end,
    'crn_number', case when v_verification.status = 'approved' then v_verification.crn_number end,
    'normalized_crn', case when v_verification.status = 'approved' then v_verification.normalized_crn end,
    'verification_status', coalesce(v_verification.status, 'not_submitted'),
    'can_sign', coalesce(v_verification.professional_role = 'nutritionist'
      and v_verification.status = 'approved'
      and v_verification.valid_until > now()
      and v_verification.normalized_crn is not null, false),
    'assets', jsonb_build_object('has_logo', false, 'has_visual_signature', false, 'has_stamp', false)
  ));
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_nutritionist_detail(p_nutritionist_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return private.get_nutritionist_detail(p_nutritionist_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_nutritionists_list()
 RETURNS TABLE(id uuid, name text, email text, created_at timestamp with time zone, is_active boolean, patients_count bigint, last_activity timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return query select * from private.get_nutritionists_list();
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_patient_record_foundation(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_result jsonb;
  v_episode uuid;
  v_episode_status text;
  v_can_write boolean:=false;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if v_actor<>p_patient_id and not exists (
    select 1 from public.care_episodes e
    where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)
  ) then
    raise exception using errcode='42501',message='patient_record_read_forbidden';
  end if;

  select e.id,e.status into v_episode,v_episode_status
  from public.care_episodes e
  where e.patient_id=p_patient_id and private.can_read_care_episode(e.id)
  order by (e.nutritionist_id=v_actor) desc,e.status='active' desc,e.started_at desc
  limit 1;
  if v_episode is not null then
    v_can_write:=private.can_write_active_care_episode(v_episode);
  end if;

  select jsonb_build_object(
    'viewed_episode_id',v_episode,
    'viewed_episode_status',v_episode_status,
    'writable_episode_id',case when v_can_write then v_episode else null end,
    'can_write',v_can_write,
    'patient',jsonb_build_object(
      'id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,
      'gender',p.gender,'email',p.email,'occupation',p.occupation,
      'civil_status',p.civil_status,'address',p.address
    ),
    'records',coalesce(
      case when v_actor=p_patient_id then (
        select jsonb_agg(private.project_patient_clinical_record(official) order by official.encounter_at desc)
        from (
          select distinct on (r.root_record_id) r.*
          from public.clinical_records r
          where r.patient_id=p_patient_id
            and private.is_patient_visible_clinical_record(r.id)
          order by r.root_record_id,r.chain_version desc
        ) official
      ) else (
        select jsonb_agg(to_jsonb(r) order by r.encounter_at desc)
        from public.clinical_records r
        where r.patient_id=p_patient_id and private.can_read_clinical_record(r.id)
      ) end,
      '[]'::jsonb
    )
  ) into v_result
  from public.user_profiles p
  where p.id=p_patient_id and p.user_type='patient';

  if v_result is null then
    raise exception using errcode='P0002',message='patient_not_found';
  end if;
  return v_result;
end
$function$;
CREATE OR REPLACE FUNCTION public.get_system_live_logs(limit_count integer DEFAULT 50)
 RETURNS TABLE(id text, type text, message text, user_name text, event_timestamp timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return query select * from private.get_system_live_logs(least(greatest(limit_count, 1), 100));
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_tcc_study_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if not private.is_admin() then raise exception using errcode='42501', message='admin_mfa_required'; end if;
  return private.get_tcc_study_metrics();
end;
$function$;
CREATE OR REPLACE FUNCTION public.invalidate_anthropometry_record(p_record_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.growth_records%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='invalidation_reason_required';end if;select*into v from public.growth_records where id=p_record_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)then raise exception using errcode='42501',message='anthropometry_invalidation_forbidden';end if;if v.status='invalidated'then return jsonb_build_object('id',v.id,'status','invalidated','already_invalidated',true);end if;update public.growth_records set status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,is_latest_revision=false where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('anthropometry.record.invalidated',now(),jsonb_build_object('record_id',v.id,'reason',v_reason),v.patient_id,'anthropometry',auth.uid());return jsonb_build_object('id',v.id,'status','invalidated');end$function$;
CREATE OR REPLACE FUNCTION public.invalidate_clinical_attachment(p_attachment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(coalesce(v_reason,''))<10 then
    raise exception using errcode='22023',message='attachment_invalidation_reason_required';
  end if;
  select * into v_attachment from public.clinical_attachments where id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_attachment.status not in ('pending_review','active','quarantined') then
    raise exception using errcode='23514',message='attachment_cannot_be_invalidated';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_invalidation_forbidden';
  end if;
  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments
    set status='invalidated',invalidation_reason=v_reason,invalidated_at=now()
    where id=v_attachment.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,'status','invalidated');
end
$function$;
CREATE OR REPLACE FUNCTION public.invalidate_clinical_record(p_record_id uuid, p_reason text, p_impact_confirmation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_target public.clinical_records%rowtype;
  v_impact jsonb;
  v_impact_hash text;
  v_auth_evidence jsonb;
  v_amendment_id uuid:=gen_random_uuid();
  v_effective_at timestamptz:=clock_timestamp();
  v_amendment_hash text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='amendment_reason_length_invalid';
  end if;
  if jsonb_typeof(p_impact_confirmation) is distinct from 'object'
    or coalesce((p_impact_confirmation->>'confirmed')::boolean,false) is not true then
    raise exception using errcode='22023',message='amendment_impact_confirmation_required';
  end if;
  v_auth_evidence:=private.current_recent_authentication_evidence();

  select * into v_target from public.clinical_records where id=p_record_id;
  if not found then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;
  if private.clinical_record_signed_by(v_target.id) is distinct from v_actor then
    raise exception using errcode='42501',message='clinical_record_invalidation_forbidden';
  end if;
  if v_target.status<>'signed' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  perform r.id from public.clinical_records r
  where r.id in (v_target.root_record_id,v_target.id)
  order by r.id for update;
  select * into v_target from public.clinical_records where id=p_record_id;
  if private.clinical_record_signed_by(v_target.id) is distinct from v_actor then
    raise exception using errcode='42501',message='clinical_record_invalidation_forbidden';
  end if;
  if v_target.status<>'signed' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  if exists (
    select 1 from public.clinical_record_amendments a
    where a.root_record_id=v_target.root_record_id
      and a.amendment_type='correction' and a.status='draft'
  ) then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  v_impact:=private.build_clinical_record_amendment_impact(v_target);
  v_impact_hash:=encode(
    extensions.digest(convert_to(v_impact::text,'UTF8'),'sha256'),'hex'
  );
  if p_impact_confirmation->>'impact_hash' is distinct from v_impact_hash then
    raise exception using errcode='40001',message='amendment_impact_changed';
  end if;
  v_amendment_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'amendment_id',v_amendment_id,'amendment_type','invalidation',
    'root_record_id',v_target.root_record_id,'target_record_id',v_target.id,
    'reason',v_reason,'impact_hash',v_impact_hash,'responsible_id',v_actor,
    'effective_at',v_effective_at,'authentication_evidence',v_auth_evidence
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.clinical_record_amendments(
    id,patient_id,care_episode_id,root_record_id,target_record_id,replacement_record_id,
    amendment_type,status,reason,impact_snapshot,impact_hash,actor_id,responsible_id,
    authentication_evidence,canonical_hash,effective_at
  ) values (
    v_amendment_id,v_target.patient_id,v_target.care_episode_id,v_target.root_record_id,
    v_target.id,null,'invalidation','effective',v_reason,v_impact,v_impact_hash,
    v_actor,v_actor,v_auth_evidence,v_amendment_hash,v_effective_at
  );

  perform set_config('nello.c4_transition_target',v_target.id::text,true);
  perform set_config('nello.c4_transition_status','invalidated',true);
  update public.clinical_records set status='invalidated',updated_at=now()
  where id=v_target.id and status='signed';
  if not found then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  perform set_config('nello.c4_transition_target','',true);
  perform set_config('nello.c4_transition_status','',true);

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_target.id,'signed','invalidated',v_actor,v_reason,
    jsonb_build_object('amendment_id',v_amendment_id)
  );
  insert into public.activity_log(
    event_name,patient_id,nutritionist_id,actor_user_id,source_module,payload
  ) values (
    'clinical_record.invalidated',v_target.patient_id,v_target.nutritionist_id,
    v_actor,'clinical_records',jsonb_build_object(
      'amendment_id',v_amendment_id,'clinical_record_id',v_target.id,
      'care_episode_id',v_target.care_episode_id
    )
  );
  if v_target.visibility='shared_with_patient' then
    insert into public.notifications(user_id,type,title,message,content)
    values (
      v_target.patient_id,'clinical_record_invalidated','Registro clínico atualizado',
      'Seu nutricionista atualizou um registro compartilhado.',
      jsonb_build_object('amendment_id',v_amendment_id,
        'clinical_record_id',v_target.id,'care_episode_id',v_target.care_episode_id)
    ) on conflict do nothing;
  end if;
  return jsonb_build_object(
    'amendment_id',v_amendment_id,'status','effective',
    'record_id',v_target.id,'record_status','invalidated','effective_at',v_effective_at
  );
exception
  when unique_violation then
    raise exception using errcode='40001',message='amendment_chain_conflict';
end
$function$;
CREATE OR REPLACE FUNCTION public.invalidate_document_artifact(p_artifact_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.document_artifacts%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();

 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='document_invalidation_reason_required';end if;
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or auth.uid()<>v_a.professional_id or not private.can_manage_document_artifact(v_a.id) then raise exception using errcode='42501',message='document_invalidation_forbidden';end if;
 if v_a.status<>'signed' then raise exception using errcode='23514',message='only_signed_document_can_be_invalidated';end if;
 update public.document_artifacts set status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason)values(v_a.id,auth.uid(),'invalidated','signed','invalidated',v_reason);
 return jsonb_build_object('artifact_id',v_a.id,'status','invalidated','sha256',v_a.canonical_sha256);
end$function$;
CREATE OR REPLACE FUNCTION public.invalidate_lab_result_record(p_result_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.lab_results%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='invalidation_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)then raise exception using errcode='42501',message='lab_invalidation_forbidden';end if;if v.record_status='invalidated' then return jsonb_build_object('id',v.id,'status','invalidated','already_invalidated',true);end if;update public.lab_results set record_status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,is_latest_revision=false where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.result.invalidated',now(),jsonb_build_object('result_id',v.id,'reason',v_reason),v.patient_id,'laboratory',auth.uid());return jsonb_build_object('id',v.id,'status','invalidated');end$function$;
CREATE OR REPLACE FUNCTION public.invalidate_progress_photo(p_photo_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_photo public.progress_photos%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo da invalidação.' using errcode = '22023';
  end if;

  select * into v_photo
  from public.progress_photos
  where id = p_photo_id
  for update;

  if not found then
    raise exception 'Foto não encontrada.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.care_episodes episode
    where episode.id = v_photo.care_episode_id
      and (episode.patient_id = v_actor or episode.nutritionist_id = v_actor)
  ) then
    raise exception 'Você não tem permissão para invalidar esta foto.' using errcode = '42501';
  end if;

  if v_photo.status = 'invalidated' then
    return jsonb_build_object('success', true, 'already_invalidated', true, 'photo_id', v_photo.id);
  end if;

  update public.progress_photos
  set status = 'invalidated',
      invalidated_at = now(),
      invalidated_by = v_actor,
      invalidation_reason = trim(p_reason)
  where id = v_photo.id;

  return jsonb_build_object('success', true, 'already_invalidated', false, 'photo_id', v_photo.id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.link_checkin_template(p_template_id uuid, p_patient_id uuid, p_channel text DEFAULT 'in_app'::text, p_time_zone text DEFAULT 'America/Fortaleza'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_template public.checkin_templates%rowtype;
  v_episode uuid;
  v_schedule uuid;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception 'CHECKIN_AUTH_REQUIRED'; end if;
  if p_channel <> 'in_app' then raise exception 'CHECKIN_CHANNEL_UNAVAILABLE'; end if;
  select * into v_template from public.checkin_templates
  where id = p_template_id and nutritionist_id = auth.uid() and is_active is true;
  if not found then raise exception 'CHECKIN_TEMPLATE_UNAVAILABLE'; end if;
  if not exists (select 1 from public.checkin_fields where template_id = p_template_id) then
    raise exception 'CHECKIN_WITHOUT_FIELDS';
  end if;
  select id into v_episode from public.care_episodes
  where patient_id = p_patient_id and nutritionist_id = auth.uid()
    and status = 'active' and coalesce(is_simulation, false) = false
  order by started_at desc limit 1;
  if v_episode is null then raise exception 'CHECKIN_ACTIVE_EPISODE_REQUIRED'; end if;
  insert into public.checkin_schedules(
    template_id, patient_id, nutritionist_id, care_episode_id,
    next_send_at, time_zone, channel, is_active
  ) values (
    p_template_id, p_patient_id, auth.uid(), v_episode,
    private.next_checkin_send_at(v_template.frequency, v_template.send_days,
      v_template.send_time, p_time_zone, now()), p_time_zone, 'in_app', true
  ) on conflict (template_id, patient_id) do update set
    nutritionist_id = excluded.nutritionist_id,
    care_episode_id = excluded.care_episode_id,
    next_send_at = excluded.next_send_at,
    time_zone = excluded.time_zone,
    channel = 'in_app', is_active = true
  returning id into v_schedule;
  return v_schedule;
end;
$function$;
CREATE OR REPLACE FUNCTION public.list_clinical_attachments_by_episode(p_patient_id uuid, p_episode_id uuid, p_status text, p_cursor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_items jsonb;
  v_next_cursor text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_patient_id is null or p_episode_id is null then
    raise exception using errcode='22023',message='patient_and_episode_required';
  end if;
  if p_status is not null and p_status not in (
    'uploading','pending_review','active','superseded','invalidated','quarantined','upload_failed'
  ) then raise exception using errcode='22023',message='attachment_status_filter_invalid'; end if;

  if not exists(
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.patient_id=p_patient_id
      and v_actor<>e.patient_id
      and v_actor in (e.nutritionist_id,e.student_id,e.supervisor_id)
  ) then raise exception using errcode='42501',message='attachment_list_forbidden'; end if;

  if p_cursor is not null then
    begin
      v_cursor_at:=(p_cursor::jsonb->>'created_at')::timestamptz;
      v_cursor_id:=(p_cursor::jsonb->>'id')::uuid;
      if v_cursor_at is null or v_cursor_id is null then raise exception 'invalid'; end if;
    exception when others then
      raise exception using errcode='22023',message='attachment_cursor_invalid';
    end;
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb)
  into v_rows
  from (
    select a.created_at,a.id,jsonb_build_object(
      'id',a.id,'patient_id',a.patient_id,'care_episode_id',a.care_episode_id,
      'clinical_record_id',a.clinical_record_id,'root_attachment_id',a.root_attachment_id,
      'version',a.version,'replaces_attachment_id',a.replaces_attachment_id,
      'category_code',a.category_code,'category_label',c.label,
      'description',a.description,'clinical_date',a.clinical_date,'source',a.source,
      'author_id',a.author_id,'reviewed_by',a.reviewed_by,'reviewed_at',a.reviewed_at,
      'original_filename',a.original_filename,'mime_type',a.mime_type,
      'size_bytes',a.size_bytes,'sha256',a.sha256,'status',a.status,
      'visibility',a.visibility,'created_at',a.created_at,'updated_at',a.updated_at,
      'invalidated_at',a.invalidated_at,'invalidation_reason',a.invalidation_reason
    ) as row_data
    from public.clinical_attachments a
    join public.clinical_attachment_categories c on c.code=a.category_code
    where a.patient_id=p_patient_id and a.care_episode_id=p_episode_id
      and (p_status is null or a.status=p_status)
      and (v_cursor_at is null or (a.created_at,a.id)<(v_cursor_at,v_cursor_id))
    order by a.created_at desc,a.id desc
    limit 51
  ) page;

  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_rows) with ordinality
  where ordinality<=50;

  if jsonb_array_length(v_rows)>50 then
    v_next_cursor:=jsonb_build_object(
      'created_at',v_items->49->>'created_at','id',v_items->49->>'id'
    )::text;
  end if;

  return jsonb_build_object(
    'items',v_items,'next_cursor',v_next_cursor,'has_more',v_next_cursor is not null
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.list_clinical_record_version_chain(p_record_id uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=(select auth.uid());
  v_root uuid;
  v_patient uuid;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select r.root_record_id,r.patient_id into v_root,v_patient
  from public.clinical_records r where r.id=p_record_id;
  if not found or not private.can_read_clinical_record(p_record_id) then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;

  if v_actor=v_patient then
    return query
    select private.project_patient_clinical_record(r)
    from public.clinical_records r
    where r.root_record_id=v_root
      and private.is_patient_visible_clinical_record(r.id)
    order by r.chain_version desc;
  else
    return query
    select private.project_clinical_record_chain_item(r)
    from public.clinical_records r
    where r.root_record_id=v_root
      and private.can_read_clinical_record(r.id)
    order by r.chain_version desc;
  end if;
end
$function$;
CREATE OR REPLACE FUNCTION public.list_clinical_records_by_episode(p_patient_id uuid, p_episode_id uuid, p_status_filter text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid());
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if not private.can_read_care_episode(p_episode_id) or not exists (
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.patient_id=p_patient_id
  ) then
    raise exception using errcode='42501',message='episode_read_forbidden';
  end if;

  if v_actor=p_patient_id then
    return query
    select private.project_patient_clinical_record(r)
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and private.is_patient_visible_clinical_record(r.id)
      and (p_status_filter is null or r.status=p_status_filter)
    order by r.encounter_at desc,r.created_at desc;
  else
    return query
    select private.project_clinical_evolution_record(r)
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and private.can_read_clinical_record(r.id)
      and (p_status_filter is null or r.status=p_status_filter)
    order by r.encounter_at desc,r.created_at desc;
  end if;
end
$function$;
CREATE OR REPLACE FUNCTION public.list_data_subject_requests(p_status text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

 if not private.is_admin() then raise exception using errcode='42501',message='admin_required';end if;
 if p_status is not null and p_status not in('submitted','triaged','in_progress','fulfilled','rejected','cancelled') then raise exception using errcode='22023',message='invalid_request_status';end if;
 return query select jsonb_strip_nulls(jsonb_build_object('id',r.id,'subject_id',r.subject_id,'subject_name',p.name,'subject_email',p.email,'request_type',r.request_type,'status',r.status,'subject_note',r.subject_note,'assigned_to',r.assigned_to,'due_at',r.due_at,'resolution_summary',r.resolution_summary,'legal_basis',r.legal_basis,'retention_decision',r.retention_decision,'created_at',r.created_at,'updated_at',r.updated_at,'completed_at',r.completed_at,'revision',r.revision))
 from public.data_subject_requests r join public.user_profiles p on p.id=r.subject_id
 where p_status is null or r.status=p_status order by case when r.status in('submitted','triaged','in_progress')then 0 else 1 end,r.due_at,r.created_at;
end$function$;
CREATE OR REPLACE FUNCTION public.list_evolution_templates()
 RETURNS SETOF clinical_evolution_templates
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  return query select t.* from public.clinical_evolution_templates t
  where t.is_active and (t.category='system' or t.owner_id=(select auth.uid()))
  order by t.category='system' desc, t.name;
end $function$;
CREATE OR REPLACE FUNCTION public.list_my_clinical_documents(p_care_episode_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_items jsonb;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not exists(select 1 from public.care_episodes e
    where e.id=p_care_episode_id and e.patient_id=v_actor) then
    raise exception using errcode='42501',message='patient_attachment_list_forbidden';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'category_code',a.category_code,'category_label',c.label,
    'description',a.description,'clinical_date',a.clinical_date,'source',a.source,
    'original_filename',a.original_filename,'mime_type',a.mime_type,
    'size_bytes',a.size_bytes,'status',a.status,'visibility',a.visibility,
    'created_at',a.created_at,'reviewed_at',a.reviewed_at,
    'can_open',(a.status='active' and a.visibility='shared_with_patient')
  ) order by a.created_at desc,a.id desc),'[]'::jsonb) into v_items
  from public.clinical_attachments a
  join public.clinical_attachment_categories c on c.code=a.category_code
  where a.care_episode_id=p_care_episode_id and a.patient_id=v_actor
    and a.upload_confirmed_at is not null
    and (
      (a.status='active' and a.visibility='shared_with_patient')
      or (a.source='patient' and a.status in ('pending_review','active','invalidated'))
    );
  return jsonb_build_object('items',v_items);
end
$function$;
CREATE OR REPLACE FUNCTION public.list_patient_clinical_attachments(p_care_episode_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_items jsonb;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_care_episode_id is null then
    raise exception using errcode='22023',message='episode_required';
  end if;
  if not exists(
    select 1 from public.care_episodes e
    where e.id=p_care_episode_id and e.patient_id=v_actor
  ) then raise exception using errcode='42501',message='patient_attachment_list_forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'category_code',a.category_code,'category_label',c.label,
    'description',a.description,'clinical_date',a.clinical_date,'source',a.source,
    'original_filename',a.original_filename,'mime_type',a.mime_type,
    'size_bytes',a.size_bytes,'status',a.status,'visibility',a.visibility,
    'created_at',a.created_at,'reviewed_at',a.reviewed_at
  ) order by coalesce(a.clinical_date,a.created_at::date) desc,a.created_at desc,a.id desc),'[]'::jsonb)
  into v_items
  from public.clinical_attachments a
  join public.clinical_attachment_categories c on c.code=a.category_code
  where a.care_episode_id=p_care_episode_id and a.patient_id=v_actor
    and a.status='active' and a.visibility='shared_with_patient'
    and a.upload_confirmed_at is not null;

  return jsonb_build_object('items',v_items);
end
$function$;
CREATE OR REPLACE FUNCTION public.list_patient_legal_guardians(p_patient_id uuid, p_episode_id uuid)
 RETURNS TABLE(id uuid, patient_id uuid, care_episode_id uuid, author_id uuid, name text, relationship text, contact jsonb, valid_from timestamp with time zone, valid_until timestamp with time zone, consent jsonb, is_primary boolean, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not private.can_read_care_episode(p_episode_id) or not exists(select 1 from public.care_episodes e where e.id=p_episode_id and e.patient_id=p_patient_id) then
    raise exception using errcode='42501',message='episode_read_forbidden'; end if;
  return query select g.id,g.patient_id,g.care_episode_id,g.author_id,g.name,g.relationship,g.contact,
    g.valid_from,g.valid_until,g.consent,g.is_primary,g.status,g.created_at,g.updated_at
    from public.patient_episode_legal_guardians g where g.patient_id=p_patient_id and g.care_episode_id=p_episode_id order by g.created_at;
end $function$;
CREATE OR REPLACE FUNCTION public.list_patient_timeline(p_patient_id uuid, p_episode_id uuid, p_scope text, p_cursor_at timestamp with time zone, p_cursor_event_id text, p_limit integer)
 RETURNS TABLE(event_id text, source_id text, source_type text, category text, subtype text, title text, summary text, occurred_at timestamp with time zone, status text, is_legacy boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid());
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='42501',message='timeline_authentication_required';
  end if;
  if p_patient_id is null or p_episode_id is null then
    raise exception using errcode='22023',message='timeline_context_required';
  end if;
  if p_scope is null or p_scope not in ('clinical','operational','all') then
    raise exception using errcode='22023',message='timeline_scope_invalid';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='timeline_limit_invalid';
  end if;
  if (p_cursor_at is null)<>(p_cursor_event_id is null)
    or (p_cursor_event_id is not null and length(p_cursor_event_id)=0) then
    raise exception using errcode='22023',message='timeline_cursor_invalid';
  end if;
  if not private.can_read_care_episode(p_episode_id) or not exists (
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.patient_id=p_patient_id
  ) then
    raise exception using errcode='42501',message='timeline_forbidden';
  end if;

  return query
  with source_events as (
    select
      'clinical_record:'||r.id::text as event_id,
      r.id::text as source_id,
      'clinical_record'::text as source_type,
      'clinical'::text as category,
      r.record_type::text as subtype,
      case r.record_type
        when 'clinical_evolution' then 'Evolução clínica'
        when 'initial_assessment' then 'Avaliação inicial'
        when 'follow_up' then 'Acompanhamento clínico'
        when 'intercurrence' then 'Intercorrência'
        else 'Registro clínico'
      end::text as title,
      case
        when v_actor=p_patient_id then case r.status
          when 'signed' then 'Registro clínico assinado'
          when 'corrected' then 'Uma versão corrigida por profissional permanece preservada no histórico.'
          when 'invalidated' then 'Invalidado pelo profissional responsável; preservado no histórico e fora da orientação vigente.'
          else 'Registro clínico'
        end
        else case r.status
          when 'draft' then 'Registro clínico em elaboração'
          when 'finalized' then 'Registro clínico finalizado'
          when 'signed' then 'Registro clínico assinado'
          when 'corrected' then 'Registro clínico corrigido'
          when 'invalidated' then 'Registro clínico invalidado'
          else 'Registro clínico'
        end
      end::text as summary,
      r.encounter_at as occurred_at,
      r.status::text as status,
      false as is_legacy
    from public.clinical_records r
    where r.patient_id=p_patient_id
      and r.care_episode_id=p_episode_id
      and (v_actor<>p_patient_id or private.is_patient_visible_clinical_record(r.id))

    union all

    select
      'anamnesis:'||a.id::text,a.id::text,'anamnesis'::text,'clinical'::text,
      'anamnesis'::text,coalesce(t.title, 'Anamnese')::text,
      case a.status
        when 'draft' then 'Anamnese em elaboração'
        when 'pending_patient' then 'Anamnese aguardando paciente'
        when 'in_progress' then 'Anamnese em preenchimento'
        when 'submitted' then 'Anamnese enviada'
        when 'validated' then 'Anamnese validada'
        else 'Anamnese'
      end::text,
      coalesce(a.created_at,a.date::timestamptz),a.status::text,true
    from public.anamnesis_records a
    left join public.anamnesis_templates t on a.template_id = t.id
    where a.patient_id=p_patient_id
      and a.care_episode_id=p_episode_id
      and (v_actor<>p_patient_id or a.filled_by='patient' or a.status in ('submitted','validated'))

    union all

    select
      'meal_plan:'||m.id::text,m.id::text,'meal_plan'::text,'operational'::text,
      'meal_plan'::text,'Plano alimentar'::text,
      case when m.is_active then 'Plano alimentar ativo' else 'Plano alimentar arquivado' end::text,
      coalesce(m.created_at,m.start_date::timestamptz,'epoch'::timestamptz),
      case when m.is_active then 'active' else 'archived' end::text,true
    from public.meal_plans m
    where m.patient_id=p_patient_id and m.care_episode_id=p_episode_id and not m.is_draft

    union all

    select
      'appointment:'||a.id::text,a.id::text,'appointment'::text,'operational'::text,
      'appointment'::text,'Consulta'::text,
      case a.status
        when 'scheduled' then 'Consulta agendada'
        when 'confirmed' then 'Consulta confirmada'
        when 'awaiting_confirmation' then 'Consulta aguardando confirmação'
        when 'completed' then 'Consulta realizada'
        when 'cancelled' then 'Consulta cancelada'
        when 'no_show' then 'Ausência registrada'
        else 'Consulta'
      end::text,
      a.appointment_time,a.status::text,true
    from public.appointments a
    where a.patient_id=p_patient_id and a.care_episode_id=p_episode_id
  )
  select
    e.event_id,e.source_id,e.source_type,e.category,e.subtype,e.title,e.summary,
    e.occurred_at,e.status,e.is_legacy
  from source_events e
  where (p_scope='all' or e.category=p_scope)
    and (p_cursor_at is null or (e.occurred_at,e.event_id)<(p_cursor_at,p_cursor_event_id))
  order by e.occurred_at desc,e.event_id desc
  limit p_limit+1;
end
$function$;
CREATE OR REPLACE FUNCTION public.notify_nutritionist_anamnesis_completed(p_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_record RECORD;
    v_patient_name TEXT;
    v_template_title TEXT;
BEGIN
 perform private.wave05_require_active_actor();

    SELECT r.nutritionist_id, r.patient_id, r.template_id
    INTO v_record
    FROM public.anamnesis_records r
    WHERE r.id = p_record_id;

    IF NOT FOUND THEN RETURN; END IF;

    SELECT name INTO v_patient_name FROM public.user_profiles WHERE id = v_record.patient_id;
    SELECT title INTO v_template_title FROM public.anamnesis_templates WHERE id = v_record.template_id;

    INSERT INTO public.notifications (
        user_id, type, title, message, link_url, is_read, content
    ) VALUES (
        v_record.nutritionist_id,
        'anamnesis_completed',
        'Anamnese Respondida',
        COALESCE(v_patient_name, 'Paciente') || ' respondeu ' || COALESCE(v_template_title, 'o questionário') || ' via link externo.',
        '/nutritionist/patients/' || v_record.patient_id::text || '/anamnesis',
        false,
        jsonb_build_object(
            'record_id', p_record_id,
            'patient_id', v_record.patient_id,
            'patient_name', v_patient_name,
            'template_title', v_template_title,
            'submitted_via', 'external_link'
        )
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.process_patient_reminders(p_patient_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null or p_patient_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'patient_reminder_forbidden';
  end if;
  return private.process_patient_reminders(p_patient_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.refund_financial_transaction(p_id bigint, p_refunded_at date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception 'FINANCIAL_AUTH_REQUIRED'; end if;
  if p_refunded_at is null or p_refunded_at > current_date then
    raise exception 'FINANCIAL_INVALID_REFUND_DATE';
  end if;
  update public.financial_transactions set status = 'refunded', refunded_at = p_refunded_at
  where id = p_id and nutritionist_id = auth.uid() and status = 'paid'
    and paid_at <= p_refunded_at;
  if not found then raise exception 'FINANCIAL_PAYMENT_NOT_FOUND'; end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.remove_empty_patient(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_status jsonb;
  v_episode public.care_episodes%rowtype;
  v_snapshot jsonb;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception 'AutenticaÃ§Ã£o obrigatÃ³ria.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 0));
  v_status := private.empty_patient_removal_status(p_patient_id);

  if not coalesce((v_status ->> 'can_remove')::boolean, false) then
    raise exception 'Este cadastro nÃ£o pode ser removido: %.', coalesce(v_status ->> 'reason', 'unknown')
      using errcode = 'P0001';
  end if;

  select * into strict v_episode
  from public.care_episodes
  where id = (v_status ->> 'care_episode_id')::uuid
  for update;

  v_snapshot := private.minimal_patient_snapshot(p_patient_id);

  update public.care_episodes
  set status = 'ended',
      ended_at = now(),
      ended_by = v_actor,
      end_reason = 'empty_profile_removed',
      patient_snapshot = coalesce(nullif(patient_snapshot, '{}'::jsonb), v_snapshot),
      updated_at = now()
  where id = v_episode.id;

  update public.nutritionist_patients
  set status = 'ended'
  where nutritionist_id = v_actor
    and patient_id = p_patient_id
    and status = 'active';

  update public.user_profiles
  set nutritionist_id = null
  where id = p_patient_id
    and nutritionist_id = v_actor;

  insert into private.empty_patient_removal_audit (
    patient_id, nutritionist_id, care_episode_id, removed_by, patient_snapshot
  ) values (
    p_patient_id, v_actor, v_episode.id, v_actor, coalesce(v_snapshot, '{}'::jsonb)
  );

  perform private.write_care_episode_activity(
    'care_episode.empty_profile_removed',
    v_episode,
    v_actor,
    'empty_profile_removed'
  );

  return jsonb_build_object('success', true, 'patient_id', p_patient_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.request_student_supervision(p_supervisor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student_id uuid:=auth.uid();
  v_row public.student_supervisions%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_student_id is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if not exists(select 1 from public.professional_verifications where user_id=v_student_id and professional_role='student' and status='approved' and valid_until>now()) then
    raise exception using errcode='42501',message='approved_student_verification_required';
  end if;
  if not exists(select 1 from public.professional_verifications where user_id=p_supervisor_id and professional_role='nutritionist' and status='approved' and valid_until>now()) then
    raise exception using errcode='42501',message='approved_supervisor_required';
  end if;
  insert into public.student_supervisions(student_id,supervisor_id,status)
  values(v_student_id,p_supervisor_id,'pending') returning * into v_row;
  insert into public.student_supervision_events(supervision_id,student_id,supervisor_id,actor_id,from_status,to_status,reason)
  values(v_row.id,v_student_id,p_supervisor_id,v_student_id,null,'pending','supervision_requested');
  insert into public.notifications(user_id,type,title,message,content)
  values(p_supervisor_id,'student_supervision_requested','Solicitação de supervisão','Um estudante solicitou sua supervisão.',jsonb_build_object('supervision_id',v_row.id,'student_id',v_student_id));
  return jsonb_build_object('success',true,'supervision_id',v_row.id,'status','pending');
end;
$function$;
CREATE OR REPLACE FUNCTION public.request_student_supervision_by_email(p_supervisor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_supervisor_id uuid;
begin
 perform private.wave05_require_active_actor();

  select u.id into v_supervisor_id
  from auth.users u
  join public.professional_verifications pv on pv.user_id=u.id
  where lower(u.email)=lower(btrim(p_supervisor_email))
    and pv.professional_role='nutritionist' and pv.status='approved' and pv.valid_until>now();
  if v_supervisor_id is null then
    raise exception using errcode='P0002',message='verified_supervisor_not_found';
  end if;
  return public.request_student_supervision(v_supervisor_id);
end;
$function$;
CREATE OR REPLACE FUNCTION public.request_verification_information(p_verification_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.professional_verifications%rowtype;
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION public.respond_student_supervision(p_supervision_id uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_row public.student_supervisions%rowtype;
begin
 perform private.wave05_require_active_actor();

  if p_decision not in ('active','rejected') then raise exception using errcode='22023',message='invalid_supervision_decision'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception using errcode='22023',message='decision_reason_required'; end if;
  select * into v_row from public.student_supervisions where id=p_supervision_id for update;
  if not found then raise exception using errcode='P0002',message='supervision_not_found'; end if;
  if v_actor<>v_row.supervisor_id then raise exception using errcode='42501',message='supervisor_required'; end if;
  if v_row.status<>'pending' then raise exception using errcode='55000',message='invalid_supervision_transition'; end if;
  if p_decision='active' and not private.has_current_clinical_capacity(v_actor) then raise exception using errcode='42501',message='approved_supervisor_required'; end if;
  update public.student_supervisions set status=p_decision,responded_at=now(),started_at=case when p_decision='active' then now() else null end,response_reason=btrim(p_reason),updated_at=now() where id=p_supervision_id;
  insert into public.student_supervision_events(supervision_id,student_id,supervisor_id,actor_id,from_status,to_status,reason)
  values(v_row.id,v_row.student_id,v_row.supervisor_id,v_actor,v_row.status,p_decision,btrim(p_reason));
  insert into public.notifications(user_id,type,title,message,content)
  values(v_row.student_id,'student_supervision_'||p_decision,'Supervisão atualizada',case when p_decision='active' then 'Sua supervisão foi aceita.' else 'Sua solicitação de supervisão foi recusada.' end,jsonb_build_object('supervision_id',v_row.id));
  return jsonb_build_object('success',true,'status',p_decision);
end;
$function$;
CREATE OR REPLACE FUNCTION public.review_patient_clinical_attachment(p_attachment_id uuid, p_decision text, p_reason text DEFAULT NULL::text, p_category_code text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_clinical_date date DEFAULT NULL::date, p_clinical_record_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_decision not in ('accept','reject') then
    raise exception using errcode='22023',message='invalid_review_decision';
  end if;

  select * into v_attachment from public.clinical_attachments
  where id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_attachment.source<>'patient' or v_attachment.status<>'pending_review' then
    raise exception using errcode='23514',message='attachment_not_pending_review';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_review_forbidden';
  end if;

  if p_decision='reject' then
    if length(coalesce(v_reason,''))<10 then
      raise exception using errcode='22023',message='review_rejection_reason_required';
    end if;
    perform set_config('app.clinical_attachment_reason',v_reason,true);
    update public.clinical_attachments
      set status='invalidated',reviewed_by=v_actor,reviewed_at=now(),
          invalidation_reason=v_reason,invalidated_at=now()
      where id=v_attachment.id;
  else
    if p_category_code is not null and not exists(
      select 1 from public.clinical_attachment_categories
      where code=p_category_code and is_active
    ) then raise exception using errcode='22023',message='invalid_attachment_category'; end if;
    if p_clinical_record_id is not null and not exists(
      select 1 from public.clinical_records r
      where r.id=p_clinical_record_id and r.patient_id=v_attachment.patient_id
        and r.care_episode_id=v_attachment.care_episode_id
    ) then raise exception using errcode='23503',message='clinical_record_scope_mismatch'; end if;

    perform set_config('app.clinical_attachment_reason','professional_review_accepted',true);
    update public.clinical_attachments set
      status='active',reviewed_by=v_actor,reviewed_at=now(),
      category_code=coalesce(p_category_code,category_code),
      description=coalesce(nullif(btrim(p_description),''),description),
      clinical_date=coalesce(p_clinical_date,clinical_date),
      clinical_record_id=coalesce(p_clinical_record_id,clinical_record_id)
    where id=v_attachment.id;
  end if;

  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
    'status',case when p_decision='accept' then 'active' else 'invalidated' end);
end
$function$;
CREATE OR REPLACE FUNCTION public.review_professional_verification(p_verification_id uuid, p_decision text, p_reason text, p_source_url text, p_valid_until timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.professional_verifications%rowtype;
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION public.revise_anthropometry_record(p_record_id bigint, p_payload jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.growth_records%rowtype;v_id bigint;v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='anthropometry_revision_reason_required';end if;select*into v from public.growth_records where id=p_record_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or v.status<>'active'or not v.is_latest_revision then raise exception using errcode='42501',message='anthropometry_revision_forbidden';end if;insert into public.growth_records(patient_id,care_episode_id,record_date,weight,height,notes,circumferences,skinfolds,bone_diameters,bioimpedance,photos,results,supersedes_record_id,change_reason,created_by_user_id,protocol_code,protocol_version,source_snapshot,confirmed_by,confirmed_at)values(v.patient_id,v.care_episode_id,coalesce((p_payload->>'record_date')::date,v.record_date),coalesce(nullif(p_payload->>'weight','')::numeric,v.weight),coalesce(nullif(p_payload->>'height','')::numeric,v.height),coalesce(p_payload->>'notes',v.notes),coalesce(p_payload->'circumferences',v.circumferences),coalesce(p_payload->'skinfolds',v.skinfolds),coalesce(p_payload->'bone_diameters',v.bone_diameters),coalesce(p_payload->'bioimpedance',v.bioimpedance),case when p_payload?'photos'then array(select jsonb_array_elements_text(p_payload->'photos'))else v.photos end,coalesce(p_payload->'results',v.results),v.id,v_reason,auth.uid(),coalesce(nullif(p_payload->>'protocol_code',''),v.protocol_code),coalesce((p_payload->>'protocol_version')::integer,v.protocol_version),coalesce(p_payload->'source_snapshot',v.source_snapshot),auth.uid(),now())returning id into v_id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('anthropometry.record.revised',now(),jsonb_build_object('previous_id',v.id,'new_id',v_id,'reason',v_reason),v.patient_id,'anthropometry',auth.uid());return(select to_jsonb(r)from public.growth_records r where id=v_id);end$function$;
CREATE OR REPLACE FUNCTION public.revise_lab_result_record(p_result_id bigint, p_payload jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.lab_results%rowtype;v_id bigint;v_reason text:=nullif(btrim(p_reason),'');begin
 perform private.wave05_require_active_actor();
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='lab_revision_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or v.record_status<>'active'or not v.is_latest_revision then raise exception using errcode='42501',message='lab_revision_forbidden';end if;if coalesce(nullif(p_payload->>'reference_min','')::numeric,v.reference_min)>coalesce(nullif(p_payload->>'reference_max','')::numeric,v.reference_max) then raise exception using errcode='22023',message='invalid_laboratory_reference_range';end if;update public.lab_results set is_latest_revision=false where id=v.id;insert into public.lab_results(patient_id,care_episode_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,pdf_url,pdf_filename,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision)values(v.patient_id,v.care_episode_id,coalesce(nullif(btrim(p_payload->>'test_name'),''),v.test_name),coalesce(nullif(p_payload->>'test_value',''),v.test_value),coalesce(nullif(p_payload->>'test_unit',''),v.test_unit),coalesce(nullif(p_payload->>'reference_min','')::numeric,v.reference_min),coalesce(nullif(p_payload->>'reference_max','')::numeric,v.reference_max),coalesce(nullif(p_payload->>'status',''),v.status),coalesce((p_payload->>'test_date')::date,v.test_date),coalesce(nullif(p_payload->>'notes',''),v.notes),coalesce(nullif(p_payload->>'pdf_url',''),v.pdf_url),coalesce(nullif(p_payload->>'pdf_filename',''),v.pdf_filename),coalesce(nullif(p_payload->>'reference_source',''),v.reference_source),coalesce(p_payload->'reference_snapshot',v.reference_snapshot),'pending',null,null,coalesce(v.root_result_id,v.id),v.id,v.revision_number+1,true)returning id into v_id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.result.revised',now(),jsonb_build_object('previous_id',v.id,'new_id',v_id,'reason',v_reason),v.patient_id,'laboratory',auth.uid());return(select to_jsonb(r)from public.lab_results r where id=v_id);end$function$;
CREATE OR REPLACE FUNCTION public.revoke_patient_legal_guardian(p_guardian_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_g public.patient_episode_legal_guardians%rowtype; v_reason text:=btrim(p_reason);
begin
 perform private.wave05_require_active_actor();

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
end $function$;
CREATE OR REPLACE FUNCTION public.save_checkin_template(p_id uuid, p_template jsonb, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_field jsonb;
  v_index integer := 0;
  v_existing jsonb;
  v_incoming jsonb;
BEGIN
 perform private.wave05_require_active_actor();

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND user_type='nutritionist'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authentication_required';
  END IF;
  IF jsonb_typeof(p_template) <> 'object' OR jsonb_typeof(p_fields) <> 'array'
     OR jsonb_array_length(p_fields) NOT BETWEEN 1 AND 100
     OR length(btrim(coalesce(p_template->>'name',''))) NOT BETWEEN 3 AND 100
     OR coalesce(p_template->>'channel','in_app') <> 'in_app'
     OR coalesce(p_template->>'frequency','') NOT IN ('daily','weekly','biweekly','monthly')
     OR jsonb_typeof(coalesce(p_template->'send_days','[1]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_template->'send_days','[1]'::jsonb)) = 0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_checkin_template';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(p_template->'send_days','[1]'::jsonb)) d(value)
    WHERE (p_template->>'frequency' = 'monthly' AND value::integer NOT BETWEEN 1 AND 28)
       OR (p_template->>'frequency' <> 'monthly' AND value::integer NOT BETWEEN 1 AND 7)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_checkin_send_days';
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    IF length(btrim(coalesce(v_field->>'label',''))) NOT BETWEEN 3 AND 500
       OR v_field->>'field_type' NOT IN ('scale_1_10','yes_no','number','text','multiple_choice')
       OR coalesce(v_field->>'score_weight','1') = 'NaN'
       OR coalesce((v_field->>'score_weight')::numeric,0) < 0
       OR coalesce((v_field->>'score_weight')::numeric,0) > 100
       OR (v_field->>'field_type'='multiple_choice' AND
           (jsonb_typeof(v_field->'options') <> 'array' OR jsonb_array_length(v_field->'options') < 2)) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid_checkin_field';
    END IF;
  END LOOP;
  IF p_id IS NULL THEN
    INSERT INTO public.checkin_templates
      (nutritionist_id,name,description,frequency,send_time,send_days,channel)
    VALUES
      (auth.uid(),btrim(p_template->>'name'),coalesce(p_template->>'description',''),
       p_template->>'frequency',coalesce((p_template->>'send_time')::time,'09:00'::time),
       ARRAY(SELECT jsonb_array_elements_text(coalesce(p_template->'send_days','[1]'::jsonb))::integer),
       'in_app') RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.checkin_templates
      WHERE id=p_id AND nutritionist_id=auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='checkin_template_not_found_or_forbidden';
    END IF;
    -- Responses use field UUIDs. Replacing questions after a session exists
    -- would make historical answers unreadable, even in a transaction.
    IF EXISTS (SELECT 1 FROM public.checkin_sessions WHERE template_id=p_id) THEN
      SELECT jsonb_agg(jsonb_build_object(
        'label',label,'field_type',field_type,'options',coalesce(options,'[]'::jsonb),
        'score_weight',score_weight,'unit',unit,'is_required',is_required)
        ORDER BY order_index) INTO v_existing
      FROM public.checkin_fields WHERE template_id=p_id;
      SELECT jsonb_agg(jsonb_build_object(
        'label',item->>'label','field_type',item->>'field_type',
        'options',coalesce(item->'options','[]'::jsonb),
        'score_weight',coalesce((item->>'score_weight')::numeric,1),
        'unit',nullif(item->>'unit',''),
        'is_required',coalesce((item->>'is_required')::boolean,true))
        ORDER BY ord) INTO v_incoming
      FROM jsonb_array_elements(p_fields) WITH ORDINALITY AS f(item,ord);
      IF v_existing IS DISTINCT FROM v_incoming THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='checkin_has_sessions_create_new_template';
      END IF;
    ELSE
      DELETE FROM public.checkin_fields WHERE template_id=v_id;
      FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
        INSERT INTO public.checkin_fields
          (template_id,label,field_type,options,score_weight,unit,is_required,order_index)
        VALUES
          (v_id,btrim(v_field->>'label'),v_field->>'field_type',
           coalesce(v_field->'options','[]'::jsonb),
           coalesce((v_field->>'score_weight')::numeric,1),
           nullif(v_field->>'unit',''),coalesce((v_field->>'is_required')::boolean,true),v_index);
        v_index := v_index + 1;
      END LOOP;
    END IF;
    UPDATE public.checkin_templates SET
      name=btrim(p_template->>'name'),description=coalesce(p_template->>'description',''),
      frequency=p_template->>'frequency',
      send_time=coalesce((p_template->>'send_time')::time,'09:00'::time),
      send_days=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_template->'send_days','[1]'::jsonb))::integer),
      channel='in_app' WHERE id=v_id;
    RETURN v_id;
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    INSERT INTO public.checkin_fields
      (template_id,label,field_type,options,score_weight,unit,is_required,order_index)
    VALUES
      (v_id,btrim(v_field->>'label'),v_field->>'field_type',
       coalesce(v_field->'options','[]'::jsonb),
       coalesce((v_field->>'score_weight')::numeric,1),
       nullif(v_field->>'unit',''),coalesce((v_field->>'is_required')::boolean,true),v_index);
    v_index := v_index + 1;
  END LOOP;
  RETURN v_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.save_custom_food_with_measures(p_food_id uuid, p_food jsonb, p_measures jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_food public.nutritionist_foods%rowtype;
  v_item jsonb;
  v_id uuid;
  v_label text;
  v_grams numeric;
  v_kept uuid[] := '{}'::uuid[];
  v_numeric_key text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null or not exists (
    select 1 from public.user_profiles where id=v_actor and user_type='nutritionist'
  ) then raise exception 'NUTRITIONIST_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_food) <> 'object' or jsonb_typeof(p_measures) <> 'array'
     or jsonb_array_length(p_measures) > 40 then
    raise exception 'INVALID_FOOD_PAYLOAD' using errcode='22023';
  end if;

  if p_food_id is not null then
    select * into v_food from public.nutritionist_foods
    where id=p_food_id and nutritionist_id=v_actor for update;
    if not found then raise exception 'FOOD_NOT_OWNED' using errcode='42501'; end if;
  end if;
  v_food := jsonb_populate_record(v_food,p_food);
  v_food.id := coalesce(p_food_id,pg_catalog.gen_random_uuid());
  v_food.nutritionist_id := v_actor;
  if p_food_id is null then v_food.created_at := now(); end if;
  if nullif(pg_catalog.btrim(v_food.name),'') is null or length(v_food.name)>200
     or coalesce(v_food.base_qty,0)<=0 or v_food.base_qty>100000 then
    raise exception 'INVALID_FOOD_FIELDS' using errcode='22023';
  end if;
  -- Reject non-numeric and implausible values before any write, including NaN.
  for v_numeric_key in select key from jsonb_each(p_food)
    where key in ('energy_kcal','protein_g','carbohydrate_g','lipid_g','fiber_g',
      'sodium_mg','saturated_fat_g','monounsaturated_fat_g','polyunsaturated_fat_g',
      'trans_fat_g','cholesterol_mg','sugar_g','calcium_mg','iron_mg','magnesium_mg',
      'phosphorus_mg','potassium_mg','zinc_mg','vitamin_a_mcg','vitamin_c_mg',
      'vitamin_d_mcg','vitamin_e_mg','vitamin_b12_mcg','folate_mcg')
  loop
    if p_food->v_numeric_key <> 'null'::jsonb and (
      jsonb_typeof(p_food->v_numeric_key) <> 'number'
      or (p_food->>v_numeric_key)::numeric < 0
      or (p_food->>v_numeric_key)::numeric > 100000
    ) then raise exception 'INVALID_NUTRIENT: %',v_numeric_key using errcode='22023'; end if;
  end loop;

  if p_food_id is null then
    insert into public.nutritionist_foods select (v_food).*;
  else
    update public.nutritionist_foods set
      name=v_food.name, brand=v_food.brand, barcode=v_food.barcode,
      base_qty=v_food.base_qty, base_unit=v_food.base_unit,
      energy_kcal=v_food.energy_kcal, protein_g=v_food.protein_g,
      carbohydrate_g=v_food.carbohydrate_g, lipid_g=v_food.lipid_g,
      fiber_g=v_food.fiber_g, sodium_mg=v_food.sodium_mg,
      saturated_fat_g=v_food.saturated_fat_g,
      monounsaturated_fat_g=v_food.monounsaturated_fat_g,
      polyunsaturated_fat_g=v_food.polyunsaturated_fat_g,
      trans_fat_g=v_food.trans_fat_g, cholesterol_mg=v_food.cholesterol_mg,
      sugar_g=v_food.sugar_g, calcium_mg=v_food.calcium_mg,
      iron_mg=v_food.iron_mg, magnesium_mg=v_food.magnesium_mg,
      phosphorus_mg=v_food.phosphorus_mg, potassium_mg=v_food.potassium_mg,
      zinc_mg=v_food.zinc_mg, vitamin_a_mcg=v_food.vitamin_a_mcg,
      vitamin_c_mg=v_food.vitamin_c_mg, vitamin_d_mcg=v_food.vitamin_d_mcg,
      vitamin_e_mg=v_food.vitamin_e_mg, vitamin_b12_mcg=v_food.vitamin_b12_mcg,
      folate_mcg=v_food.folate_mcg
    where id=p_food_id and nutritionist_id=v_actor;
  end if;

  for v_item in select value from jsonb_array_elements(p_measures) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'INVALID_MEASURE' using errcode='22023'; end if;
    v_label := pg_catalog.btrim(v_item->>'label');
    if nullif(v_label,'') is null or length(v_label)>120
       or jsonb_typeof(v_item->'grams')<>'number' then
      raise exception 'INVALID_MEASURE' using errcode='22023';
    end if;
    v_grams := (v_item->>'grams')::numeric;
    if v_grams<=0 or v_grams>100000 then raise exception 'INVALID_MEASURE_WEIGHT' using errcode='22023'; end if;
    if v_item ? 'id' and nullif(v_item->>'id','') is not null then
      v_id := (v_item->>'id')::uuid;
      if v_id=any(v_kept) then raise exception 'DUPLICATE_MEASURE' using errcode='22023'; end if;
      perform 1 from public.food_measures where id=v_id and nutritionist_food_id=v_food.id for update;
      if not found then raise exception 'MEASURE_NOT_OWNED' using errcode='42501'; end if;
      if exists(select 1 from public.meal_items where measure_id=v_id)
         and exists(select 1 from public.food_measures
           where id=v_id and (label<>v_label or weight_in_grams<>v_grams)) then
        raise exception 'MEASURE_IN_USE' using errcode='23503';
      end if;
      update public.food_measures set label=v_label,weight_in_grams=v_grams,
        version=case when label<>v_label or weight_in_grams<>v_grams then version+1 else version end
      where id=v_id;
    else
      insert into public.food_measures(nutritionist_food_id,label,weight_in_grams)
      values(v_food.id,v_label,v_grams) returning id into v_id;
    end if;
    v_kept := array_append(v_kept,v_id);
  end loop;

  if exists(select 1 from public.meal_items mi join public.food_measures fm on fm.id=mi.measure_id
    where fm.nutritionist_food_id=v_food.id and not (fm.id=any(v_kept))) then
    raise exception 'MEASURE_IN_USE' using errcode='23503';
  end if;
  delete from public.food_measures where nutritionist_food_id=v_food.id and not (id=any(v_kept));
  return jsonb_build_object('id',v_food.id,'source','custom','name',v_food.name);
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_meal_template(p_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_tags text[], p_foods jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_updated_at timestamptz;
  v_food jsonb;
  v_food_id uuid;
  v_quantity numeric;
  v_index integer := 0;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 3 and 100
     or jsonb_typeof(coalesce(p_foods, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_foods, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'invalid_meal_template_payload';
  end if;
  if p_id is null then
    insert into public.meal_templates (user_id, name, description, tags)
    values (auth.uid(), btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_tags, '{}'::text[]))
    returning id into v_id;
  else
    select updated_at into v_updated_at from public.meal_templates
    where id = p_id and user_id = auth.uid() for update;
    if not found then
      raise exception using errcode = '42501', message = 'meal_template_not_found_or_forbidden';
    end if;
    if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'meal_template_changed_elsewhere';
    end if;
    update public.meal_templates set name = btrim(p_name),
      description = nullif(btrim(p_description), ''), tags = coalesce(p_tags, '{}'::text[]),
      updated_at = clock_timestamp() where id = p_id;
    delete from public.meal_template_foods where meal_template_id = p_id;
    v_id := p_id;
  end if;
  for v_food in select value from jsonb_array_elements(coalesce(p_foods, '[]'::jsonb)) loop
    v_food_id := (v_food->>'food_id')::uuid;
    v_quantity := (v_food->>'quantity')::numeric;
    if v_quantity is null or v_quantity::text = 'NaN' or v_quantity <= 0 or v_quantity > 100000
      or length(coalesce(v_food->>'unit', '')) not between 1 and 40
      or not exists (select 1 from public.foods f where f.id = v_food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
      raise exception using errcode = '22023', message = 'invalid_meal_template_food';
    end if;
    insert into public.meal_template_foods
      (meal_template_id, food_id, quantity, unit, observation, order_index)
    values (v_id, v_food_id, v_quantity, v_food->>'unit',
      nullif(v_food->>'observation', ''), v_index);
    v_index := v_index + 1;
  end loop;
  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_my_document_identity(p_payload jsonb, p_expected_version integer DEFAULT NULL::integer, p_reason text DEFAULT 'profile_update'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_verification public.professional_verifications%rowtype;
  v_current public.professional_document_identities%rowtype;
  v_saved public.professional_document_identities%rowtype;
  v_next_version integer;
  v_unknown_key text;
  v_name text;
  v_clinic text;
  v_email text;
  v_phone text;
  v_address_line text;
  v_address_city text;
  v_address_state text;
  v_postal_code text;
  v_primary_color text;
  v_accent_color text;
  v_header text;
  v_footer text;
  v_reason text := nullif(btrim(p_reason), '');
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'document_identity_payload_must_be_object';
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(p_payload) key
  where key <> all(array[
    'professional_name', 'clinic_name', 'professional_email', 'professional_phone',
    'address_line', 'address_city', 'address_state', 'address_postal_code',
    'primary_color', 'accent_color', 'header_text', 'footer_text'
  ]::text[])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'document_identity_unknown_field:' || v_unknown_key;
  end if;

  select * into v_profile from public.user_profiles where id = v_actor;
  select * into v_verification
  from public.professional_verifications
  where user_id = v_actor
    and professional_role = 'nutritionist'
    and status = 'approved'
    and valid_until > now()
  for share;

  if not found or v_profile.user_type is distinct from 'nutritionist' then
    raise exception using errcode = '42501', message = 'document_identity_requires_verified_nutritionist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('document_identity:' || v_actor::text, 0));
  select * into v_current
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active'
  for update;

  if found then
    if p_expected_version is null or p_expected_version <> v_current.version then
      raise exception using errcode = '40001', message = 'document_identity_revision_conflict';
    end if;
    v_next_version := v_current.version + 1;
  else
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception using errcode = '40001', message = 'document_identity_revision_conflict';
    end if;
    v_next_version := 1;
  end if;

  v_name := private.merge_document_identity_text(p_payload, 'professional_name', v_current.professional_name, v_profile.name);
  v_clinic := private.merge_document_identity_text(p_payload, 'clinic_name', v_current.clinic_name, null);
  v_email := private.merge_document_identity_text(p_payload, 'professional_email', v_current.professional_email, v_profile.email);
  v_phone := private.merge_document_identity_text(p_payload, 'professional_phone', v_current.professional_phone, v_profile.phone);
  v_address_line := private.merge_document_identity_text(p_payload, 'address_line', v_current.address_line, null);
  v_address_city := private.merge_document_identity_text(p_payload, 'address_city', v_current.address_city, null);
  v_address_state := private.merge_document_identity_text(p_payload, 'address_state', v_current.address_state, null);
  v_postal_code := private.merge_document_identity_text(p_payload, 'address_postal_code', v_current.address_postal_code, null);
  v_primary_color := coalesce(private.merge_document_identity_text(p_payload, 'primary_color', v_current.primary_color, '#4F8A3C'), '#4F8A3C');
  v_accent_color := coalesce(private.merge_document_identity_text(p_payload, 'accent_color', v_current.accent_color, '#7DAF69'), '#7DAF69');
  v_header := private.merge_document_identity_text(p_payload, 'header_text', v_current.header_text, null);
  v_footer := private.merge_document_identity_text(p_payload, 'footer_text', v_current.footer_text, null);

  if v_name is null or length(v_name) > 160
     or length(coalesce(v_clinic, '')) > 160
     or length(coalesce(v_email, '')) > 254
     or length(coalesce(v_phone, '')) > 40
     or length(coalesce(v_address_line, '')) > 240
     or length(coalesce(v_address_city, '')) > 120
     or length(coalesce(v_address_state, '')) > 40
     or length(coalesce(v_postal_code, '')) > 20
     or length(coalesce(v_header, '')) > 300
     or length(coalesce(v_footer, '')) > 300
     or length(coalesce(v_reason, '')) > 240 then
    raise exception using errcode = '22023', message = 'document_identity_field_out_of_bounds';
  end if;
  if concat_ws('', v_name, v_clinic, v_email, v_phone, v_address_line, v_address_city,
      v_address_state, v_postal_code, v_header, v_footer) ~ '[<>]' then
    raise exception using errcode = '22023', message = 'document_identity_markup_not_allowed';
  end if;
  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' or v_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using errcode = '22023', message = 'document_identity_invalid_color';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'document_identity_reason_required';
  end if;

  if v_current.id is not null then
    update public.professional_document_identities
    set status = 'archived', archived_at = now(), archive_reason = v_reason
    where id = v_current.id;

    insert into public.professional_document_identity_events(
      identity_id, professional_id, actor_id, event_type, reason, metadata
    ) values (
      v_current.id, v_actor, v_actor, 'superseded', v_reason,
      jsonb_build_object('version', v_current.version, 'superseded_by_version', v_next_version)
    );
  end if;

  insert into public.professional_document_identities(
    professional_id, verification_id, version, status,
    professional_name, clinic_name, professional_email, professional_phone,
    address_line, address_city, address_state, address_postal_code,
    primary_color, accent_color, header_text, footer_text,
    crn_region, crn_number, normalized_crn,
    logo_storage_path, signature_storage_path, stamp_storage_path,
    created_by
  ) values (
    v_actor, v_verification.id, v_next_version, 'active',
    v_name, v_clinic, v_email, v_phone,
    v_address_line, v_address_city, v_address_state, v_postal_code,
    upper(v_primary_color), upper(v_accent_color), v_header, v_footer,
    v_verification.crn_region, v_verification.crn_number, v_verification.normalized_crn,
    v_current.logo_storage_path, v_current.signature_storage_path, v_current.stamp_storage_path,
    v_actor
  ) returning * into v_saved;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_saved.id, v_actor, v_actor, 'created', v_reason,
    jsonb_build_object('version', v_saved.version, 'previous_version', nullif(v_saved.version - 1, 0))
  );

  return public.get_my_document_identity();
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_patient_diary_meal(p_meal_id bigint, p_payload jsonb, p_items jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_patient uuid := auth.uid();
  v_nutritionist uuid;
  v_meal_id bigint;
  v_meal_date date;
  v_meal_time time;
  v_meal_type text;
  v_notes text;
  v_item jsonb;
  v_food_id uuid;
  v_food record;
  v_source text;
  v_quantity numeric;
  v_grams numeric;
  v_unit text;
  v_measure_id uuid;
  v_measure record;
  v_base_qty numeric;
  v_calories numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
  v_total_calories numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
  v_audit_items jsonb := '[]'::jsonb;
begin
 perform private.wave05_require_active_actor();

  if v_patient is null then raise exception 'DIARY_AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_payload) <> 'object' or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'DIARY_INVALID_PAYLOAD';
  end if;
  select nutritionist_id into v_nutritionist from public.user_profiles where id = v_patient;
  v_meal_date := (p_payload->>'meal_date')::date;
  v_meal_time := (p_payload->>'meal_time')::time;
  v_meal_type := nullif(btrim(p_payload->>'meal_type'), '');
  v_notes := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
  if v_meal_date is null or v_meal_time is null or v_meal_type is null
     or length(v_meal_type) > 80 or length(coalesce(v_notes, '')) > 2000 then
    raise exception 'DIARY_INVALID_MEAL';
  end if;

  if p_meal_id is null then
    insert into public.meals(patient_id, meal_date, meal_time, meal_type, notes,
      total_calories, total_protein, total_carbs, total_fat)
    values(v_patient, v_meal_date, v_meal_time, v_meal_type, v_notes, 0, 0, 0, 0)
    returning id into v_meal_id;
  else
    select id into v_meal_id from public.meals
    where id = p_meal_id and patient_id = v_patient and deleted_at is null for update;
    if not found then raise exception 'DIARY_MEAL_NOT_FOUND'; end if;
    delete from public.meal_items where meal_id = v_meal_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'DIARY_INVALID_ITEM'; end if;
    v_food_id := (v_item->>'food_id')::uuid;
    v_source := coalesce(nullif(v_item->>'food_source', ''), 'reference');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit := coalesce(nullif(btrim(v_item->>'unit'), ''), 'g');
    v_measure_id := nullif(v_item->>'measure_id', '')::uuid;
    if v_food_id is null or v_source not in ('custom', 'reference')
      or v_quantity is null or v_quantity::text = 'NaN'
      or v_quantity <= 0 or v_quantity > 100000 or length(v_unit) > 40 then
      raise exception 'DIARY_INVALID_ITEM';
    end if;
    select id, name, source, nutritionist_id, is_active, portion_size,
      protein, carbs, fat into v_food from public.foods where id = v_food_id;
    if not found then raise exception 'DIARY_FOOD_UNAVAILABLE'; end if;
    if not coalesce(v_food.is_active, false)
      or (v_source = 'custom' and (v_food.source <> 'custom' or v_food.nutritionist_id is distinct from v_nutritionist))
      or (v_source = 'reference' and v_food.source = 'custom') then
      raise exception 'DIARY_FOOD_UNAVAILABLE';
    end if;

    if lower(v_unit) in ('g', 'gram', 'grams', 'ml') then
      if v_measure_id is not null then raise exception 'DIARY_INVALID_MEASURE'; end if;
      v_grams := v_quantity;
    else
      if v_measure_id is null then raise exception 'DIARY_INVALID_MEASURE'; end if;
      select id, label, weight_in_grams into v_measure from public.food_measures
      where id = v_measure_id and
        ((v_source = 'custom' and nutritionist_food_id = v_food_id)
        or (v_source = 'reference' and reference_food_id = v_food_id));
      if not found then raise exception 'DIARY_INVALID_MEASURE'; end if;
      if v_measure.label <> v_unit or v_measure.weight_in_grams <= 0 then
        raise exception 'DIARY_INVALID_MEASURE';
      end if;
      v_grams := v_quantity * v_measure.weight_in_grams;
    end if;
    if v_grams <= 0 or v_grams > 100000 then raise exception 'DIARY_INVALID_WEIGHT'; end if;
    v_base_qty := case when v_source = 'custom' then nullif(v_food.portion_size, 0) else 100 end;
    if v_base_qty is null or v_base_qty <= 0 then raise exception 'DIARY_INVALID_FOOD_BASE'; end if;
    v_protein := round(coalesce(v_food.protein, 0) * v_grams / v_base_qty, 2);
    v_carbs := round(coalesce(v_food.carbs, 0) * v_grams / v_base_qty, 2);
    v_fat := round(coalesce(v_food.fat, 0) * v_grams / v_base_qty, 2);
    v_calories := round((coalesce(v_food.protein, 0) * 4
      + coalesce(v_food.carbs, 0) * 4 + coalesce(v_food.fat, 0) * 9) * v_grams / v_base_qty, 2);
    if v_protein < 0 or v_carbs < 0 or v_fat < 0 or v_calories < 0
      or v_protein::text = 'NaN' or v_carbs::text = 'NaN'
      or v_fat::text = 'NaN' or v_calories::text = 'NaN' then
      raise exception 'DIARY_INVALID_NUTRITION';
    end if;
    insert into public.meal_items(meal_id, reference_food_id, nutritionist_food_id,
      name, quantity, unit, grams, measure_id, calories, protein, carbs, fat)
    values(v_meal_id,
      case when v_source = 'reference' then v_food_id else null end,
      case when v_source = 'custom' then v_food_id else null end,
      v_food.name, v_quantity, v_unit, v_grams, v_measure_id,
      v_calories, v_protein, v_carbs, v_fat);
    v_total_calories := v_total_calories + v_calories;
    v_total_protein := v_total_protein + v_protein;
    v_total_carbs := v_total_carbs + v_carbs;
    v_total_fat := v_total_fat + v_fat;
    v_audit_items := v_audit_items || jsonb_build_array(jsonb_build_object(
      'food_id', v_food_id, 'name', v_food.name, 'quantity', v_quantity,
      'unit', v_unit, 'grams', v_grams, 'calories', v_calories,
      'protein', v_protein, 'carbs', v_carbs, 'fat', v_fat));
  end loop;

  update public.meals set meal_date = v_meal_date, meal_time = v_meal_time,
    meal_type = v_meal_type, notes = v_notes,
    total_calories = v_total_calories, total_protein = v_total_protein,
    total_carbs = v_total_carbs, total_fat = v_total_fat,
    is_edited = p_meal_id is not null, updated_at = now()
  where id = v_meal_id;
  perform public.log_meal_action(v_patient, v_meal_id,
    case when p_meal_id is null then 'create' else 'update' end,
    v_meal_type, v_meal_date, v_meal_time,
    jsonb_build_object('total_calories',v_total_calories,'total_protein',v_total_protein,
      'total_carbs',v_total_carbs,'total_fat',v_total_fat,'items',v_audit_items));
  return v_meal_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_recipe_template(p_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_preparation_method text, p_yield_quantity numeric, p_yield_unit text, p_ingredients jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_updated_at timestamptz;
  v_ingredient jsonb;
  v_food_id uuid;
  v_quantity numeric;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 3 and 100
    or p_yield_quantity is null or p_yield_quantity::text = 'NaN'
    or p_yield_quantity <= 0 or p_yield_quantity > 100000
    or length(coalesce(btrim(p_yield_unit), '')) not between 1 and 40
    or jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'invalid_recipe_payload';
  end if;
  if p_id is null then
    insert into public.recipes
      (user_id, name, description, preparation_method, yield_quantity, yield_unit)
    values (auth.uid(), btrim(p_name), nullif(btrim(p_description), ''),
      nullif(btrim(p_preparation_method), ''), p_yield_quantity, btrim(p_yield_unit))
    returning id into v_id;
  else
    select updated_at into v_updated_at from public.recipes
    where id = p_id and user_id = auth.uid() and coalesce(is_deleted, false) = false for update;
    if not found then
      raise exception using errcode = '42501', message = 'recipe_not_found_or_forbidden';
    end if;
    if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'recipe_changed_elsewhere';
    end if;
    update public.recipes set name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      preparation_method = nullif(btrim(p_preparation_method), ''),
      yield_quantity = p_yield_quantity, yield_unit = btrim(p_yield_unit),
      version = version + 1, updated_at = clock_timestamp() where id = p_id;
    delete from public.recipe_ingredients where recipe_id = p_id;
    v_id := p_id;
  end if;
  for v_ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) loop
    v_food_id := (v_ingredient->>'food_id')::uuid;
    v_quantity := (v_ingredient->>'quantity')::numeric;
    if v_quantity is null or v_quantity::text = 'NaN' or v_quantity <= 0 or v_quantity > 100000
      or length(coalesce(v_ingredient->>'unit', '')) not between 1 and 40
      or not exists (select 1 from public.foods f where f.id = v_food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
      raise exception using errcode = '22023', message = 'invalid_recipe_ingredient';
    end if;
    insert into public.recipe_ingredients (recipe_id, food_id, quantity, unit)
    values (v_id, v_food_id, v_quantity, v_ingredient->>'unit');
  end loop;
  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_checkin_schedule_active(p_schedule_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_schedule public.checkin_schedules%rowtype; v_template public.checkin_templates%rowtype;
begin
 perform private.wave05_require_active_actor();

  select * into v_schedule from public.checkin_schedules
  where id = p_schedule_id and nutritionist_id = auth.uid() for update;
  if not found then raise exception 'CHECKIN_SCHEDULE_NOT_FOUND'; end if;
  select * into v_template from public.checkin_templates where id = v_schedule.template_id;
  if p_active and (v_template.is_active is not true
    or not exists (select 1 from public.checkin_fields where template_id = v_template.id)
    or not exists (select 1 from public.care_episodes where id = v_schedule.care_episode_id
      and status = 'active' and coalesce(is_simulation, false) = false)) then
    raise exception 'CHECKIN_SCHEDULE_UNAVAILABLE';
  end if;
  update public.checkin_schedules set is_active = p_active,
    next_send_at = case when p_active then private.next_checkin_send_at(
      v_template.frequency, v_template.send_days, v_template.send_time,
      v_schedule.time_zone, now()) else next_send_at end
  where id = p_schedule_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sign_clinical_record(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
  v_crn_number text;
  v_crn_region text;
  v_signed_at timestamptz:=clock_timestamp();
  v_auth_level text;
  v_jwt_claims text;
  v_episode_status text;
  v_expected_hash text;
  v_canonical jsonb;
  v_amendment_hash text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction';
  v_is_correction:=found;
  if v_is_correction and v_amendment.status<>'draft' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  if v_is_correction then
    perform r.id from public.clinical_records r
    where r.id in (v_amendment.root_record_id,v_amendment.target_record_id,p_record_id)
    order by r.id for update;
    select * into v_record from public.clinical_records where id=p_record_id;
    select * into v_amendment from public.clinical_record_amendments
    where id=v_amendment.id for update;
    if v_record.status<>'finalized'
      or v_amendment.status<>'draft'
      or not exists (
        select 1 from public.clinical_records t
        where t.id=v_amendment.target_record_id and t.status='signed'
      ) then
      raise exception using errcode='40001',message='amendment_chain_conflict';
    end if;
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'sign') then
      raise exception using errcode='42501',message='correction_sign_forbidden';
    end if;
  else
    if v_record.status<>'finalized' then
      raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if (v_record.student_id is not null and v_actor<>v_record.supervisor_id)
      or (v_record.student_id is null and v_actor<>v_record.nutritionist_id) then
      raise exception using errcode='42501',message='only_nutritionist_can_sign'; end if;
  end if;

  select pv.crn_number,pv.crn_region into v_crn_number,v_crn_region
  from public.professional_verifications pv
  where pv.user_id=v_actor and pv.professional_role='nutritionist'
    and pv.status='approved' and pv.valid_until>now()
  order by pv.reviewed_at desc nulls last limit 1;
  if v_crn_number is null then
    raise exception using errcode='42501',message='verified_professional_required'; end if;

  v_canonical:=private.clinical_record_canonical_payload(
    v_record,v_record.content,v_record.retrospective_reason
  );
  v_expected_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  if v_record.canonical_hash is distinct from v_expected_hash then
    raise exception using errcode='23514',message='finalized_record_hash_mismatch'; end if;

  v_jwt_claims:=nullif(current_setting('request.jwt.claims',true),'');
  v_auth_level:=coalesce(
    nullif(current_setting('request.jwt.claim.aal',true),''),
    nullif((v_jwt_claims::jsonb)->>'aal',''),'unknown'
  );

  if v_is_correction then
    perform set_config('nello.c4_transition_target',v_amendment.target_record_id::text,true);
    perform set_config('nello.c4_transition_status','corrected',true);
    update public.clinical_records set status='corrected',updated_at=now()
    where id=v_amendment.target_record_id and status='signed';
    if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;
    perform set_config('nello.c4_transition_target','',true);
    perform set_config('nello.c4_transition_status','',true);

    update public.clinical_records set status='signed',signed_at=v_signed_at,updated_at=now()
    where id=p_record_id and status='finalized'
    returning * into v_updated;
    if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;

    v_amendment_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
      'amendment_id',v_amendment.id,'amendment_type',v_amendment.amendment_type,
      'root_record_id',v_amendment.root_record_id,
      'target_record_id',v_amendment.target_record_id,
      'replacement_record_id',v_amendment.replacement_record_id,
      'reason',v_amendment.reason,'impact_hash',v_amendment.impact_hash,
      'responsible_id',v_amendment.responsible_id,'effective_at',v_signed_at,
      'replacement_canonical_hash',v_record.canonical_hash
    )::text,'UTF8'),'sha256'),'hex');

    update public.clinical_record_amendments set
      status='effective',effective_at=v_signed_at,canonical_hash=v_amendment_hash,
      authentication_evidence=jsonb_build_object(
        'signed_at',v_signed_at,'auth_level',v_auth_level,
        'crn_number',v_crn_number,'crn_region',v_crn_region
      )
    where id=v_amendment.id and status='draft';
    if not found then raise exception using errcode='40001',message='amendment_chain_conflict'; end if;

    insert into public.clinical_record_events(
      clinical_record_id,from_status,to_status,actor_id,reason,metadata
    ) values (
      v_amendment.target_record_id,'signed','corrected',v_actor,v_amendment.reason,
      jsonb_build_object('amendment_id',v_amendment.id,
        'replacement_record_id',p_record_id)
    );

    insert into public.activity_log(
      event_name,patient_id,nutritionist_id,actor_user_id,source_module,payload
    ) values (
      'clinical_record.corrected',v_record.patient_id,v_record.nutritionist_id,
      v_actor,'clinical_records',jsonb_build_object(
        'amendment_id',v_amendment.id,'clinical_record_id',v_amendment.target_record_id,
        'replacement_record_id',p_record_id,'care_episode_id',v_record.care_episode_id
      )
    );
    if v_record.visibility='shared_with_patient' then
      insert into public.notifications(user_id,type,title,message,content)
      values (
        v_record.patient_id,'clinical_record_corrected','Registro clínico atualizado',
        'Seu nutricionista atualizou um registro compartilhado.',
        jsonb_build_object('amendment_id',v_amendment.id,
          'clinical_record_id',v_amendment.target_record_id,
          'replacement_record_id',p_record_id,'care_episode_id',v_record.care_episode_id)
      ) on conflict do nothing;
    end if;
  else
    update public.clinical_records set status='signed',signed_at=v_signed_at,updated_at=now()
    where id=p_record_id and status='finalized' returning * into v_updated;
    if not found then
      raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
  end if;

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,metadata
  ) values (
    p_record_id,'finalized','signed',v_actor,jsonb_build_object(
      'canonical_hash',v_record.canonical_hash,
      'canonical_format_version',v_record.canonical_format_version,
      'crn_number',v_crn_number,'crn_region',v_crn_region,
      'signed_at',v_signed_at,'auth_level',v_auth_level,
      'amendment_id',case when v_is_correction then v_amendment.id else null end
    )
  );
  return private.project_clinical_evolution_record(v_updated);
end
$function$;
CREATE OR REPLACE FUNCTION public.sign_document_artifact(p_artifact_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_a public.document_artifacts%rowtype;v_v public.professional_verifications%rowtype;v_old public.document_artifacts%rowtype;v_code uuid:=gen_random_uuid();
begin
 perform private.wave05_require_active_actor();

 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or v_actor is null or v_actor<>v_a.professional_id or not private.can_manage_document_artifact(v_a.id) then raise exception using errcode='42501',message='document_signature_forbidden';end if;
 if v_a.status<>'finalized' then raise exception using errcode='23514',message='only_finalized_document_can_be_signed';end if;
 select * into v_v from public.professional_verifications where user_id=v_actor and professional_role='nutritionist' and status='approved' and valid_until>now();
 if not found or v_v.normalized_crn is null then raise exception using errcode='42501',message='verified_crn_required_for_signature';end if;
 if not exists(select 1 from public.professional_document_identities i where i.id=v_a.identity_id and i.professional_id=v_actor and i.normalized_crn=v_v.normalized_crn) then raise exception using errcode='42501',message='document_identity_verification_mismatch';end if;
 if v_a.supersedes_id is not null then
   select * into v_old from public.document_artifacts where id=v_a.supersedes_id for update;
   if not found or v_old.status not in ('signed','invalidated') or v_old.professional_id is distinct from v_a.professional_id
     or v_old.patient_id is distinct from v_a.patient_id or v_old.care_episode_id is distinct from v_a.care_episode_id
     or v_old.source_type is distinct from 'clinical_record' or v_a.source_type is distinct from 'clinical_record'
     or not exists(select 1 from public.clinical_records prior join public.clinical_records successor
       on coalesce(prior.root_record_id,prior.id)=coalesce(successor.root_record_id,successor.id)
       where prior.id=v_old.source_id and successor.id=v_a.source_id) then
     raise exception using errcode='22023',message='invalid_document_replacement';end if;
   -- An invalidated predecessor remains invalidated; the reviewed successor may still be signed.
   update public.document_artifacts set status='superseded',updated_at=now() where id=v_old.id and status='signed';
 end if;
 update public.document_artifacts set status='signed',signed_at=now(),signed_by=v_actor,signature_method='nello_internal',authenticity_code=v_code,
 signature_evidence=jsonb_build_object('method','nello_internal','actor_id',v_actor,'identity_id',v_a.identity_id,'canonical_sha256',v_a.canonical_sha256,'verified_crn',v_v.normalized_crn),revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,v_actor,'signed','finalized','signed','document_signed_internally',jsonb_build_object('method','nello_internal'));
 if v_a.supersedes_id is not null then
   insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.supersedes_id,v_actor,case when v_old.status='signed' then 'superseded' else 'replacement_signed' end,v_old.status,case when v_old.status='signed' then 'superseded' else 'invalidated' end,v_a.replacement_reason,jsonb_build_object('replacement_id',v_a.id));end if;
 return jsonb_build_object('artifact_id',v_a.id,'status','signed','authenticity_code',v_code,'sha256',v_a.canonical_sha256);
end$function$;
CREATE OR REPLACE FUNCTION public.start_care_episode(p_patient_id uuid, p_start_reason text DEFAULT 'care_started'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null or not exists (
    select 1 from public.nutritionist_patients np
    where np.patient_id=p_patient_id and np.nutritionist_id=auth.uid()
      and np.status='active'
  ) then
    raise exception 'ACTIVE_PATIENT_LINK_REQUIRED' using errcode='42501';
  end if;
  return private.start_care_episode(p_patient_id,p_start_reason);
end;
$function$;
CREATE OR REPLACE FUNCTION public.start_clinical_record_correction(p_record_id uuid, p_reason text, p_impact_confirmation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_target public.clinical_records%rowtype;
  v_signer uuid;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_impact jsonb;
  v_impact_hash text;
  v_replacement_id uuid:=gen_random_uuid();
  v_amendment_id uuid:=gen_random_uuid();
  v_replacement public.clinical_records%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='amendment_reason_length_invalid';
  end if;
  if jsonb_typeof(p_impact_confirmation) is distinct from 'object'
    or coalesce((p_impact_confirmation->>'confirmed')::boolean,false) is not true then
    raise exception using errcode='22023',message='amendment_impact_confirmation_required';
  end if;

  select * into v_target from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='clinical_record_not_found'; end if;
  if v_target.status<>'signed'
    and private.clinical_record_signed_by(v_target.id)=v_actor then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  if not private.can_start_clinical_record_correction(v_target.id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  perform r.id from public.clinical_records r
  where r.id in (v_target.root_record_id,v_target.id)
  order by r.id for update;
  select * into v_target from public.clinical_records where id=p_record_id;
  if v_target.status<>'signed' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;
  if not private.can_start_clinical_record_correction(v_target.id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  if exists (
    select 1 from public.clinical_record_amendments a
    where a.root_record_id=v_target.root_record_id
      and a.amendment_type='correction' and a.status='draft'
  ) then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  v_impact:=private.build_clinical_record_amendment_impact(v_target);
  v_impact_hash:=encode(extensions.digest(convert_to(v_impact::text,'UTF8'),'sha256'),'hex');
  if p_impact_confirmation->>'impact_hash' is distinct from v_impact_hash then
    raise exception using errcode='40001',message='amendment_impact_changed';
  end if;
  v_signer:=private.clinical_record_signed_by(v_target.id);

  insert into public.clinical_records(
    id,patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,status,visibility,encounter_at,recorded_at,retrospective_reason,
    content,source_references,template_code,template_version,revision,
    root_record_id,replaces_record_id,chain_version,canonical_format_version
  ) values (
    v_replacement_id,v_target.patient_id,v_target.care_episode_id,v_target.nutritionist_id,
    v_actor,v_target.student_id,v_target.supervisor_id,v_target.record_type,'draft',
    v_target.visibility,v_target.encounter_at,now(),v_target.retrospective_reason,
    v_target.content,v_target.source_references,v_target.template_code,v_target.template_version,1,
    v_target.root_record_id,v_target.id,v_target.chain_version+1,2
  ) returning * into v_replacement;

  insert into public.clinical_record_amendments(
    id,patient_id,care_episode_id,root_record_id,target_record_id,replacement_record_id,
    amendment_type,status,reason,impact_snapshot,impact_hash,actor_id,responsible_id,
    supervisor_id
  ) values (
    v_amendment_id,v_target.patient_id,v_target.care_episode_id,v_target.root_record_id,
    v_target.id,v_replacement_id,'correction','draft',v_reason,v_impact,v_impact_hash,
    v_actor,v_signer,case when v_target.student_id is not null then v_signer else null end
  );

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_replacement_id,null,'draft',v_actor,v_reason,
    jsonb_build_object('action','correction_started','amendment_id',v_amendment_id,
      'target_record_id',v_target.id,'root_record_id',v_target.root_record_id)
  );

  return private.project_clinical_evolution_record(v_replacement) || jsonb_build_object(
    'record_status',v_replacement.status,
    'replacement_record_id',v_replacement.id,
    'amendment_id',v_amendment_id,
    'amendment_status','draft'
  );
exception
  when unique_violation then
    raise exception using errcode='40001',message='amendment_chain_conflict';
end
$function$;
CREATE OR REPLACE FUNCTION public.submit_checkin_session(p_session_id uuid, p_responses jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_session public.checkin_sessions%rowtype;
  v_field jsonb;
  v_answer jsonb;
  v_key text;
  v_weight numeric;
  v_value numeric;
  v_total numeric := 0;
  v_max numeric := 0;
  v_pct numeric;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception 'CHECKIN_AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_responses) <> 'object' then raise exception 'CHECKIN_INVALID_RESPONSES'; end if;
  select * into v_session from public.checkin_sessions
  where id = p_session_id and patient_id = auth.uid() for update;
  if not found then raise exception 'CHECKIN_NOT_FOUND'; end if;
  if v_session.status <> 'pending' then raise exception 'CHECKIN_ALREADY_COMPLETED'; end if;
  if v_session.expires_at <= now() then raise exception 'CHECKIN_EXPIRED'; end if;
  if jsonb_array_length(v_session.fields_snapshot) = 0 then raise exception 'CHECKIN_WITHOUT_FIELDS'; end if;
  for v_field in select value from jsonb_array_elements(v_session.fields_snapshot) loop
    v_key := v_field->>'id';
    v_answer := p_responses->v_key;
    if coalesce((v_field->>'is_required')::boolean, true)
      and (v_answer is null or v_answer = 'null'::jsonb
        or v_answer = '""'::jsonb or v_answer = '[]'::jsonb) then
      raise exception 'CHECKIN_REQUIRED_FIELD_MISSING';
    end if;
    v_weight := greatest(0, coalesce((v_field->>'score_weight')::numeric, 1));
    v_max := v_max + v_weight * 10;
    v_value := 0;
    if v_answer is not null and v_answer <> 'null'::jsonb then
      if v_field->>'field_type' = 'scale_1_10' then
        if jsonb_typeof(v_answer) = 'array' then v_answer := v_answer->0; end if;
        if jsonb_typeof(v_answer) <> 'number' or (v_answer #>> '{}')::numeric < 1
          or (v_answer #>> '{}')::numeric > 10 then raise exception 'CHECKIN_INVALID_SCALE'; end if;
        v_value := (v_answer #>> '{}')::numeric;
      elsif v_field->>'field_type' = 'yes_no' then
        if v_answer not in ('"yes"'::jsonb, '"no"'::jsonb) then
          raise exception 'CHECKIN_INVALID_YES_NO';
        end if;
        if v_answer = '"yes"'::jsonb then v_value := 10; end if;
      elsif v_answer <> '""'::jsonb and v_answer <> '[]'::jsonb then
        v_value := 10;
      end if;
    end if;
    v_total := v_total + v_weight * v_value;
  end loop;
  v_pct := case when v_max > 0 then v_total / v_max * 100 else null end;
  update public.checkin_sessions set responses = p_responses, score_total = v_total,
    score_max = v_max, adherence_percentage = v_pct, status = 'completed', completed_at = now()
  where id = p_session_id;
  return v_pct;
end;
$function$;
CREATE OR REPLACE FUNCTION public.submit_professional_verification(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION public.suspend_professional_verification(p_verification_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.professional_verifications%rowtype;
begin
 perform private.wave05_require_active_actor();

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
$function$;
CREATE OR REPLACE FUNCTION public.update_clinical_record_draft(p_record_id uuid, p_content jsonb, p_visibility text DEFAULT NULL::text, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_template_sections jsonb;
  v_episode_status text;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  if p_visibility is not null and p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_visibility'; end if;

  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status<>'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_edited'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction';
  v_is_correction:=found;
  if v_is_correction and v_amendment.status<>'draft' then
    raise exception using errcode='40001',message='amendment_chain_conflict';
  end if;

  if v_is_correction then
    if p_visibility is not null and p_visibility<>v_record.visibility then
      raise exception using errcode='23514',message='correction_visibility_immutable';
    end if;
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'edit') then
      raise exception using errcode='42501',message='correction_edit_forbidden';
    end if;
  else
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if v_actor<>v_record.author_id
      and v_actor<>coalesce(v_record.supervisor_id,v_record.nutritionist_id) then
      raise exception using errcode='42501',message='draft_edit_forbidden'; end if;
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  perform private.validate_clinical_record_content(p_content,v_template_sections,false);

  update public.clinical_records set
    content=p_content,
    visibility=case when v_is_correction then visibility else coalesce(p_visibility,visibility) end,
    revision=revision+1,
    updated_at=now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then raise exception using errcode='40001',message='draft_revision_conflict'; end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','draft',v_actor,jsonb_build_object(
    'action','autosave','content_keys',
    (select coalesce(jsonb_agg(k order by k),'[]') from jsonb_object_keys(p_content) k),
    'amendment_id',case when v_is_correction then v_amendment.id else null end));
  return private.project_clinical_evolution_record(v_updated);
end
$function$;
CREATE OR REPLACE FUNCTION public.update_data_subject_request(p_request_id uuid, p_expected_revision bigint, p_status text, p_reason text, p_retention_decision text DEFAULT NULL::text, p_legal_basis text DEFAULT NULL::text, p_assign_to_me boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_request public.data_subject_requests%rowtype;v_reason text:=nullif(btrim(p_reason),'');v_event text;
begin
 perform private.wave05_require_active_actor();

 if not private.is_admin() then raise exception using errcode='42501',message='admin_required';end if;
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='administrative_reason_required';end if;
 if p_status not in('triaged','in_progress','fulfilled','rejected') then raise exception using errcode='22023',message='invalid_administrative_transition';end if;
 select * into v_request from public.data_subject_requests where id=p_request_id for update;
 if not found then raise exception using errcode='P0002',message='data_subject_request_not_found';end if;
 if v_request.revision<>p_expected_revision then raise exception using errcode='40001',message='data_subject_request_revision_conflict';end if;
 if v_request.status in('fulfilled','rejected','cancelled') then raise exception using errcode='23514',message='closed_data_subject_request_is_immutable';end if;
 if p_status='triaged' and v_request.status<>'submitted' then raise exception using errcode='23514',message='invalid_data_subject_request_transition';end if;
 if p_status='in_progress' and v_request.status not in('submitted','triaged') then raise exception using errcode='23514',message='invalid_data_subject_request_transition';end if;
 if p_status in('fulfilled','rejected') and v_request.status not in('triaged','in_progress') then raise exception using errcode='23514',message='request_must_be_triaged_before_completion';end if;
 if p_retention_decision is not null and p_retention_decision not in('retain_legal_obligation','anonymize','delete_non_clinical','no_deletion_applicable') then raise exception using errcode='22023',message='invalid_retention_decision';end if;
 if p_status in('fulfilled','rejected') and nullif(btrim(p_legal_basis),'') is null then raise exception using errcode='22023',message='privacy_completion_legal_basis_required';end if;
 if v_request.request_type='deletion' and p_status='fulfilled' and p_retention_decision is null then raise exception using errcode='22023',message='deletion_retention_decision_required';end if;
 v_event:=case p_status when 'triaged'then'triaged' when'in_progress'then'started' when'fulfilled'then'fulfilled' else'rejected'end;
 update public.data_subject_requests set status=p_status,assigned_to=case when p_assign_to_me then v_actor else assigned_to end,resolution_summary=case when p_status in('fulfilled','rejected')then v_reason else resolution_summary end,legal_basis=nullif(btrim(p_legal_basis),''),retention_decision=p_retention_decision,completed_at=case when p_status in('fulfilled','rejected')then now()else null end,updated_at=now(),revision=revision+1 where id=v_request.id;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_request.id,v_actor,v_event,v_request.status,p_status,v_reason,jsonb_strip_nulls(jsonb_build_object('retention_decision',p_retention_decision)));
 insert into public.notifications(user_id,type,content,is_read,title,message)values(v_request.subject_id,'privacy_request_update',jsonb_build_object('request_id',v_request.id,'status',p_status),false,'AtualizaÃ§Ã£o da sua solicitaÃ§Ã£o',case when p_status in('fulfilled','rejected')then v_reason else 'Sua solicitaÃ§Ã£o de privacidade avanÃ§ou para uma nova etapa.'end);
 return jsonb_build_object('id',v_request.id,'status',p_status,'revision',v_request.revision+1);
end$function$;
CREATE OR REPLACE FUNCTION public.update_diet_template(p_template_id uuid, p_user_id uuid, p_name text, p_description text, p_tags text[], p_meals jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_current integer;v_meal jsonb;v_meal_id uuid;v_food jsonb;begin
 perform private.wave05_require_active_actor();
 if auth.uid()is null or p_user_id<>auth.uid()then raise exception using errcode='42501',message='template_owner_mismatch';end if;if length(coalesce(btrim(p_name),''))<3 or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_diet_template_payload';end if;select current_version into v_current from public.diet_templates where id=p_template_id and user_id=auth.uid()for update;if not found then raise exception using errcode='42501',message='template_not_found_or_forbidden';end if;insert into public.diet_template_versions(template_id,version,snapshot,change_reason,created_by)values(p_template_id,v_current,private.build_diet_template_snapshot(p_template_id),'Snapshot anterior Ã  ediÃ§Ã£o',auth.uid())on conflict(template_id,version)do nothing;delete from public.diet_template_meals where template_id=p_template_id;update public.diet_templates set name=btrim(p_name),description=nullif(btrim(p_description),''),tags=coalesce(p_tags,'{}'::text[]),current_version=v_current+1,updated_at=now()where id=p_template_id;for v_meal in select value from jsonb_array_elements(coalesce(p_meals,'[]'::jsonb))loop insert into public.diet_template_meals(template_id,name,time,order_index)values(p_template_id,coalesce(nullif(btrim(v_meal->>'name'),''),'RefeiÃ§Ã£o'),nullif(v_meal->>'time','')::time,coalesce((v_meal->>'order_index')::integer,0))returning id into v_meal_id;for v_food in select value from jsonb_array_elements(coalesce(v_meal->'foods','[]'::jsonb))loop insert into public.diet_template_foods(meal_id,food_id,quantity,unit,observation,order_index)values(v_meal_id,(v_food->>'food_id')::uuid,(v_food->>'quantity')::numeric,coalesce(nullif(v_food->>'unit',''),'g'),nullif(v_food->>'observation',''),coalesce((v_food->>'order_index')::integer,0));end loop;end loop;insert into public.diet_template_versions(template_id,version,snapshot,change_reason,created_by)values(p_template_id,v_current+1,private.build_diet_template_snapshot(p_template_id),'Template atualizado',auth.uid());end$function$;
CREATE OR REPLACE FUNCTION public.update_document_artifact_draft(p_artifact_id uuid, p_payload jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.document_artifacts%rowtype;v_size integer;
begin
 perform private.wave05_require_active_actor();

 if jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='document_draft_payload_must_be_object';end if;
 v_size:=octet_length(p_payload::text);if v_size>1048576 then raise exception using errcode='22023',message='document_draft_payload_too_large';end if;
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or not private.can_manage_document_artifact(p_artifact_id) then raise exception using errcode='42501',message='document_artifact_write_forbidden';end if;
 if v_a.status<>'draft' then raise exception using errcode='23514',message='only_draft_document_can_change';end if;
 if p_expected_revision is distinct from v_a.revision then raise exception using errcode='40001',message='document_artifact_revision_conflict';end if;
 update public.document_artifacts set draft_payload=p_payload,revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,auth.uid(),'draft_updated','draft','draft','document_draft_updated',jsonb_build_object('revision',v_a.revision+1));
 return jsonb_build_object('artifact_id',v_a.id,'status','draft','revision',v_a.revision+1);
end$function$;
CREATE OR REPLACE FUNCTION public.update_patient_progressive_profile(p_patient_id uuid, p_changes jsonb, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_key text; v_old jsonb; v_new jsonb; v_episode uuid; v_profile jsonb;
begin
 perform private.wave05_require_active_actor();

 if not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb then raise exception using errcode='22023',message='profile_changes_required'; end if;
  if p_source not in ('patient','nutritionist','legal_guardian','migration') then raise exception using errcode='22023',message='invalid_profile_source'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('name','phone','birth_date','gender','email','occupation','civil_status','address')) then
    raise exception using errcode='22023',message='profile_field_not_allowed';
  end if;
  if v_actor=p_patient_id then if p_source<>'patient' then raise exception using errcode='42501',message='invalid_profile_source_for_actor'; end if;
  else v_episode:=private.resolve_active_care_episode(p_patient_id); if p_source<>'nutritionist' then raise exception using errcode='42501',message='invalid_profile_source_for_actor'; end if; end if;
  if p_changes ? 'name' and length(btrim(coalesce(p_changes->>'name','')))=0 then raise exception using errcode='23514',message='patient_name_required'; end if;
  select to_jsonb(p) into v_profile from public.user_profiles p where p.id=p_patient_id and p.user_type='patient' for update;
  if v_profile is null then raise exception using errcode='P0002',message='patient_not_found'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    v_old:=v_profile->v_key; v_new:=p_changes->v_key;
    case v_key
      when 'name' then update public.user_profiles set name=p_changes->>'name' where id=p_patient_id;
      when 'phone' then update public.user_profiles set phone=p_changes->>'phone' where id=p_patient_id;
      when 'birth_date' then update public.user_profiles set birth_date=nullif(p_changes->>'birth_date','')::date where id=p_patient_id;
      when 'gender' then update public.user_profiles set gender=p_changes->>'gender' where id=p_patient_id;
      when 'email' then update public.user_profiles set email=p_changes->>'email' where id=p_patient_id;
      when 'occupation' then update public.user_profiles set occupation=p_changes->>'occupation' where id=p_patient_id;
      when 'civil_status' then update public.user_profiles set civil_status=p_changes->>'civil_status' where id=p_patient_id;
      when 'address' then update public.user_profiles set address=p_changes->'address' where id=p_patient_id;
    end case;
    insert into public.patient_profile_events(patient_id,field_name,previous_value,new_value,source,actor_id,care_episode_id)
      values(p_patient_id,v_key,v_old,v_new,p_source,v_actor,v_episode);
  end loop;
  select jsonb_build_object('id',p.id,'name',p.name,'phone',p.phone,'birth_date',p.birth_date,'gender',p.gender,
    'email',p.email,'occupation',p.occupation,'civil_status',p.civil_status,'address',p.address)
    into v_profile from public.user_profiles p where p.id=p_patient_id;
  return v_profile;
end $function$;
CREATE OR REPLACE FUNCTION public.upsert_patient_legal_guardian(p_patient_id uuid, p_episode_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_id uuid; v_previous public.patient_episode_legal_guardians%rowtype; v_reason text;
  v_valid_from timestamptz:=now(); v_valid_until timestamptz;
  v_contact jsonb:=coalesce(p_payload->'contact','{}'::jsonb); v_consent jsonb:=coalesce(p_payload->'consent','{"recorded":false}'::jsonb);
begin
 perform private.wave05_require_active_actor();

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
end $function$;
CREATE OR REPLACE FUNCTION public.version_private_evolution_template(p_template_code text, p_sections jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_template public.clinical_evolution_templates%rowtype;
  v_version integer;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  select t.* into v_template from public.clinical_evolution_templates t
  where t.code=p_template_code for update;
  if not found or v_template.category<>'private' or v_template.owner_id<>v_actor then
    raise exception using errcode='42501',message='private_template_owner_required';
  end if;
  if not v_template.is_active then
    raise exception using errcode='23514',message='private_template_archived';
  end if;
  if private.validate_evolution_template_sections(p_sections) is not true then
    raise exception using errcode='22023',message='invalid_template_sections';
  end if;

  select coalesce(max(v.version),0)+1 into v_version
  from public.clinical_evolution_template_versions v
  where v.template_code=p_template_code;
  insert into public.clinical_evolution_template_versions(
    template_code,version,sections_snapshot,created_by
  ) values (p_template_code,v_version,p_sections,v_actor);
  update public.clinical_evolution_templates
  set sections=p_sections,updated_at=now() where code=p_template_code;
  insert into public.clinical_evolution_template_events(
    template_code,version,action,actor_id
  ) values (p_template_code,v_version,'versioned',v_actor);

  return jsonb_build_object('code',p_template_code,'version',v_version,
    'sections_snapshot',p_sections);
end $function$;
create or replace function public.record_my_privacy_choice(p_version text,p_terms boolean,p_analytics boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then raise exception using errcode='42501', message='authentication_required'; end if;
  if p_version is distinct from '2026-10-01' or p_terms is null or p_analytics is null then
    raise exception using errcode='22023', message='invalid_privacy_choice';
  end if;
  insert into private.auth_legal_receipts(user_id,version,purpose,allowed,source)
  values (auth.uid(),p_version,'terms',p_terms,'preferences'),
         (auth.uid(),p_version,'analytics',p_analytics,'preferences');
end;
$function$;

CREATE OR REPLACE FUNCTION private.transition_appointment_status(p_appointment_id bigint, p_next_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_tx public.financial_transactions%ROWTYPE;
  v_actor uuid := auth.uid();
  v_next text := CASE WHEN p_next_status = 'canceled' THEN 'cancelled' ELSE p_next_status END;
BEGIN
 perform private.wave05_require_active_actor();
  IF p_appointment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_appointment_id');
  END IF;
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_actor');
  END IF;
  SELECT * INTO v_appt FROM public.appointments
  WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  END IF;
  IF v_actor <> v_appt.nutritionist_id AND
     (v_appt.patient_id IS NULL OR v_actor <> v_appt.patient_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;
  IF v_next = v_appt.status THEN
    RETURN jsonb_build_object('ok', true, 'appointment_id', p_appointment_id,
      'status', v_appt.status, 'no_change', true);
  END IF;
  IF NOT (
    (v_appt.status IN ('scheduled', 'awaiting_confirmation') AND v_next IN ('confirmed', 'cancelled'))
    OR (v_appt.status = 'confirmed' AND v_next IN ('completed', 'cancelled', 'no_show'))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason',
      CASE WHEN v_appt.status IN ('completed', 'cancelled', 'no_show')
        THEN 'terminal_status_locked' ELSE 'invalid_transition' END);
  END IF;
  SELECT * INTO v_tx FROM public.financial_transactions
  WHERE appointment_id = p_appointment_id FOR UPDATE;
  UPDATE public.appointments SET status = v_next
  WHERE id = p_appointment_id RETURNING * INTO v_appt;
  IF v_next = 'cancelled' AND v_tx.id IS NOT NULL
     AND v_tx.status IN ('pending', 'overdue') THEN
    DELETE FROM public.financial_transactions WHERE id = v_tx.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'appointment', to_jsonb(v_appt));
END;
$function$;
CREATE OR REPLACE FUNCTION public.extract_and_inject_clinical_flags(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_record record;
  v_new_flags jsonb := '{}'::jsonb;
  v_field record;
  v_section record;
  v_answer text;
begin
 perform private.wave05_require_active_actor();
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.';
  end if;

  select r.*, coalesce(r.template_snapshot->'sections',t.sections) as sections
  into v_record
  from public.anamnesis_records r
  left join public.anamnesis_templates t on t.id = r.template_id
  where r.id = p_record_id
    and private.can_write_active_care_episode(r.care_episode_id) and r.status in ('validated','submitted','completed');

  if not found then
    raise exception 'Acesso negado.';
  end if;

  for v_section in
    select * from jsonb_array_elements(coalesce(v_record.sections, '[]'::jsonb)) s
  loop
    for v_field in
      select * from jsonb_array_elements(coalesce(v_section.value->'fields', '[]'::jsonb)) f
    loop
      if v_field.value->>'clinical_flag_key' is not null then
        v_answer := v_record.content->>(v_field.value->>'id');
        if v_answer is not null
           and v_answer <> ''
           and v_answer not in ('false', 'nao', 'não') then
          v_new_flags := v_new_flags || jsonb_build_object(
            v_field.value->>'clinical_flag_key',
            jsonb_build_object(
              'value', v_answer,
              'label', v_field.value->>'label',
              'captured_at', now()::text,
              'source', 'anamnesis',
              'record_id', p_record_id::text
            )
          );
        end if;
      end if;
    end loop;
  end loop;

  if v_new_flags <> '{}'::jsonb then
    update public.user_profiles
    set clinical_flags = coalesce(clinical_flags, '{}'::jsonb) || v_new_flags
    where id = v_record.patient_id;
  end if;

  return jsonb_build_object('success', true, 'flags_injected', v_new_flags);
end;
$function$;

-- Preserve the Wave 4 invitation guard and its renamed reviewed Wave 3 delegate.
CREATE OR REPLACE FUNCTION private.redeem_invite_code(input_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_profile public.user_profiles%rowtype; v_target public.user_profiles%rowtype;
begin
 perform private.wave05_require_active_actor();
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

commit;

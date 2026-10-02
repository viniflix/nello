-- Operational feed follows active care; historical clinical records remain untouched.
BEGIN;
UPDATE public.feed_tasks f SET is_current=false
 WHERE f.is_current AND f.patient_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.care_episodes e JOIN public.user_profiles p ON p.id=e.patient_id
 WHERE e.patient_id=f.patient_id AND e.nutritionist_id=f.nutritionist_id AND e.status='active' AND p.is_active);
UPDATE public.feed_tasks f SET metadata=coalesce(f.metadata,'{}')||jsonb_build_object('care_episode_id',e.id)
 FROM public.care_episodes e WHERE f.is_current AND f.patient_id=e.patient_id
 AND f.nutritionist_id=e.nutritionist_id AND e.status='active';

CREATE OR REPLACE FUNCTION private.retire_care_feed_tasks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 UPDATE public.feed_tasks SET is_current=false WHERE is_current AND patient_id=NEW.patient_id
 AND nutritionist_id=NEW.nutritionist_id AND
 (NEW.status<>'active' OR metadata->>'care_episode_id' IS DISTINCT FROM NEW.id::text);
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION private.retire_care_feed_tasks() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retire_care_feed_tasks AFTER INSERT OR UPDATE OF status ON public.care_episodes
 FOR EACH ROW EXECUTE FUNCTION private.retire_care_feed_tasks();

CREATE OR REPLACE FUNCTION private.feed_active_scope(p_patient uuid,p_expected_episode text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_episode uuid;
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF NOT private.wave09_professional_actor() THEN RAISE EXCEPTION USING errcode='42501',message='forbidden'; END IF;
 SELECT e.id INTO v_episode FROM public.care_episodes e JOIN public.user_profiles p ON p.id=e.patient_id
 WHERE e.patient_id=p_patient AND e.nutritionist_id=auth.uid() AND e.status='active'
 AND p.is_active AND private.can_write_active_care_episode(e.id);
 IF v_episode IS NOT NULL THEN
  IF p_expected_episode IS NOT NULL AND p_expected_episode IS DISTINCT FROM v_episode::text THEN
   RETURN jsonb_build_object('status','obsolete');
  END IF;
  RETURN jsonb_build_object('status','active','care_episode_id',v_episode);
 END IF;
 IF EXISTS (SELECT 1 FROM public.care_episodes WHERE patient_id=p_patient AND nutritionist_id=auth.uid()) THEN
  RETURN jsonb_build_object('status','obsolete');
 END IF;
 RAISE EXCEPTION USING errcode='42501',message='forbidden';
END $function$;
REVOKE ALL ON FUNCTION private.feed_active_scope(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.feed_active_scope(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_feed_patients()
RETURNS TABLE(id uuid,name text,birth_date date,avatar_url text,slug text,care_episode_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF NOT private.wave09_professional_actor() THEN RAISE EXCEPTION USING errcode='42501',message='forbidden'; END IF;
 RETURN QUERY SELECT p.id,p.name,p.birth_date,p.avatar_url,p.slug,e.id
 FROM public.care_episodes e JOIN public.user_profiles p ON p.id=e.patient_id
 WHERE e.nutritionist_id=auth.uid() AND e.status='active' AND p.is_active
 AND private.can_write_active_care_episode(e.id);
END $function$;
REVOKE ALL ON FUNCTION public.get_active_feed_patients() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_active_feed_patients() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_feed_task_states() RETURNS SETOF public.feed_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF NOT private.wave09_professional_actor() THEN RAISE EXCEPTION USING errcode='42501',message='forbidden'; END IF;
 RETURN QUERY SELECT f.* FROM public.feed_tasks f WHERE f.nutritionist_id=auth.uid() AND f.is_current
 AND (f.patient_id IS NULL OR EXISTS (SELECT 1 FROM public.care_episodes e JOIN public.user_profiles p ON p.id=e.patient_id
 WHERE e.patient_id=f.patient_id AND e.nutritionist_id=auth.uid() AND e.status='active' AND p.is_active
 AND f.metadata->>'care_episode_id'=e.id::text AND private.can_write_active_care_episode(e.id)));
END $function$;
REVOKE ALL ON FUNCTION public.get_my_feed_task_states() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_feed_task_states() TO authenticated;

-- Reactivation is restricted to an existing relationship/history, never an
-- arbitrary patient UUID. The private lifecycle rechecks competing active care.
CREATE OR REPLACE FUNCTION public.start_care_episode(p_patient_id uuid,p_start_reason text DEFAULT 'care_started'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 PERFORM private.wave05_require_active_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended(p_patient_id::text,0));
 IF NOT private.wave09_professional_actor() OR NOT EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.id=p_patient_id AND p.user_type='patient' AND p.is_active)
 OR NOT (EXISTS (SELECT 1 FROM (
   SELECT e.status,e.ended_by,e.end_reason FROM public.care_episodes e
   WHERE e.patient_id=p_patient_id AND e.nutritionist_id=auth.uid()
   ORDER BY (e.status='active') DESC,e.started_at DESC,e.created_at DESC,e.ended_at DESC,e.id DESC LIMIT 1
  ) latest WHERE latest.status='active' OR latest.ended_by=auth.uid()
   OR (latest.ended_by IS NULL AND latest.end_reason='legacy_episode_reconstructed'))
  OR EXISTS (SELECT 1 FROM public.nutritionist_patients np WHERE np.patient_id=p_patient_id
   AND np.nutritionist_id=auth.uid() AND np.status='active'
   AND NOT EXISTS (SELECT 1 FROM public.care_episodes e WHERE e.patient_id=p_patient_id AND e.nutritionist_id=auth.uid()))) THEN
  RAISE EXCEPTION USING errcode='42501',message='existing_care_relationship_required';
 END IF;
 RETURN private.start_care_episode(p_patient_id,p_start_reason);
END $function$;
REVOKE ALL ON FUNCTION public.start_care_episode(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_care_episode(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_comprehensive_activity_feed_optimized(p_nutritionist_id uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(activity_type text, activity_id text, patient_id uuid, patient_name text, activity_date timestamp with time zone, activity_data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare q text; queries text[] := '{}'; begin
 perform private.wave05_require_active_actor();
 if p_nutritionist_id is distinct from auth.uid() or not private.wave05_active_actor() then raise exception using errcode='42501',message='forbidden';end if;  if p_limit is null or p_limit < 1 then p_limit := 30; end if; p_limit := least(p_limit,100); if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_audit_log') then q := 'select ''meal''::text as activity_type, mal.id::text as activity_id, mal.patient_id::uuid as patient_id, p.name as patient_name, mal.created_at as activity_date, jsonb_build_object(''meal_type'', mal.meal_type, ''total_calories'', case when mal.details->>''total_calories'' ~ ''^[0-9]{1,8}([.][0-9]{1,4})?$'' then (mal.details->>''total_calories'')::numeric else null end, ''action'', mal.action) as activity_data from public.meal_audit_log mal join patients p on p.id = mal.patient_id where private.can_write_active_care_episode(mal.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'growth_records') then q := 'select ''anthropometry''::text as activity_type, gr.id::text as activity_id, gr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(gr.record_date::timestamptz, gr.created_at, now()) as activity_date, jsonb_build_object(''weight'', gr.weight, ''height'', gr.height) as activity_data from public.growth_records gr join patients p on p.id = gr.patient_id where private.can_write_active_care_episode(gr.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'anamnesis_records') then q := 'select ''anamnesis''::text as activity_type, anr.id::text as activity_id, anr.patient_id::uuid as patient_id, p.name as patient_name, coalesce(anr.date::timestamptz, anr.created_at, now()) as activity_date, jsonb_build_object(''status'', ''completed'') as activity_data from public.anamnesis_records anr join patients p on p.id = anr.patient_id where private.can_write_active_care_episode(anr.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'meal_plans') then q := 'select ''meal_plan''::text as activity_type, mp.id::text as activity_id, mp.patient_id::uuid as patient_id, p.name as patient_name, mp.created_at as activity_date, jsonb_build_object(''name'', mp.name) as activity_data from public.meal_plans mp join patients p on p.id = mp.patient_id where private.can_write_active_care_episode(mp.care_episode_id)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'appointments') then q := 'select ''appointment''::text as activity_type, a.id::text as activity_id, a.patient_id::uuid as patient_id, p.name as patient_name, coalesce(a.start_time, a.appointment_time, now()) as activity_date, jsonb_build_object(''notes'', a.notes) as activity_data from public.appointments a join patients p on p.id = a.patient_id where private.can_write_active_care_episode(a.care_episode_id) or (a.care_episode_id is null and a.nutritionist_id=$1)'; queries := array_append(queries, q); end if; if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_achievements') then q := 'select ''achievement''::text as activity_type, ua.id::text as activity_id, ua.user_id::uuid as patient_id, p.name as patient_name, ua.achieved_at as activity_date, jsonb_build_object(''achievement_id'', ua.achievement_id) as activity_data from public.user_achievements ua join patients p on p.id = ua.user_id'; queries := array_append(queries, q); end if; if array_length(queries, 1) is null then return; end if; q := 'with patients as (select p.id, p.name from public.user_profiles p where p.is_active and exists (select 1 from public.care_episodes e where e.patient_id=p.id and e.nutritionist_id=$1 and e.status=''active'' and private.can_write_active_care_episode(e.id))) select * from (' || array_to_string(queries, ' union all ') || ') feed order by activity_date desc nulls last limit $2'; return query execute q using p_nutritionist_id, p_limit; end; $function$;

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
        SELECT up.id AS patient_id, up.name AS patient_name, e.id AS care_episode_id
        FROM public.user_profiles up JOIN public.care_episodes e ON e.patient_id=up.id
        WHERE e.nutritionist_id=p_nutritionist_id AND e.status='active'
          AND up.user_type='patient' AND up.is_active AND private.can_write_active_care_episode(e.id)
    ),
    patient_anamnese AS (
        SELECT DISTINCT ar.patient_id
        FROM anamnesis_records ar
        INNER JOIN active_patients ap ON ap.patient_id = ar.patient_id AND ap.care_episode_id=ar.care_episode_id
    ),
    patient_anthropometry AS (
        SELECT DISTINCT gr.patient_id
        FROM growth_records gr
        INNER JOIN active_patients ap ON ap.patient_id = gr.patient_id AND ap.care_episode_id=gr.care_episode_id
    ),
    patient_meal_plans AS (
        SELECT DISTINCT mp.patient_id
        FROM meal_plans mp
        INNER JOIN active_patients ap ON ap.patient_id = mp.patient_id AND ap.care_episode_id=mp.care_episode_id
        WHERE mp.is_active = true
    ),
    patient_prescriptions AS (
        SELECT DISTINCT pr.patient_id
        FROM prescriptions pr
        INNER JOIN active_patients ap ON ap.patient_id = pr.patient_id AND ap.care_episode_id=pr.care_episode_id
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
        JOIN public.care_episodes e ON e.patient_id=up.id AND e.nutritionist_id=p_nutritionist_id
          AND e.status='active' AND private.can_write_active_care_episode(e.id)
        LEFT JOIN meals m ON m.patient_id = up.id AND m.care_episode_id=e.id AND m.deleted_at IS NULL
        WHERE
            up.user_type = 'patient'
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


CREATE OR REPLACE FUNCTION public.save_feed_task(p_values jsonb,p_expected timestamptz,p_action text,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_row public.feed_tasks%ROWTYPE; v_value public.feed_tasks%ROWTYPE; v_ids text[]; v_hash text; v_history jsonb; v_at timestamptz:=clock_timestamp(); v_scope jsonb;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING errcode='42501',message='account_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR octet_length(p_values::text)>262144 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_task'; END IF;
 v_value:=jsonb_populate_record(NULL::public.feed_tasks,p_values);
 IF v_value.nutritionist_id IS DISTINCT FROM p_actor OR v_value.source_id IS NULL OR v_value.source_type IS NULL
  OR NOT private.wave09_professional_actor() THEN RAISE EXCEPTION USING errcode='42501',message='forbidden'; END IF;
 IF v_value.patient_id IS NOT NULL THEN
  -- Same patient lock as start/end: a write either precedes archive or sees it.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_value.patient_id::text,0));
  v_scope:=private.feed_active_scope(v_value.patient_id,v_value.metadata->>'care_episode_id');
  IF v_scope->>'status'='obsolete' THEN
   RETURN jsonb_build_object('no_longer_applicable',true,'source_type',v_value.source_type,'source_id',v_value.source_id);
  END IF;
  v_value.metadata:=coalesce(v_value.metadata,'{}')||jsonb_build_object('care_episode_id',v_scope->>'care_episode_id');
 END IF;
 IF p_action IS NOT NULL AND p_action NOT IN ('resolved','snoozed','reopened','resolved_batch','snoozed_batch') THEN RAISE EXCEPTION USING errcode='22023',message='invalid_action'; END IF;
 v_hash:=md5(jsonb_build_object('values',p_values,'action',p_action,'expected',p_expected)::text);
 v_ids:=private.wave09_receipt(p_nonce,'feed',v_hash);
 IF v_ids IS NOT NULL THEN
  SELECT * INTO v_row FROM public.feed_tasks WHERE id::text=v_ids[1] AND is_current;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='task_unavailable'; END IF;
  RETURN to_jsonb(v_row);
 END IF;
 -- The unique index serializes concurrent first sightings. DO NOTHING preserves
 -- an explicit resolution recorded while another browser generated its snapshot.
 INSERT INTO public.feed_tasks(nutritionist_id,patient_id,source_type,source_id,title,description,priority_score,priority_reason,status,snooze_until,metadata,first_seen_at,last_seen_at)
 VALUES(p_actor,v_value.patient_id,v_value.source_type,v_value.source_id,v_value.title,v_value.description,coalesce(v_value.priority_score,0),v_value.priority_reason,'open',NULL,coalesce(v_value.metadata,'{}'),v_at,v_at)
 ON CONFLICT(nutritionist_id,source_type,source_id) WHERE is_current AND source_id IS NOT NULL DO NOTHING;
 SELECT * INTO v_row FROM public.feed_tasks WHERE nutritionist_id=p_actor AND source_type=v_value.source_type AND source_id=v_value.source_id AND is_current FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='task_unavailable'; END IF;
 IF p_expected IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='task_changed'; END IF;
 IF p_action IS NOT NULL THEN
  IF p_action IN ('resolved','resolved_batch') THEN v_value.status:='resolved';v_value.snooze_until:=NULL;
  ELSIF p_action='reopened' THEN v_value.status:='open';v_value.snooze_until:=NULL;
  ELSE v_value.status:='snoozed';IF v_value.snooze_until IS NULL OR v_value.snooze_until<=v_at THEN RAISE EXCEPTION USING errcode='22023',message='future_snooze_required'; END IF;END IF;
  v_history:=jsonb_build_array(jsonb_build_object('action',p_action,'at',v_at,'status',v_value.status,'snooze_until',v_value.snooze_until));
  SELECT v_history||coalesce(jsonb_agg(value),'[]') INTO v_history FROM (SELECT value FROM jsonb_array_elements(coalesce(v_row.metadata->'audit_history','[]')) LIMIT 9) old;
  UPDATE public.feed_tasks SET status=v_value.status,snooze_until=v_value.snooze_until,resolved_at=CASE WHEN v_value.status='resolved' THEN v_at ELSE NULL END,
   metadata=coalesce(v_row.metadata,'{}')||jsonb_build_object('audit_history',v_history,'last_action',p_action,'last_action_at',v_at),updated_at=v_at WHERE id=v_row.id RETURNING * INTO v_row;
 ELSE
  UPDATE public.feed_tasks SET patient_id=v_value.patient_id,title=v_value.title,description=v_value.description,priority_score=coalesce(v_value.priority_score,0),priority_reason=v_value.priority_reason,
   metadata=coalesce(v_row.metadata,'{}')||coalesce(v_value.metadata,'{}'),last_seen_at=v_at,updated_at=v_at,
   status=CASE WHEN status='snoozed' AND snooze_until<=v_at THEN 'open' ELSE status END,
   snooze_until=CASE WHEN status='snoozed' AND snooze_until<=v_at THEN NULL ELSE snooze_until END
   WHERE id=v_row.id RETURNING * INTO v_row;
 END IF;
 PERFORM private.wave09_receipt(p_nonce,'feed',v_hash,ARRAY[v_row.id::text]);
 RETURN to_jsonb(v_row);
END $function$;
REVOKE ALL ON FUNCTION public.save_feed_task(jsonb,timestamptz,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_feed_task(jsonb,timestamptz,text,uuid,uuid) TO authenticated;


COMMIT;

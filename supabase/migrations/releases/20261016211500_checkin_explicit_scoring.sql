-- Existing issued sessions retain v1 and their frozen questions/results.
-- New sessions use explicit professional criteria; no historical recalculation.
ALTER TABLE public.checkin_fields ADD COLUMN scoring_rule jsonb;
ALTER TABLE public.checkin_fields ADD CONSTRAINT checkin_explicit_rule CHECK (
 scoring_rule IS NULL OR coalesce((jsonb_typeof(scoring_rule)='object'
 AND scoring_rule->'version'='2'::jsonb
 AND (scoring_rule - ARRAY['version','mode'])='{}'::jsonb
 AND (scoring_rule->>'mode'='none'
  OR (field_type='yes_no' AND scoring_rule->>'mode' IN ('yes','no'))
  OR (field_type='scale_1_10' AND scoring_rule->>'mode' IN ('higher_better','lower_better')))),false));
ALTER TABLE public.checkin_sessions ADD COLUMN score_version smallint NOT NULL DEFAULT 1 CHECK (score_version IN (1,2));
ALTER TABLE public.checkin_sessions ALTER COLUMN score_version SET DEFAULT 2;

CREATE OR REPLACE FUNCTION private.checkin_score_v2(p_fields jsonb,p_responses jsonb)
RETURNS TABLE(total numeric, maximum numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $function$
DECLARE f jsonb; answer jsonb; mode text; kind text; weight numeric; value numeric; present boolean;
BEGIN
 IF p_fields IS NULL OR jsonb_typeof(p_fields)<>'array' OR jsonb_array_length(p_fields)=0 THEN RAISE EXCEPTION 'CHECKIN_WITHOUT_FIELDS'; END IF;
 IF p_responses IS NULL OR jsonb_typeof(p_responses)<>'object' THEN RAISE EXCEPTION 'CHECKIN_INVALID_RESPONSES'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_responses) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_fields) field WHERE field->>'id'=k)) THEN RAISE EXCEPTION 'CHECKIN_UNKNOWN_FIELD'; END IF;
 total:=0;maximum:=0;
 FOR f IN SELECT jsonb_array_elements(p_fields) LOOP
  kind:=f->>'field_type';answer:=p_responses->(f->>'id');
  present:=answer IS NOT NULL AND answer NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb)
   AND NOT (jsonb_typeof(answer)='string' AND btrim(answer #>> '{}')='');
  IF NOT present THEN
   IF coalesce((f->>'is_required')::boolean,true) THEN RAISE EXCEPTION 'CHECKIN_REQUIRED_FIELD_MISSING'; END IF;
   CONTINUE;
  END IF;
  IF kind='scale_1_10' THEN
   IF jsonb_typeof(answer)='array' THEN
    IF jsonb_array_length(answer)<>1 THEN RAISE EXCEPTION 'CHECKIN_INVALID_SCALE'; END IF;
    answer:=answer->0;
   END IF;
   IF jsonb_typeof(answer)<>'number' THEN RAISE EXCEPTION 'CHECKIN_INVALID_SCALE'; END IF;
   value:=(answer #>> '{}')::numeric;
   IF value<1 OR value>10 OR trunc(value)<>value THEN RAISE EXCEPTION 'CHECKIN_INVALID_SCALE'; END IF;
  ELSIF kind='yes_no' THEN
   IF answer NOT IN ('"yes"'::jsonb,'"no"'::jsonb) THEN RAISE EXCEPTION 'CHECKIN_INVALID_YES_NO'; END IF;
  ELSIF kind='text' THEN
   IF jsonb_typeof(answer)<>'string' OR length(answer #>> '{}')>10000 THEN RAISE EXCEPTION 'CHECKIN_INVALID_TEXT'; END IF;
  ELSIF kind='number' THEN
   IF jsonb_typeof(answer) NOT IN ('number','string') OR (answer #>> '{}') !~ '^-?([0-9]+([.][0-9]+)?|[.][0-9]+)$' THEN RAISE EXCEPTION 'CHECKIN_INVALID_NUMBER'; END IF;
  ELSIF kind='multiple_choice' THEN
   IF jsonb_typeof(answer)<>'string' OR NOT coalesce(f->'options' ? (answer #>> '{}'),false) THEN RAISE EXCEPTION 'CHECKIN_INVALID_OPTION'; END IF;
  ELSE RAISE EXCEPTION 'CHECKIN_UNSUPPORTED_FIELD';
  END IF;
  mode:=coalesce(f->'scoring_rule'->>'mode','none');
  IF mode='none' THEN CONTINUE; END IF;
  IF f->'scoring_rule'->>'version' IS DISTINCT FROM '2'
   OR NOT ((kind='yes_no' AND mode IN ('yes','no')) OR (kind='scale_1_10' AND mode IN ('higher_better','lower_better'))) THEN RAISE EXCEPTION 'CHECKIN_INVALID_SCORING_RULE'; END IF;
  weight:=coalesce((f->>'score_weight')::numeric,0);
  IF weight::text IN ('NaN','Infinity','-Infinity') OR weight<0 OR weight>100 THEN RAISE EXCEPTION 'CHECKIN_INVALID_WEIGHT'; END IF;
  IF weight=0 THEN CONTINUE; END IF;
  IF kind='yes_no' THEN value:=CASE WHEN answer #>> '{}' = mode THEN 10 ELSE 0 END;
  ELSE value:=CASE WHEN mode='higher_better' THEN (value-1)*10/9 ELSE (10-value)*10/9 END; END IF;
  total:=total+weight*value;maximum:=maximum+weight*10;
 END LOOP;
 RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION private.checkin_score_v2(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.checkin_score_v2(jsonb,jsonb) TO postgres;


-- Forward-compatible public functions retain active actor, ownership and historical guards.
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
  -- Lock the episode before the session so closing/restarting care cannot
  -- confirm a stale session into a newer episode.
  perform 1 from public.care_episodes e join public.checkin_sessions c on c.care_episode_id=e.id
    where c.id=p_session_id and c.patient_id=auth.uid() and e.status='active'
    and private.wave05_chat_relationship(c.patient_id,c.nutritionist_id) for share of e;
  if not found then raise exception using errcode='42501',message='CHECKIN_SESSION_FORBIDDEN'; end if;
  select * into v_session from public.checkin_sessions
  where id = p_session_id and patient_id = auth.uid() for update;
  if not found then raise exception 'CHECKIN_NOT_FOUND'; end if;
  if v_session.status = 'expired' then raise exception 'CHECKIN_EXPIRED'; end if;
  if v_session.status <> 'pending' then raise exception 'CHECKIN_ALREADY_COMPLETED'; end if;
  if v_session.expires_at <= now() then raise exception 'CHECKIN_EXPIRED'; end if;
  if jsonb_array_length(v_session.fields_snapshot) = 0 then raise exception 'CHECKIN_WITHOUT_FIELDS'; end if;
  if v_session.score_version=2 then
    select total,maximum into v_total,v_max from private.checkin_score_v2(v_session.fields_snapshot,p_responses);
  else
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
  end if;
  v_pct := case when v_max > 0 then v_total / v_max * 100 else null end;
  update public.checkin_sessions set responses = p_responses, score_total = v_total,
    score_max = v_max, adherence_percentage = v_pct, status = 'completed', completed_at = now()
  where id = p_session_id;
  return v_pct;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_checkin_session_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_fields jsonb;
  v_field jsonb;
  v_answer jsonb;
  v_weight numeric;
  v_value numeric;
  v_total numeric := 0;
  v_max numeric := 0;
begin
  if auth.uid() is null then return new; end if;
  if old.patient_id <> auth.uid() or old.status <> 'pending'
    or old.expires_at <= now() or new.status <> 'completed' then
    raise exception 'CHECKIN_UPDATE_NOT_ALLOWED';
  end if;
  if (to_jsonb(new) - array['responses','score_total','score_max','adherence_percentage','status','completed_at'])
    <> (to_jsonb(old) - array['responses','score_total','score_max','adherence_percentage','status','completed_at']) then
    raise exception 'CHECKIN_IMMUTABLE_FIELDS';
  end if;
  perform 1 from public.care_episodes e where e.id=old.care_episode_id and e.status='active'
    and private.wave05_chat_relationship(old.patient_id,old.nutritionist_id) for share;
  if not found then raise exception using errcode='42501',message='CHECKIN_SESSION_FORBIDDEN'; end if;
  if jsonb_typeof(new.responses) <> 'object' then raise exception 'CHECKIN_INVALID_RESPONSES'; end if;
  v_fields := old.fields_snapshot;
  if jsonb_array_length(v_fields) = 0 then
    select coalesce(jsonb_agg(to_jsonb(f) order by f.order_index, f.id), '[]'::jsonb)
    into v_fields from public.checkin_fields f where f.template_id = old.template_id;
  end if;
  if jsonb_array_length(v_fields) = 0 then raise exception 'CHECKIN_WITHOUT_FIELDS'; end if;
  if old.score_version=2 then
    select total,maximum into v_total,v_max from private.checkin_score_v2(v_fields,new.responses);
  else
  for v_field in select value from jsonb_array_elements(v_fields) loop
    v_answer := new.responses->(v_field->>'id');
    if coalesce((v_field->>'is_required')::boolean, true)
      and (v_answer is null or v_answer in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)) then
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
        if v_answer not in ('"yes"'::jsonb, '"no"'::jsonb) then raise exception 'CHECKIN_INVALID_YES_NO'; end if;
        if v_answer = '"yes"'::jsonb then v_value := 10; end if;
      elsif v_answer not in ('""'::jsonb, '[]'::jsonb) then
        v_value := 10;
      end if;
    end if;
    v_total := v_total + v_weight * v_value;
  end loop;
  end if;
  new.score_total := v_total;
  new.score_max := v_max;
  new.adherence_percentage := case when v_max > 0 then v_total / v_max * 100 else null end;
  new.completed_at := now();
  return new;
end;
$function$;

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
          (template_id,label,field_type,options,score_weight,unit,is_required,order_index,scoring_rule)
        VALUES
          (v_id,btrim(v_field->>'label'),v_field->>'field_type',
           coalesce(v_field->'options','[]'::jsonb),
           coalesce((v_field->>'score_weight')::numeric,1),
           nullif(v_field->>'unit',''),coalesce((v_field->>'is_required')::boolean,true),v_index,coalesce(v_field->'scoring_rule','{"version":2,"mode":"none"}'::jsonb));
        v_index := v_index + 1;
      END LOOP;
    END IF;
    UPDATE public.checkin_templates SET
      name=btrim(p_template->>'name'),description=coalesce(p_template->>'description',''),
      frequency=p_template->>'frequency',
      send_time=coalesce((p_template->>'send_time')::time,'09:00'::time),
      send_days=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_template->'send_days','[1]'::jsonb))::integer),
      channel='in_app' WHERE id=v_id;
    -- Only future sends see revised criteria; issued snapshots stay immutable.
    v_index:=0;
    FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
      IF v_field ? 'scoring_rule' THEN
        UPDATE public.checkin_fields SET scoring_rule=v_field->'scoring_rule' WHERE template_id=v_id AND order_index=v_index;
      END IF;
      v_index:=v_index+1;
    END LOOP;
    RETURN v_id;
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    INSERT INTO public.checkin_fields
      (template_id,label,field_type,options,score_weight,unit,is_required,order_index,scoring_rule)
    VALUES
      (v_id,btrim(v_field->>'label'),v_field->>'field_type',
       coalesce(v_field->'options','[]'::jsonb),
       coalesce((v_field->>'score_weight')::numeric,1),
       nullif(v_field->>'unit',''),coalesce((v_field->>'is_required')::boolean,true),v_index,coalesce(v_field->'scoring_rule','{"version":2,"mode":"none"}'::jsonb));
    v_index := v_index + 1;
  END LOOP;
  RETURN v_id;
END;
$function$;
NOTIFY pgrst, 'reload schema';

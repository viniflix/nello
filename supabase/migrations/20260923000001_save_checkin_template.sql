-- One transaction for the template and its questions. Keep issued sessions immutable.
CREATE OR REPLACE FUNCTION public.save_checkin_template(
  p_id uuid, p_template jsonb, p_fields jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_id uuid;
  v_field jsonb;
  v_index integer := 0;
  v_existing jsonb;
  v_incoming jsonb;
BEGIN
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
    WHERE value::integer NOT BETWEEN 1 AND 7
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
REVOKE ALL ON FUNCTION public.save_checkin_template(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_checkin_template(uuid,jsonb,jsonb) TO authenticated;

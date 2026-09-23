-- Wave 7: validate all source foods before copying any meal. The RPC is one
-- PostgreSQL statement, so a failure rolls back the complete import.
CREATE OR REPLACE FUNCTION private.copy_diet_template_meals_to_plan(
  p_template_id uuid, p_plan_id bigint, p_meal_ids uuid[]
) RETURNS bigint[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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

CREATE OR REPLACE FUNCTION public.import_diet_template_meals_to_plan(
  p_template_id uuid, p_plan_id bigint, p_meal_ids uuid[]
) RETURNS bigint[]
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT private.copy_diet_template_meals_to_plan(p_template_id,p_plan_id,p_meal_ids);
$function$;
REVOKE ALL ON FUNCTION public.import_diet_template_meals_to_plan(uuid,bigint,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_diet_template_meals_to_plan(uuid,bigint,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION private.clone_diet_template_to_patient(
  p_template_id uuid, p_patient_id uuid, p_nutritionist_id uuid, p_name text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_template public.diet_templates%rowtype;
  v_episode uuid;
  v_plan bigint;
  v_meal_ids uuid[];
BEGIN
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

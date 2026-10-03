BEGIN;

-- The former INSERT policy recursed when PostgREST requested RETURNING rows.
-- Enforce the quota outside RLS, serializing concurrent inserts per owner.
CREATE OR REPLACE FUNCTION private.enforce_custom_measure_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.nutritionist_id IS DISTINCT FROM auth.uid() OR NOT private.wave05_active_actor() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='custom_measure_owner_required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.nutritionist_id::text, 13001));
  IF (SELECT count(*) FROM public.nutritionist_custom_measures WHERE nutritionist_id=NEW.nutritionist_id) >= 20 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Limite de 20 medidas personalizadas atingido';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.enforce_custom_measure_quota() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS nutritionist_custom_measures_quota ON public.nutritionist_custom_measures;
CREATE TRIGGER nutritionist_custom_measures_quota BEFORE INSERT ON public.nutritionist_custom_measures
FOR EACH ROW EXECUTE FUNCTION private.enforce_custom_measure_quota();
ALTER POLICY nutritionist_custom_measures_insert ON public.nutritionist_custom_measures
WITH CHECK ((SELECT auth.uid())=nutritionist_id);

CREATE OR REPLACE FUNCTION public.search_foods_ranked(p_query text, p_source text DEFAULT NULL, p_group text DEFAULT NULL, p_limit integer DEFAULT 21, p_offset integer DEFAULT 0)
RETURNS SETOF public.foods LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_query text:=public.normalize_food_search(left(coalesce(p_query,''),120)); v_tokens text[];
BEGIN
  IF auth.uid() IS NULL OR NOT private.wave05_active_actor() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active_actor_required'; END IF;
  IF v_query IS NULL OR length(v_query)<2 THEN RETURN; END IF;
  v_tokens:=string_to_array(v_query,' ');
  RETURN QUERY
  SELECT f.* FROM public.foods f
  CROSS JOIN LATERAL (SELECT public.normalize_food_search(f.name) AS name) normalized
  WHERE f.is_active AND coalesce(f.source_id,'') NOT IN ('TUCUNDUVA-0073','TUCUNDUVA-0168','TUCUNDUVA-0505','TUCUNDUVA-1061','TUCUNDUVA-1376','TUCUNDUVA-1554') AND (p_source IS NULL OR f.source=p_source) AND (p_group IS NULL OR f."group"=p_group)
    AND (NOT EXISTS (SELECT 1 FROM unnest(v_tokens) token WHERE strpos(normalized.name,token)=0)
         OR (length(v_query)>=4 AND extensions.similarity(normalized.name,v_query)>=0.35))
  ORDER BY (normalized.name=v_query) DESC,
    (normalized.name LIKE v_query||'%') DESC,
    (SELECT count(*) FROM unnest(v_tokens) token WHERE (' '||normalized.name||' ') LIKE '% '||token||' %') DESC,
    CASE WHEN strpos(normalized.name,v_tokens[1])=0 THEN 10000 ELSE strpos(normalized.name,v_tokens[1]) END,
    extensions.similarity(normalized.name,v_query) DESC, length(normalized.name), normalized.name, f.id
  LIMIT greatest(1,least(coalesce(p_limit,21),100)) OFFSET greatest(0,least(coalesce(p_offset,0),10000));
END;
$function$;
REVOKE ALL ON FUNCTION public.search_foods_ranked(text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_foods_ranked(text,text,text,integer,integer) TO authenticated;

ALTER TABLE public.meal_plan_meals ADD COLUMN IF NOT EXISTS include_in_totals boolean NOT NULL DEFAULT true;
ALTER TABLE public.meal_plan_foods DROP CONSTRAINT IF EXISTS meal_plan_foods_positive_quantity_check;
ALTER TABLE public.meal_plan_foods ADD CONSTRAINT meal_plan_foods_nonnegative_quantity_check CHECK (quantity >= 0 AND quantity <> 'NaN'::numeric);
ALTER TABLE public.meal_plan_food_substitutions ADD COLUMN IF NOT EXISTS measure_snapshot jsonb;
ALTER TABLE public.meal_plan_food_substitutions DROP CONSTRAINT IF EXISTS meal_plan_substitutions_positive_quantity_check;
ALTER TABLE public.meal_plan_food_substitutions ADD CONSTRAINT meal_plan_substitutions_nonnegative_quantity_check CHECK (quantity IS NULL OR (quantity >= 0 AND quantity <> 'NaN'::numeric));

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
    daily_calories = (SELECT coalesce(sum(coalesce((meal->>'total_calories')::numeric,0)),0) FROM jsonb_array_elements(p_meals) meal WHERE coalesce((meal->>'include_in_totals')::boolean,true)),
    daily_protein = (SELECT coalesce(sum(coalesce((meal->>'total_protein')::numeric,0)),0) FROM jsonb_array_elements(p_meals) meal WHERE coalesce((meal->>'include_in_totals')::boolean,true)),
    daily_carbs = (SELECT coalesce(sum(coalesce((meal->>'total_carbs')::numeric,0)),0) FROM jsonb_array_elements(p_meals) meal WHERE coalesce((meal->>'include_in_totals')::boolean,true)),
    daily_fat = (SELECT coalesce(sum(coalesce((meal->>'total_fat')::numeric,0)),0) FROM jsonb_array_elements(p_meals) meal WHERE coalesce((meal->>'include_in_totals')::boolean,true)),
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
      total_calories, total_protein, total_carbs, total_fat, include_in_totals
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
      COALESCE((v_meal->>'total_fat')::NUMERIC, 0),
      COALESCE((v_meal->>'include_in_totals')::BOOLEAN, true)
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
              meal_plan_food_id, substitute_food_id, notes, quantity, unit
            ) VALUES (
              v_new_food_id,
              (v_sub->>'id')::UUID,
              v_sub->>'notes',
              (v_sub->>'quantity')::NUMERIC,
              COALESCE(v_sub->>'unit','gram')
            );
          END LOOP;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'plan_id', p_plan_id);
END;
$function$;


CREATE OR REPLACE FUNCTION private.resolve_prescription_measure(p_food uuid, p_unit text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_measure jsonb;
BEGIN
  IF p_unit IS NULL OR lower(p_unit) IN ('g','gram','grams','gramas') THEN
    RETURN jsonb_build_object('label','g','name','g','weight_in_grams',1,'kind','grams');
  END IF;
  SELECT jsonb_build_object('id',id,'label',label,'name',label,'weight_in_grams',weight_in_grams,'version',version,'source',source_snapshot)
    INTO v_measure FROM public.food_measures
    WHERE (reference_food_id=p_food OR nutritionist_food_id=p_food) AND (id::text=p_unit OR lower(label)=lower(p_unit))
    ORDER BY version DESC,created_at DESC LIMIT 1;
  IF v_measure IS NULL AND p_unit LIKE 'custom_%' THEN
    SELECT jsonb_build_object('id',id,'code',code,'name',name,'label',name,'grams_equivalent',grams_equivalent,'kind','custom')
      INTO v_measure FROM public.nutritionist_custom_measures WHERE code=p_unit AND nutritionist_id=auth.uid();
  END IF;
  IF v_measure IS NULL THEN
    SELECT jsonb_build_object('id',id,'code',code,'name',name,'label',name,'grams_equivalent',grams_equivalent,'kind','system')
      INTO v_measure FROM public.household_measures WHERE code=p_unit OR id::text=p_unit LIMIT 1;
  END IF;
  IF v_measure IS NULL AND (p_unit ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$'
 OR p_unit LIKE 'custom_%') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='prescription_measure_unavailable';
  END IF;
  RETURN coalesce(v_measure,jsonb_build_object('label',p_unit,'kind','prescription_unit'));
END;
$function$;
REVOKE ALL ON FUNCTION private.resolve_prescription_measure(uuid,text) FROM PUBLIC,anon,authenticated;
-- Existing snapshot triggers retain their postgres owner during reconstruction.
-- Only that server role may call the resolver; clients cannot execute it directly.
GRANT EXECUTE ON FUNCTION private.resolve_prescription_measure(uuid,text) TO postgres;

CREATE OR REPLACE FUNCTION private.freeze_prescription_food_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_food record;
  v_measure record;
BEGIN
  IF TG_OP='UPDATE' AND NEW.food_id IS NOT DISTINCT FROM OLD.food_id THEN
    NEW.food_snapshot := OLD.food_snapshot;
  ELSE
  SELECT * INTO v_food FROM public.foods WHERE id = NEW.food_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='prescription_food_not_found';
  END IF;
  IF v_food.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='prescription_food_inactive', DETAIL=NEW.food_id::text;
  END IF;
    NEW.food_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'id',v_food.id,'name',v_food.name,'source',v_food.source,'source_id',v_food.source_id,
      'portion_size',v_food.portion_size,'base_unit',v_food.base_unit,'calories',v_food.calories,
      'protein',v_food.protein,'carbs',v_food.carbs,'fat',v_food.fat,'fiber',v_food.fiber,
      'sodium',v_food.sodium,'captured_at',now()
    ));
  END IF;
  IF TG_OP='UPDATE' AND NEW.food_id IS NOT DISTINCT FROM OLD.food_id
    AND NEW.unit IS NOT DISTINCT FROM OLD.unit THEN
    NEW.measure_snapshot := OLD.measure_snapshot;
  ELSE
    NEW.measure_snapshot := private.resolve_prescription_measure(NEW.food_id, NEW.unit);

  END IF;
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION private.freeze_substitution_measure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF TG_OP='UPDATE' AND NEW.substitute_food_id IS NOT DISTINCT FROM OLD.substitute_food_id AND NEW.unit IS NOT DISTINCT FROM OLD.unit AND OLD.measure_snapshot IS NOT NULL THEN
    NEW.measure_snapshot:=OLD.measure_snapshot;
  ELSE
    NEW.measure_snapshot:=private.resolve_prescription_measure(NEW.substitute_food_id,NEW.unit);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.freeze_substitution_measure() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_meal_plan_substitutions_measure BEFORE INSERT OR UPDATE ON public.meal_plan_food_substitutions
FOR EACH ROW EXECUTE FUNCTION private.freeze_substitution_measure();

-- Correct only source-verified catalog data; never rewrite stored prescriptions.
-- TBCA BRC0088K publishes 197 kcal/100 g, not the imported 1969.
UPDATE public.reference_foods SET calories=197
WHERE source_id='TBCA-C0088K' AND source::text='TBCA' AND calories=1969;

-- The imported generic cheese slice was wrongly applied to creamy requeijao.
-- TBCA BRC0066G: full tablespoon 30 g, level tablespoon 15 g.
UPDATE public.food_measures m SET label='Colher de sopa cheia',version=coalesce(version,1)+1,
 source_snapshot=coalesce(source_snapshot,'{}'::jsonb)||jsonb_build_object('correction','creamy_requeijao_spoon','reference','TBCA BRC0066G','grams_basis',30)
FROM public.reference_foods f
WHERE m.reference_food_id=f.id AND f.source_id IN ('TBCA-C0066G','TBCA-C0040N','TBCA-C0068G','TBCA-C0041N','TBCA-C0067G','TBCA-C0137G','TACO-461')
 AND m.label='Fatia média' AND m.weight_in_grams=30;
INSERT INTO public.food_measures(reference_food_id,label,weight_in_grams,version,source_snapshot)
SELECT f.id,'Colher de sopa rasa',15,1,jsonb_build_object('reference','TBCA BRC0066G','correction','creamy_requeijao_spoon')
FROM public.reference_foods f WHERE f.source_id IN ('TBCA-C0066G','TBCA-C0040N','TBCA-C0068G','TBCA-C0041N','TBCA-C0067G','TBCA-C0137G','TACO-461')
 AND NOT EXISTS(SELECT 1 FROM public.food_measures m WHERE m.reference_food_id=f.id AND m.label='Colher de sopa rasa');

-- Six imports with physically impossible macros are excluded from new ranked
-- searches above until the original source can be verified. Keep rows accessible
-- for already-prescribed records and do not fabricate decimal corrections.
COMMIT;

-- Wave 7 cascade: every new food reference in a prescription must still be active
-- at the actual write, including writes outside the template import RPC.
CREATE OR REPLACE FUNCTION private.freeze_prescription_food_reference()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_food record;
  v_measure record;
BEGIN
  SELECT * INTO v_food FROM public.foods WHERE id = NEW.food_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='prescription_food_not_found';
  END IF;
  IF v_food.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='prescription_food_inactive', DETAIL=NEW.food_id::text;
  END IF;
  IF NEW.food_snapshot = '{}'::jsonb THEN
    NEW.food_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'id',v_food.id,'name',v_food.name,'source',v_food.source,'source_id',v_food.source_id,
      'portion_size',v_food.portion_size,'base_unit',v_food.base_unit,'calories',v_food.calories,
      'protein',v_food.protein,'carbs',v_food.carbs,'fat',v_food.fat,'fiber',v_food.fiber,
      'sodium',v_food.sodium,'captured_at',now()
    ));
  END IF;
  IF NEW.measure_snapshot = '{}'::jsonb THEN
    SELECT fm.id,fm.label,fm.weight_in_grams,fm.version,fm.source_snapshot INTO v_measure
    FROM public.food_measures fm
    WHERE (fm.reference_food_id=NEW.food_id OR fm.nutritionist_food_id=NEW.food_id)
      AND lower(fm.label)=lower(NEW.unit)
    ORDER BY fm.version DESC,fm.created_at DESC LIMIT 1;
    NEW.measure_snapshot := CASE WHEN FOUND THEN jsonb_strip_nulls(jsonb_build_object(
      'id',v_measure.id,'label',v_measure.label,'weight_in_grams',v_measure.weight_in_grams,
      'version',v_measure.version,'source',v_measure.source_snapshot
    )) ELSE jsonb_build_object('label',NEW.unit,'kind','prescription_unit') END;
  END IF;
  RETURN NEW;
END;
$function$;

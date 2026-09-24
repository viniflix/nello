-- Run only against a QA database with at least one diary meal containing an
-- active food. The transaction always rolls back. This test deliberately
-- causes failure on item 2, after the RPC deletes the original items and
-- inserts item 1, and checks that the meal header and item rows are intact.
begin;

do $test$
declare
  v_meal public.meals%rowtype;
  v_item public.meal_items%rowtype;
  v_food_id uuid;
  v_source text;
  v_before_meal jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
  v_error text;
begin
  select m.* into v_meal
  from public.meals m
  join public.meal_items mi on mi.meal_id = m.id
  join public.foods f on f.id = coalesce(mi.reference_food_id, mi.nutritionist_food_id)
  left join public.user_profiles up on up.id = m.patient_id
  where m.deleted_at is null and f.is_active is true
    and lower(coalesce(mi.unit, 'gram')) in ('g', 'gram', 'grams', 'ml')
    and mi.measure_id is null
    and (mi.nutritionist_food_id is null or f.nutritionist_id = up.nutritionist_id)
  order by m.id
  limit 1;
  if not found then raise exception 'QA_FIXTURE_MISSING_ACTIVE_DIARY_MEAL'; end if;

  select mi.* into v_item from public.meal_items mi
  join public.foods f on f.id = coalesce(mi.reference_food_id, mi.nutritionist_food_id)
  left join public.user_profiles up on up.id = v_meal.patient_id
  where mi.meal_id = v_meal.id and f.is_active is true
    and lower(coalesce(mi.unit, 'gram')) in ('g', 'gram', 'grams', 'ml')
    and mi.measure_id is null
    and (mi.nutritionist_food_id is null or f.nutritionist_id = up.nutritionist_id)
  order by mi.id limit 1;
  v_food_id := coalesce(v_item.reference_food_id, v_item.nutritionist_food_id);
  v_source := case when v_item.nutritionist_food_id is null then 'reference' else 'custom' end;

  select to_jsonb(m) into v_before_meal from public.meals m where m.id = v_meal.id;
  select coalesce(jsonb_agg(to_jsonb(mi) order by mi.id), '[]'::jsonb)
    into v_before_items from public.meal_items mi where mi.meal_id = v_meal.id;

  perform set_config('request.jwt.claim.sub', v_meal.patient_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    perform public.save_patient_diary_meal(
      v_meal.id,
      jsonb_build_object('meal_date', v_meal.meal_date, 'meal_time', v_meal.meal_time,
        'meal_type', v_meal.meal_type, 'notes', 'rollback QA probe'),
      jsonb_build_array(
        jsonb_build_object('food_id', v_food_id, 'food_source', v_source,
          'quantity', v_item.quantity, 'unit', v_item.unit, 'measure_id', v_item.measure_id),
        jsonb_build_object('food_id', gen_random_uuid(), 'food_source', 'reference',
          'quantity', 100, 'unit', 'gram')
      )
    );
    raise exception 'QA_EXPECTED_SECOND_ITEM_FAILURE';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'DIARY_FOOD_UNAVAILABLE' then raise; end if;
  end;

  if (select to_jsonb(m) from public.meals m where m.id = v_meal.id) is distinct from v_before_meal then
    raise exception 'QA_MEAL_HEADER_CHANGED_AFTER_FAILURE';
  end if;
  select coalesce(jsonb_agg(to_jsonb(mi) order by mi.id), '[]'::jsonb)
    into v_after_items from public.meal_items mi where mi.meal_id = v_meal.id;
  if v_after_items is distinct from v_before_items then
    raise exception 'QA_MEAL_ITEMS_CHANGED_AFTER_FAILURE';
  end if;

  -- The SECURITY DEFINER entry point must reject another authenticated user,
  -- regardless of the direct table RLS policy for a linked professional.
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.save_patient_diary_meal(
      v_meal.id,
      jsonb_build_object('meal_date', v_meal.meal_date, 'meal_time', v_meal.meal_time,
        'meal_type', v_meal.meal_type),
      jsonb_build_array(jsonb_build_object('food_id', v_food_id,
        'food_source', v_source, 'quantity', v_item.quantity, 'unit', v_item.unit))
    );
    raise exception 'QA_EXPECTED_OWNER_FAILURE';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'DIARY_MEAL_NOT_FOUND' then raise; end if;
  end;
end;
$test$;

rollback;

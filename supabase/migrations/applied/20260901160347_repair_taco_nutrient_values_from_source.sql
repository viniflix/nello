do $$
declare
  v_expected integer;
  v_loaded integer;
  v_updated integer;
begin
  select count(*) into v_expected
  from public.reference_foods
  where source = 'TACO';

  select count(*) into v_loaded
  from public._taco_repair_staging s
  join public.reference_foods r on r.id = s.db_id
  where r.source = 'TACO'
    and s.remote_status = 200
    and (s.payload ->> 'id')::integer =
        (regexp_match(s.source_id, '^TACO-([0-9]+)$'))[1]::integer;

  if v_expected <> 581 or v_loaded <> v_expected then
    raise exception 'TACO repair validation failed: expected %, loaded %', v_expected, v_loaded;
  end if;

  with parsed as (
    select
      s.db_id,
      nullif((s.payload ->> 'energy_kcal')::numeric, 0.00001) as calories,
      nullif((s.payload ->> 'protein_g')::numeric, 0.00001) as protein,
      nullif((s.payload ->> 'carbohydrate_g')::numeric, 0.00001) as carbs,
      nullif((s.payload ->> 'lipids_g')::numeric, 0.00001) as fat,
      nullif((s.payload ->> 'dietary_fiber_g')::numeric, 0.00001) as fiber,
      nullif((s.payload ->> 'calcium_mg')::numeric, 0.00001) as calcium,
      nullif((s.payload ->> 'iron_mg')::numeric, 0.00001) as iron,
      nullif((s.payload ->> 'sodium_mg')::numeric, 0.00001) as sodium,
      nullif((s.payload ->> 'potassium_mg')::numeric, 0.00001) as potassium,
      nullif((s.payload ->> 'vitamin_c_mg')::numeric, 0.00001) as vitamin_c,
      nullif((s.payload ->> 'cholesterol_mg')::numeric, 0.00001) as cholesterol,
      nullif((s.payload ->> 'magnesium_mg')::numeric, 0.00001) as magnesium,
      nullif((s.payload ->> 'phosphorus_mg')::numeric, 0.00001) as phosphorus,
      nullif((s.payload ->> 'zinc_mg')::numeric, 0.00001) as zinc,
      nullif((s.payload ->> 'rae_mcg')::numeric, 0.00001) as vitamin_a,
      nullif((s.payload -> 'fatty_acids' ->> 'saturated_g')::numeric, 0.00001) as saturated_fat,
      nullif((s.payload -> 'fatty_acids' ->> 'monounsaturated_g')::numeric, 0.00001) as monounsaturated_fat,
      nullif((s.payload -> 'fatty_acids' ->> 'polyunsaturated_g')::numeric, 0.00001) as polyunsaturated_fat,
      nullif((s.payload -> 'fatty_acids' ->> 'trans_c18_1_g')::numeric, 0.00001) as trans_c18_1,
      nullif((s.payload -> 'fatty_acids' ->> 'trans_c18_2_g')::numeric, 0.00001) as trans_c18_2
    from public._taco_repair_staging s
  )
  update public.reference_foods r
  set
    calories = p.calories,
    protein = p.protein,
    carbs = p.carbs,
    fat = p.fat,
    fiber = p.fiber,
    calcium = p.calcium,
    iron = p.iron,
    sodium = p.sodium,
    potassium = p.potassium,
    vitamin_c = p.vitamin_c,
    cholesterol = p.cholesterol,
    magnesium = p.magnesium,
    phosphorus = p.phosphorus,
    zinc = p.zinc,
    vitamin_a = p.vitamin_a,
    saturated_fat = p.saturated_fat,
    monounsaturated_fat = p.monounsaturated_fat,
    polyunsaturated_fat = p.polyunsaturated_fat,
    trans_fat = case
      when p.trans_c18_1 is null and p.trans_c18_2 is null then null
      else coalesce(p.trans_c18_1, 0) + coalesce(p.trans_c18_2, 0)
    end,
    sugar = null,
    vitamin_d = null,
    vitamin_e = null,
    vitamin_b12 = null,
    folate = null
  from parsed p
  where r.id = p.db_id
    and r.source = 'TACO';

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'TACO repair update failed: expected %, updated %', v_expected, v_updated;
  end if;
end $$;

-- CI ONLY: verify the actual recorded transformation, then remove invented foods.
-- Data-dependent migration assertions remain unchanged and must succeed first.
DO $fixture$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM generate_series(1,581) AS n
  JOIN public.reference_foods f ON f.id = md5('nello-ci-taco:' || n)::uuid
  WHERE f.name = 'QA SYNTHETIC TACO ' || n AND f.source = 'TACO'
    AND f.calories = 100+n AND f.protein = 10 AND f.carbs = 12
    AND f.fat = 2 AND f.fiber = 3 AND f.calcium IS NULL
    AND f.iron = 2 AND f.sodium = 3 AND f.trans_fat IS NULL;
  IF v_count <> 581 THEN
    RAISE EXCEPTION 'ci_taco_repair_transform_failed: %/581',v_count;
  END IF;
  DELETE FROM public.reference_foods f
  USING generate_series(1,581) AS n
  WHERE f.id = md5('nello-ci-taco:' || n)::uuid
    AND f.name = 'QA SYNTHETIC TACO ' || n AND f.source = 'TACO';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 581 THEN
    RAISE EXCEPTION 'ci_taco_fixture_cleanup_failed: %/581',v_count;
  END IF;
END $fixture$;

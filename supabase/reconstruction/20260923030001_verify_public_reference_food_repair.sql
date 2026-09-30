-- CI-only verification of recorded public-reference data repair and TACO nullability.
DO $fixture$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reference_foods
    WHERE id = 'ca18236b-0b3a-4212-8d17-b9e9003f51d8'
      AND source = 'TACO' AND source_id = '315'
      AND (calcium,magnesium,phosphorus,potassium) = (29,28,300,384)
      AND vitamin_b12 IS NULL AND vitamin_d IS NULL
      AND vitamin_e IS NULL AND folate IS NULL
  ) THEN
    RAISE EXCEPTION 'ci_public_reference_repair_or_nullability_failed';
  END IF;
END $fixture$;

-- TACO 4th edition (NEPA/UNICAMP, 2011) has no B12, D, E or folate
-- columns. NULL means not reported, and must not be imported as zero.
-- Reversal: ALTER TABLE public.reference_foods
--   DROP CONSTRAINT IF EXISTS reference_foods_taco_unreported_micros_null;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reference_foods'::regclass
      AND conname = 'reference_foods_taco_unreported_micros_null'
  ) THEN
    ALTER TABLE public.reference_foods
      ADD CONSTRAINT reference_foods_taco_unreported_micros_null
      CHECK (
        source <> 'TACO'::public.food_source
        OR (vitamin_b12 IS NULL AND vitamin_d IS NULL
            AND vitamin_e IS NULL AND folate IS NULL)
      );
  END IF;
END $$;

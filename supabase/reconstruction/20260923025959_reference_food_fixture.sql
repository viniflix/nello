-- CI-only public reference fixture; no patient/user data.
-- Historical migration 20260923030000 requires this exact TACO food identity.
-- Starting values are recorded explicitly in that migration; its correction must run.
INSERT INTO public.reference_foods
  (id, name, source, source_id, calcium, magnesium, phosphorus, potassium)
VALUES
  ('ca18236b-0b3a-4212-8d17-b9e9003f51d8',
   'Salmão, filé, com pele, fresco, grelhado', 'TACO', '315',
   10.3246666666667, 21.1226666666667, 203.712, 248.64);

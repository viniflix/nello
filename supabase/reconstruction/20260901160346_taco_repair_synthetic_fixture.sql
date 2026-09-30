-- CI ONLY: invented food fixtures for the recorded 581-row TACO repair guard.
-- These are NOT scientific reference values and must never reach a hosted project.
-- No patients/users are created, read or exported. No external API is called.
INSERT INTO public.reference_foods (id,name,source,source_id,calories,protein)
SELECT md5('nello-ci-taco:' || n)::uuid,
  'QA SYNTHETIC TACO ' || n, 'TACO', 'TACO-' || n, 1, 1
FROM generate_series(1,581) AS n;

INSERT INTO public._taco_repair_staging (source_id,db_id,db_name,remote_status,payload)
SELECT 'TACO-' || n, md5('nello-ci-taco:' || n)::uuid,
  'QA SYNTHETIC TACO ' || n, 200,
  jsonb_build_object('id',n,'energy_kcal',100+n,'protein_g',10,
    'carbohydrate_g',12,'lipids_g',2,'dietary_fiber_g',3,
    'calcium_mg',0.00001,'iron_mg',2,'sodium_mg',3,
    'fatty_acids',jsonb_build_object('trans_c18_1_g',0.00001,'trans_c18_2_g',0.00001))
FROM generate_series(1,581) AS n;

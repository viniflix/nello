-- Reprocessa quatro avaliações Pollock 7 legadas em novas revisões auditáveis.
-- Três perfis sem sexo tinham sido calculados pela equação feminina; o histórico
-- de energia registra M de forma consistente para cada um. O quarto resultado
-- feminino é numericamente correto e recebe apenas proveniência verificável.
-- Reversão: restaurar os três gender anteriores (NULL), invalidar as quatro
-- novas revisões e reativar as fontes. Backup privado antes da execução.
BEGIN;

DO $correction$
DECLARE
  affected integer;
  existing integer;
BEGIN
  PERFORM pg_advisory_xact_lock(2026092301);

  SELECT count(*) INTO existing
  FROM public.growth_records
  WHERE supersedes_record_id IN (86, 87, 88, 109)
    AND source_snapshot->>'correction_key' = 'historical_pollock_20260923';
  IF existing = 4 THEN RETURN; END IF;
  IF existing <> 0 THEN RAISE EXCEPTION 'Correção Pollock parcialmente aplicada (% revisões)', existing; END IF;

  IF (SELECT count(*) FROM public.growth_records r
      WHERE r.id IN (86, 87, 88, 109) AND r.status = 'active'
        AND r.is_latest_revision AND r.results->>'protocol' = 'pollock7'
        AND r.weight > 0 AND r.skinfolds IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'Fontes Pollock mudaram; revisar antes de recalcular';
  END IF;

  IF (SELECT count(*) FROM public.growth_records r
      JOIN public.user_profiles p ON p.id = r.patient_id
      WHERE r.id = 86 AND lower(p.gender) = 'female' AND p.birth_date IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'Sexo/data da fonte feminina mudaram';
  END IF;

  IF (SELECT count(*) FROM public.growth_records r
      JOIN public.user_profiles p ON p.id = r.patient_id
      WHERE r.id IN (87, 88, 109) AND p.gender IS NULL AND p.birth_date IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.energy_expenditure_calculations e
                    WHERE e.patient_id = r.patient_id AND upper(e.gender) = 'M')
        AND NOT EXISTS (SELECT 1 FROM public.energy_expenditure_calculations e
                        WHERE e.patient_id = r.patient_id AND upper(e.gender) <> 'M')) <> 3 THEN
    RAISE EXCEPTION 'Sexo masculino não é consistente no histórico dos três pacientes';
  END IF;

  UPDATE public.user_profiles p SET gender = 'male'
  WHERE p.gender IS NULL AND p.id IN (
    SELECT patient_id FROM public.growth_records WHERE id IN (87, 88, 109)
  );
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 3 THEN RAISE EXCEPTION 'Esperados três perfis corrigidos, obtidos %', affected; END IF;

  WITH inputs AS (
    SELECT r.*, p.birth_date,
      CASE WHEN r.id = 86 THEN 'female' ELSE 'male' END AS applied_sex,
      extract(year FROM age(r.record_date::date, p.birth_date::date))::integer AS years,
      ((r.skinfolds->>'peito')::numeric + (r.skinfolds->>'axilar')::numeric
        + (r.skinfolds->>'triceps')::numeric + (r.skinfolds->>'subescapular')::numeric
        + (r.skinfolds->>'abdominal')::numeric + (r.skinfolds->>'suprailiaca')::numeric
        + (r.skinfolds->>'coxa')::numeric) AS fold_sum
    FROM public.growth_records r
    JOIN public.user_profiles p ON p.id = r.patient_id
    WHERE r.id IN (86, 87, 88, 109)
  ), density AS (
    SELECT i.*,
      CASE WHEN applied_sex = 'male'
        THEN 1.112 - 0.00043499 * fold_sum + 0.00000055 * fold_sum * fold_sum - 0.00028826 * years
        ELSE 1.097 - 0.00046971 * fold_sum + 0.00000056 * fold_sum * fold_sum - 0.00012828 * years
      END AS corrected_density
    FROM inputs i
  ), composition AS (
    SELECT d.*, ((4.95 / corrected_density) - 4.5) * 100 AS corrected_fat_percent
    FROM density d
  )
  INSERT INTO public.growth_records (
    patient_id, weight, height, peso_usual, record_date, notes,
    circumferences, skinfolds, bone_diameters, bioimpedance, photos,
    head_circumference, results, protocol_code, protocol_version,
    source_snapshot, care_episode_id, supersedes_record_id, change_reason, status
  )
  SELECT c.patient_id, c.weight, c.height, c.peso_usual, c.record_date, c.notes,
    c.circumferences, c.skinfolds, c.bone_diameters, c.bioimpedance, c.photos,
    c.head_circumference,
    c.results || jsonb_build_object(
      'body_density', c.corrected_density,
      'body_fat_percent', c.corrected_fat_percent,
      'fat_mass_kg', c.weight * c.corrected_fat_percent / 100,
      'lean_mass_kg', c.weight - c.weight * c.corrected_fat_percent / 100,
      'age_years', c.years, 'age_source', 'birth_date',
      'sex_used', c.applied_sex, 'skinfold_sum_mm', c.fold_sum,
      'equation_version', 1,
      'audit', coalesce(c.results->'audit', '{}'::jsonb) || jsonb_build_object(
        'source_record_id', c.id, 'correction_key', 'historical_pollock_20260923')
    ),
    c.protocol_code, c.protocol_version,
    coalesce(c.source_snapshot, '{}'::jsonb) || jsonb_build_object(
      'entry_method', 'retroactive_recalculation',
      'correction_key', 'historical_pollock_20260923',
      'source_record_id', c.id,
      'sex_source', CASE WHEN c.id = 86 THEN 'user_profile' ELSE 'consistent_energy_history' END,
      'professional_confirmation', false
    ),
    c.care_episode_id, c.id,
    'Revisão retroativa Pollock 7: sexo, idade e composição recalculados com trilha de auditoria',
    'active'
  FROM composition c
  WHERE c.years BETWEEN 18 AND CASE WHEN c.applied_sex = 'male' THEN 61 ELSE 55 END
    AND c.fold_sum > 0 AND c.corrected_fat_percent > 0 AND c.corrected_fat_percent < 100;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 4 THEN RAISE EXCEPTION 'Esperadas quatro revisões Pollock, obtidas %', affected; END IF;
END;
$correction$;

COMMIT;

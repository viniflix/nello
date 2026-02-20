-- Phase 19: Anthropometry clinical automation
-- - Server-side validation for growth_records payload
-- - Longitudinal clinical score RPC (30/60/90 days)
-- - Automatic sync flags for downstream modules (goals, GET, meal plan review)

BEGIN;

-- =====================================================
-- 1) Validation helpers and trigger
-- =====================================================

CREATE OR REPLACE FUNCTION public._validate_growth_record_json_section(
  p_section jsonb,
  p_section_name text,
  p_default_min numeric,
  p_default_max numeric
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  kv record;
  v_num numeric;
  min_limit numeric;
  max_limit numeric;
BEGIN
  IF p_section IS NULL OR jsonb_typeof(p_section) <> 'object' THEN
    RETURN;
  END IF;

  FOR kv IN SELECT key, value FROM jsonb_each_text(p_section)
  LOOP
    IF kv.value IS NULL OR btrim(kv.value) = '' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_num := kv.value::numeric;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'Valor inválido em %.%: "%"', p_section_name, kv.key, kv.value;
    END;

    min_limit := p_default_min;
    max_limit := p_default_max;

    IF p_section_name = 'bioimpedance' THEN
      IF kv.key = 'percent_gordura' THEN
        min_limit := 2;
        max_limit := 75;
      ELSIF kv.key = 'percent_massa_magra' THEN
        min_limit := 20;
        max_limit := 98;
      ELSIF kv.key = 'gordura_visceral' THEN
        min_limit := 1;
        max_limit := 40;
      END IF;
    END IF;

    IF v_num < min_limit OR v_num > max_limit THEN
      RAISE EXCEPTION 'Valor fora da faixa em %.%: % (esperado entre % e %)',
        p_section_name, kv.key, v_num, min_limit, max_limit;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_growth_records_validate_clinical()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.record_date IS NULL THEN
    RAISE EXCEPTION 'record_date é obrigatório';
  END IF;

  IF NEW.record_date > (CURRENT_DATE + INTERVAL '1 day')::date THEN
    RAISE EXCEPTION 'record_date não pode estar no futuro distante';
  END IF;

  -- Básico opcional, mas quando preenchido deve estar em faixa plausível
  IF NEW.weight IS NOT NULL AND (NEW.weight < 20 OR NEW.weight > 350) THEN
    RAISE EXCEPTION 'weight fora da faixa clínica plausível (20-350 kg): %', NEW.weight;
  END IF;

  IF NEW.height IS NOT NULL AND (NEW.height < 100 OR NEW.height > 250) THEN
    RAISE EXCEPTION 'height fora da faixa clínica plausível (100-250 cm): %', NEW.height;
  END IF;

  -- Se um dos dois vier, ambos devem vir (coerência da seção básica)
  IF (NEW.weight IS NULL) <> (NEW.height IS NULL) THEN
    RAISE EXCEPTION 'Peso e altura devem ser informados juntos na seção básica';
  END IF;

  -- Pelo menos uma seção deve ser preenchida
  IF NEW.weight IS NULL
     AND (NEW.circumferences IS NULL OR NEW.circumferences = '{}'::jsonb)
     AND (NEW.skinfolds IS NULL OR NEW.skinfolds = '{}'::jsonb)
     AND (NEW.bone_diameters IS NULL OR NEW.bone_diameters = '{}'::jsonb)
     AND (NEW.bioimpedance IS NULL OR NEW.bioimpedance = '{}'::jsonb)
     AND (NEW.photos IS NULL OR jsonb_array_length(to_jsonb(NEW.photos)) = 0) THEN
    RAISE EXCEPTION 'Registro inválido: preencha pelo menos uma seção antropométrica';
  END IF;

  PERFORM public._validate_growth_record_json_section(NEW.circumferences, 'circumferences', 10, 300);
  PERFORM public._validate_growth_record_json_section(NEW.skinfolds, 'skinfolds', 1, 120);
  PERFORM public._validate_growth_record_json_section(NEW.bone_diameters, 'bone_diameters', 1, 40);
  PERFORM public._validate_growth_record_json_section(NEW.bioimpedance, 'bioimpedance', 0, 1000);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_records_validate_clinical ON public.growth_records;
CREATE TRIGGER trg_growth_records_validate_clinical
BEFORE INSERT OR UPDATE ON public.growth_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_growth_records_validate_clinical();

-- =====================================================
-- 2) Cross-module sync flags
-- =====================================================

CREATE TABLE IF NOT EXISTS public.patient_module_sync_flags (
  patient_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  anthropometry_updated_at timestamptz,
  needs_energy_recalc boolean NOT NULL DEFAULT false,
  needs_meal_plan_review boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_module_sync_flags ENABLE ROW LEVEL SECURITY;

-- RLS optimized:
-- - auth.uid() wrapped in SELECT to avoid per-row re-evaluation warning
-- - split write policies by action to avoid "multiple permissive policies" on SELECT
DROP POLICY IF EXISTS "patient_module_sync_flags_select_involved" ON public.patient_module_sync_flags;
DROP POLICY IF EXISTS "patient_module_sync_flags_update_nutritionist" ON public.patient_module_sync_flags;
DROP POLICY IF EXISTS "patient_module_sync_flags_insert_nutritionist" ON public.patient_module_sync_flags;
DROP POLICY IF EXISTS "patient_module_sync_flags_update_nutritionist_only" ON public.patient_module_sync_flags;
DROP POLICY IF EXISTS "patient_module_sync_flags_delete_nutritionist" ON public.patient_module_sync_flags;

CREATE POLICY "patient_module_sync_flags_select_involved"
  ON public.patient_module_sync_flags
  FOR SELECT
  TO authenticated
  USING (
    patient_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = patient_id
        AND up.nutritionist_id = (select auth.uid())
    )
  );

CREATE POLICY "patient_module_sync_flags_insert_nutritionist"
  ON public.patient_module_sync_flags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = patient_id
        AND up.nutritionist_id = (select auth.uid())
    )
  );

CREATE POLICY "patient_module_sync_flags_update_nutritionist_only"
  ON public.patient_module_sync_flags
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = patient_id
        AND up.nutritionist_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = patient_id
        AND up.nutritionist_id = (select auth.uid())
    )
  );

CREATE POLICY "patient_module_sync_flags_delete_nutritionist"
  ON public.patient_module_sync_flags
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = patient_id
        AND up.nutritionist_id = (select auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.trg_growth_records_sync_modules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 2.1 Atualiza peso atual da meta ativa
  IF NEW.weight IS NOT NULL THEN
    UPDATE public.patient_goals
    SET current_weight = NEW.weight,
        updated_at = now()
    WHERE patient_id = NEW.patient_id
      AND status = 'active';
  END IF;

  -- 2.2 Marca módulos dependentes para revisão/recálculo
  INSERT INTO public.patient_module_sync_flags (
    patient_id,
    anthropometry_updated_at,
    needs_energy_recalc,
    needs_meal_plan_review,
    updated_at
  )
  VALUES (
    NEW.patient_id,
    now(),
    true,
    true,
    now()
  )
  ON CONFLICT (patient_id)
  DO UPDATE
  SET anthropometry_updated_at = EXCLUDED.anthropometry_updated_at,
      needs_energy_recalc = true,
      needs_meal_plan_review = true,
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_records_sync_modules ON public.growth_records;
CREATE TRIGGER trg_growth_records_sync_modules
AFTER INSERT ON public.growth_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_growth_records_sync_modules();

-- =====================================================
-- 3) Longitudinal score RPC (30/60/90)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_anthropometry_longitudinal_score(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  latest_rec record;
  goal_type text;
  objective text;
  out_json jsonb := '{}'::jsonb;
  window_days integer;
  baseline_rec record;
  weight_delta numeric;
  bmi_latest numeric;
  bmi_base numeric;
  bmi_delta numeric;
  score integer;
  status text;
BEGIN
  SELECT *
  INTO latest_rec
  FROM public.growth_records
  WHERE patient_id = p_patient_id
    AND COALESCE(is_latest_revision, true) = true
  ORDER BY record_date DESC, COALESCE(revision_number, 1) DESC
  LIMIT 1;

  IF latest_rec IS NULL THEN
    RETURN jsonb_build_object(
      'has_data', false,
      'message', 'Sem registros antropométricos suficientes.'
    );
  END IF;

  SELECT pg.goal_type
  INTO goal_type
  FROM public.patient_goals pg
  WHERE pg.patient_id = p_patient_id
    AND pg.status = 'active'
  ORDER BY pg.created_at DESC
  LIMIT 1;

  goal_type := lower(COALESCE(goal_type, 'maintenance'));
  IF goal_type IN ('weight_loss', 'perda_peso', 'emagrecimento') THEN
    objective := 'weight_loss';
  ELSIF goal_type IN ('weight_gain', 'ganho_peso', 'hipertrofia') THEN
    objective := 'weight_gain';
  ELSE
    objective := 'maintenance';
  END IF;

  out_json := jsonb_build_object(
    'has_data', true,
    'objective', objective,
    'latest_record_date', latest_rec.record_date
  );

  FOREACH window_days IN ARRAY ARRAY[30, 60, 90]
  LOOP
    SELECT *
    INTO baseline_rec
    FROM public.growth_records
    WHERE patient_id = p_patient_id
      AND COALESCE(is_latest_revision, true) = true
      AND record_date <= (latest_rec.record_date - make_interval(days => window_days))
    ORDER BY record_date DESC, COALESCE(revision_number, 1) DESC
    LIMIT 1;

    IF baseline_rec IS NULL THEN
      out_json := out_json || jsonb_build_object(
        format('d%s', window_days),
        jsonb_build_object('has_data', false)
      );
      CONTINUE;
    END IF;

    weight_delta := CASE
      WHEN latest_rec.weight IS NOT NULL AND baseline_rec.weight IS NOT NULL
      THEN round((latest_rec.weight - baseline_rec.weight)::numeric, 2)
      ELSE NULL
    END;

    bmi_latest := CASE
      WHEN latest_rec.weight IS NOT NULL AND latest_rec.height IS NOT NULL
      THEN latest_rec.weight / ((latest_rec.height / 100.0) ^ 2)
      ELSE NULL
    END;

    bmi_base := CASE
      WHEN baseline_rec.weight IS NOT NULL AND baseline_rec.height IS NOT NULL
      THEN baseline_rec.weight / ((baseline_rec.height / 100.0) ^ 2)
      ELSE NULL
    END;

    bmi_delta := CASE
      WHEN bmi_latest IS NOT NULL AND bmi_base IS NOT NULL
      THEN round((bmi_latest - bmi_base)::numeric, 2)
      ELSE NULL
    END;

    score := 0;
    IF objective = 'weight_loss' THEN
      IF weight_delta IS NOT NULL THEN
        IF weight_delta < -0.2 THEN score := score + 2;
        ELSIF weight_delta > 0.2 THEN score := score - 2;
        END IF;
      END IF;
      IF bmi_delta IS NOT NULL THEN
        IF bmi_delta < -0.1 THEN score := score + 1;
        ELSIF bmi_delta > 0.1 THEN score := score - 1;
        END IF;
      END IF;
    ELSIF objective = 'weight_gain' THEN
      IF weight_delta IS NOT NULL THEN
        IF weight_delta > 0.2 THEN score := score + 2;
        ELSIF weight_delta < -0.2 THEN score := score - 2;
        END IF;
      END IF;
      IF bmi_delta IS NOT NULL THEN
        IF bmi_delta > 0.1 THEN score := score + 1;
        ELSIF bmi_delta < -0.1 THEN score := score - 1;
        END IF;
      END IF;
    ELSE
      IF weight_delta IS NOT NULL THEN
        IF abs(weight_delta) <= 0.5 THEN score := score + 1;
        ELSE score := score - 1;
        END IF;
      END IF;
    END IF;

    status := CASE
      WHEN score >= 2 THEN 'improved'
      WHEN score <= -2 THEN 'worsened'
      ELSE 'stable'
    END;

    out_json := out_json || jsonb_build_object(
      format('d%s', window_days),
      jsonb_build_object(
        'has_data', true,
        'baseline_record_date', baseline_rec.record_date,
        'weight_delta', weight_delta,
        'bmi_delta', bmi_delta,
        'score', score,
        'status', status
      )
    );
  END LOOP;

  RETURN out_json;
END;
$$;

COMMIT;


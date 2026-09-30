
-- ============================================================
-- Tabela: nutritionist_custom_measures
-- Medidas caseiras personalizadas criadas por nutricionistas
-- Limite: 20 por nutricionista
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nutritionist_custom_measures (
  id                BIGSERIAL PRIMARY KEY,
  nutritionist_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  code              TEXT NOT NULL,
  grams_equivalent  NUMERIC NOT NULL CHECK (grams_equivalent > 0),
  description       TEXT,
  category          TEXT NOT NULL DEFAULT 'volume' CHECK (category IN ('volume','unit','weight','other')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  order_index       INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nutritionist_id, code)
);

COMMENT ON TABLE public.nutritionist_custom_measures IS 
  'Medidas caseiras personalizadas criadas por nutricionistas (máximo 20 por nutricionista). Cada medida define sua equivalência em gramas para uso nos cálculos nutricionais.';

-- Index para queries frequentes
CREATE INDEX IF NOT EXISTS idx_ncm_nutritionist_active 
  ON public.nutritionist_custom_measures (nutritionist_id, is_active);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.nutritionist_custom_measures ENABLE ROW LEVEL SECURITY;

-- Nutricionista vê apenas suas próprias medidas
CREATE POLICY "nutritionist_custom_measures_select"
  ON public.nutritionist_custom_measures
  FOR SELECT
  USING (auth.uid() = nutritionist_id);

-- Nutricionista cria apenas suas próprias medidas (máx 20)
CREATE POLICY "nutritionist_custom_measures_insert"
  ON public.nutritionist_custom_measures
  FOR INSERT
  WITH CHECK (
    auth.uid() = nutritionist_id
    AND (
      SELECT COUNT(*) FROM public.nutritionist_custom_measures
      WHERE nutritionist_id = auth.uid()
    ) < 20
  );

-- Nutricionista edita apenas suas próprias medidas
CREATE POLICY "nutritionist_custom_measures_update"
  ON public.nutritionist_custom_measures
  FOR UPDATE
  USING (auth.uid() = nutritionist_id)
  WITH CHECK (auth.uid() = nutritionist_id);

-- Nutricionista exclui apenas suas próprias medidas
CREATE POLICY "nutritionist_custom_measures_delete"
  ON public.nutritionist_custom_measures
  FOR DELETE
  USING (auth.uid() = nutritionist_id);

-- ── Trigger: updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_ncm()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ncm_updated_at
  BEFORE UPDATE ON public.nutritionist_custom_measures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ncm();

-- ── Função: converter medida custom → gramas antes de excluir ─
-- Quando uma medida personalizada é excluída, todos os meal_plan_foods
-- que a usam têm sua quantity convertida para gramas (unit → 'gram').
-- Ex: quantity=2, grams_equivalent=240 → quantity=480, unit='gram'
CREATE OR REPLACE FUNCTION public.convert_custom_measure_to_grams()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Converter meal_plan_foods
  UPDATE public.meal_plan_foods
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  -- Converter substituições
  UPDATE public.meal_plan_food_substitutions
  SET
    quantity = quantity * OLD.grams_equivalent,
    unit     = 'gram'
  WHERE unit = OLD.code;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_ncm_before_delete
  BEFORE DELETE ON public.nutritionist_custom_measures
  FOR EACH ROW EXECUTE FUNCTION public.convert_custom_measure_to_grams();

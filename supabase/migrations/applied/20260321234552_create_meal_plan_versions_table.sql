
CREATE TABLE IF NOT EXISTS public.meal_plan_versions (
    id             BIGSERIAL PRIMARY KEY,
    meal_plan_id   BIGINT        NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
    nutritionist_id UUID         NOT NULL,
    patient_id     UUID          NOT NULL,
    version_number INTEGER       NOT NULL DEFAULT 1,
    change_reason  TEXT,
    snapshot       JSONB         NOT NULL DEFAULT '{}',
    is_rollback    BOOLEAN       NOT NULL DEFAULT FALSE,
    metadata       JSONB         NOT NULL DEFAULT '{}',
    created_by     UUID,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_plan_versions_plan_id
    ON public.meal_plan_versions (meal_plan_id, version_number DESC);

ALTER TABLE public.meal_plan_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutricionista gerencia versões dos seus planos"
    ON public.meal_plan_versions
    FOR ALL
    USING ((SELECT auth.uid()) = nutritionist_id)
    WITH CHECK ((SELECT auth.uid()) = nutritionist_id);

CREATE TABLE IF NOT EXISTS public.activity_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb DEFAULT '{}',
    patient_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_patient_id ON public.activity_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_occurred_at ON public.activity_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_event_name ON public.activity_log(event_name);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutritionists can read activity_log for their patients"
    ON public.activity_log FOR SELECT
    USING (
        patient_id IN (
            SELECT id FROM public.user_profiles WHERE nutritionist_id = auth.uid()
        )
    );

CREATE POLICY "Nutritionists can insert activity_log for their patients"
    ON public.activity_log FOR INSERT
    WITH CHECK (
        patient_id IN (
            SELECT id FROM public.user_profiles WHERE nutritionist_id = auth.uid()
        )
    );

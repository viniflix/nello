
-- ─── archived_patient_links ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutri ver arquivados" ON public.archived_patient_links;
DROP POLICY IF EXISTS "Nutri criar arquivados" ON public.archived_patient_links;
DROP POLICY IF EXISTS "Nutri deletar arquivados" ON public.archived_patient_links;

CREATE POLICY "Nutri ver arquivados" ON public.archived_patient_links
    FOR SELECT USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Nutri criar arquivados" ON public.archived_patient_links
    FOR INSERT WITH CHECK (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Nutri deletar arquivados" ON public.archived_patient_links
    FOR DELETE USING (nutritionist_id = (SELECT auth.uid()));

-- ─── checkin_fields ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Acesso via template do nutricionista" ON public.checkin_fields;
DROP POLICY IF EXISTS "Nutricionista edita seus fields" ON public.checkin_fields;

-- Merged: both had identical USING clause — keep one for `authenticated`
CREATE POLICY "Nutricionista edita seus fields" ON public.checkin_fields
    FOR ALL TO authenticated
    USING (template_id IN (
        SELECT id FROM public.checkin_templates
        WHERE nutritionist_id = (SELECT auth.uid())
    ));

-- ─── checkin_schedules ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia schedules" ON public.checkin_schedules;
DROP POLICY IF EXISTS "Paciente ve seus schedules" ON public.checkin_schedules;

CREATE POLICY "Nutricionista gerencia schedules" ON public.checkin_schedules
    FOR ALL USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Paciente ve seus schedules" ON public.checkin_schedules
    FOR SELECT USING (patient_id = (SELECT auth.uid()));

-- ─── checkin_sessions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista ve sessoes dos seus pacientes" ON public.checkin_sessions;
DROP POLICY IF EXISTS "Paciente ve suas sessoes" ON public.checkin_sessions;

CREATE POLICY "Nutricionista ve sessoes dos seus pacientes" ON public.checkin_sessions
    FOR ALL USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Paciente ve suas sessoes" ON public.checkin_sessions
    FOR ALL USING (patient_id = (SELECT auth.uid()));

-- ─── checkin_templates ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista edita seus templates" ON public.checkin_templates;

CREATE POLICY "Nutricionista edita seus templates" ON public.checkin_templates
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- ─── nutritionist_branding ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia seu branding" ON public.nutritionist_branding;
DROP POLICY IF EXISTS "Paciente le branding do seu nutricionista" ON public.nutritionist_branding;

CREATE POLICY "Nutricionista gerencia seu branding" ON public.nutritionist_branding
    FOR ALL USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Paciente le branding do seu nutricionista" ON public.nutritionist_branding
    FOR SELECT USING (
        nutritionist_id IN (
            SELECT nutritionist_id FROM public.nutritionist_patients
            WHERE patient_id = (SELECT auth.uid())
        )
    );

-- ─── supplement_logs ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Paciente gerencia seus suplementos" ON public.supplement_logs;
DROP POLICY IF EXISTS "Nutricionista ve suplementos do paciente" ON public.supplement_logs;

CREATE POLICY "Paciente gerencia seus suplementos" ON public.supplement_logs
    FOR ALL USING (patient_id = (SELECT auth.uid()));

CREATE POLICY "Nutricionista ve suplementos do paciente" ON public.supplement_logs
    FOR SELECT USING (nutritionist_id = (SELECT auth.uid()));

-- ─── user_profiles ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutritionists can update their patients profiles" ON public.user_profiles;

CREATE POLICY "Nutritionists can update their patients profiles" ON public.user_profiles
    FOR UPDATE TO authenticated
    USING (
        user_type = 'patient'
        AND nutritionist_id = (SELECT auth.uid())
    )
    WITH CHECK (
        user_type = 'patient'
        AND nutritionist_id = (SELECT auth.uid())
    );

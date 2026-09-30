
-- ─── checkin_sessions: merge two FOR ALL into single combined ────────────────
-- Both nutri and patient (FOR ALL TO authenticated) overlap for every operation
DROP POLICY IF EXISTS "Nutricionista ve sessoes dos seus pacientes" ON public.checkin_sessions;
DROP POLICY IF EXISTS "Paciente ve suas sessoes" ON public.checkin_sessions;

CREATE POLICY "Acesso a sessoes" ON public.checkin_sessions
    FOR ALL TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR patient_id = (SELECT auth.uid())
    );

-- ─── checkin_schedules: merge SELECT overlap ─────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia schedules" ON public.checkin_schedules;
DROP POLICY IF EXISTS "Paciente ve seus schedules" ON public.checkin_schedules;

-- Nutritionist: full write access (INSERT/UPDATE/DELETE) — only via USING nutritionist_id
CREATE POLICY "Nutricionista gerencia schedules" ON public.checkin_schedules
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- Combined SELECT: both nutri and patient can see — single policy to avoid overlap
CREATE POLICY "Acesso leitura schedules" ON public.checkin_schedules
    FOR SELECT TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR patient_id = (SELECT auth.uid())
    );

-- ─── checkin_fields: merge SELECT overlap ────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista edita seus fields" ON public.checkin_fields;
DROP POLICY IF EXISTS "Paciente le campos do seu checkin" ON public.checkin_fields;

-- Single ALL for nutritionist (covers write access via template ownership)
CREATE POLICY "Nutricionista edita seus fields" ON public.checkin_fields
    FOR ALL TO authenticated
    USING (template_id IN (
        SELECT id FROM public.checkin_templates
        WHERE nutritionist_id = (SELECT auth.uid())
    ));

-- Single combined SELECT for both roles
CREATE POLICY "Acesso leitura fields" ON public.checkin_fields
    FOR SELECT TO authenticated
    USING (
        -- Nutritionist sees their own template fields
        template_id IN (
            SELECT id FROM public.checkin_templates
            WHERE nutritionist_id = (SELECT auth.uid())
        )
        OR
        -- Patient sees fields from their assigned schedules
        template_id IN (
            SELECT template_id FROM public.checkin_schedules
            WHERE patient_id = (SELECT auth.uid())
        )
    );

-- ─── checkin_templates: merge SELECT overlap ─────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista edita seus templates" ON public.checkin_templates;
DROP POLICY IF EXISTS "Paciente le seus templates" ON public.checkin_templates;

-- Nutritionist: full write access
CREATE POLICY "Nutricionista edita seus templates" ON public.checkin_templates
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- Combined SELECT: merge nutri + patient access
CREATE POLICY "Acesso leitura templates" ON public.checkin_templates
    FOR SELECT TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR id IN (
            SELECT template_id FROM public.checkin_schedules
            WHERE patient_id = (SELECT auth.uid())
        )
    );

-- ─── nutritionist_branding: merge SELECT overlap ─────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia seu branding" ON public.nutritionist_branding;
DROP POLICY IF EXISTS "Paciente le branding do seu nutricionista" ON public.nutritionist_branding;

-- Full write access for nutritionist
CREATE POLICY "Nutricionista gerencia seu branding" ON public.nutritionist_branding
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- Single SELECT covering both roles
CREATE POLICY "Acesso leitura branding" ON public.nutritionist_branding
    FOR SELECT TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR nutritionist_id IN (
            SELECT nutritionist_id FROM public.nutritionist_patients
            WHERE patient_id = (SELECT auth.uid())
        )
    );

-- ─── supplement_logs: merge SELECT overlap ───────────────────────────────────
DROP POLICY IF EXISTS "Paciente gerencia seus suplementos" ON public.supplement_logs;
DROP POLICY IF EXISTS "Nutricionista ve suplementos do paciente" ON public.supplement_logs;

-- Full write access for patient (owner of logs)
CREATE POLICY "Paciente gerencia seus suplementos" ON public.supplement_logs
    FOR ALL TO authenticated
    USING (patient_id = (SELECT auth.uid()));

-- Single SELECT for both: patient (owner) + nutritionist (manages the patient)
CREATE POLICY "Acesso leitura suplementos" ON public.supplement_logs
    FOR SELECT TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR nutritionist_id = (SELECT auth.uid())
    );

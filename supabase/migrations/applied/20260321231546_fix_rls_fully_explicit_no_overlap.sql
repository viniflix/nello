
-- ─── checkin_fields ───────────────────────────────────────────────────────────
-- Drop both overlapping policies
DROP POLICY IF EXISTS "Nutricionista edita seus fields" ON public.checkin_fields;
DROP POLICY IF EXISTS "Acesso leitura fields" ON public.checkin_fields;

-- Single SELECT for everyone (nutri or patient with an assigned schedule)
CREATE POLICY "Leitura fields" ON public.checkin_fields
    FOR SELECT TO authenticated
    USING (
        template_id IN (SELECT id FROM public.checkin_templates WHERE nutritionist_id = (SELECT auth.uid()))
        OR template_id IN (SELECT template_id FROM public.checkin_schedules WHERE patient_id = (SELECT auth.uid()))
    );

-- Explicit write-only for nutritionist (no overlap with SELECT)
CREATE POLICY "Escrita fields" ON public.checkin_fields
    FOR INSERT TO authenticated
    WITH CHECK (template_id IN (SELECT id FROM public.checkin_templates WHERE nutritionist_id = (SELECT auth.uid())));

CREATE POLICY "Update fields" ON public.checkin_fields
    FOR UPDATE TO authenticated
    USING (template_id IN (SELECT id FROM public.checkin_templates WHERE nutritionist_id = (SELECT auth.uid())));

CREATE POLICY "Delete fields" ON public.checkin_fields
    FOR DELETE TO authenticated
    USING (template_id IN (SELECT id FROM public.checkin_templates WHERE nutritionist_id = (SELECT auth.uid())));

-- ─── checkin_schedules ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia schedules" ON public.checkin_schedules;
DROP POLICY IF EXISTS "Acesso leitura schedules" ON public.checkin_schedules;

CREATE POLICY "Leitura schedules" ON public.checkin_schedules
    FOR SELECT TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR patient_id = (SELECT auth.uid())
    );

CREATE POLICY "Escrita schedules" ON public.checkin_schedules
    FOR INSERT TO authenticated
    WITH CHECK (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Update schedules" ON public.checkin_schedules
    FOR UPDATE TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Delete schedules" ON public.checkin_schedules
    FOR DELETE TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- ─── checkin_templates ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista edita seus templates" ON public.checkin_templates;
DROP POLICY IF EXISTS "Acesso leitura templates" ON public.checkin_templates;

CREATE POLICY "Leitura templates" ON public.checkin_templates
    FOR SELECT TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR id IN (SELECT template_id FROM public.checkin_schedules WHERE patient_id = (SELECT auth.uid()))
    );

CREATE POLICY "Escrita templates" ON public.checkin_templates
    FOR INSERT TO authenticated
    WITH CHECK (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Update templates" ON public.checkin_templates
    FOR UPDATE TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Delete templates" ON public.checkin_templates
    FOR DELETE TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- ─── nutritionist_branding ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Nutricionista gerencia seu branding" ON public.nutritionist_branding;
DROP POLICY IF EXISTS "Acesso leitura branding" ON public.nutritionist_branding;

CREATE POLICY "Leitura branding" ON public.nutritionist_branding
    FOR SELECT TO authenticated
    USING (
        nutritionist_id = (SELECT auth.uid())
        OR nutritionist_id IN (SELECT nutritionist_id FROM public.nutritionist_patients WHERE patient_id = (SELECT auth.uid()))
    );

CREATE POLICY "Escrita branding" ON public.nutritionist_branding
    FOR INSERT TO authenticated
    WITH CHECK (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Update branding" ON public.nutritionist_branding
    FOR UPDATE TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Delete branding" ON public.nutritionist_branding
    FOR DELETE TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- ─── supplement_logs ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Paciente gerencia seus suplementos" ON public.supplement_logs;
DROP POLICY IF EXISTS "Acesso leitura suplementos" ON public.supplement_logs;

CREATE POLICY "Leitura suplementos" ON public.supplement_logs
    FOR SELECT TO authenticated
    USING (
        patient_id = (SELECT auth.uid())
        OR nutritionist_id = (SELECT auth.uid())
    );

CREATE POLICY "Escrita suplementos" ON public.supplement_logs
    FOR INSERT TO authenticated
    WITH CHECK (patient_id = (SELECT auth.uid()));

CREATE POLICY "Update suplementos" ON public.supplement_logs
    FOR UPDATE TO authenticated
    USING (patient_id = (SELECT auth.uid()));

CREATE POLICY "Delete suplementos" ON public.supplement_logs
    FOR DELETE TO authenticated
    USING (patient_id = (SELECT auth.uid()));

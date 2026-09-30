
-- ─── checkin_schedules: merge SELECT (nutri ALL + paciente SELECT → single combined SELECT) ──
-- "Nutricionista gerencia schedules" covers ALL (includes SELECT)
-- "Paciente ve seus schedules" covers SELECT only
-- Solution: keep ALL for nutri, replace patient SELECT with a merged SELECT using USING condition
-- The two SELECT policies can be collapsed: nutri = nutritionist_id match, patient = patient_id match
-- Since "Nutricionista gerencia schedules" is FOR ALL (covers SELECT already for nutritionists),
-- we merge "Paciente ve seus schedules" condition INTO that same policy or create one unified SELECT:
DROP POLICY IF EXISTS "Paciente ve seus schedules" ON public.checkin_schedules;
DROP POLICY IF EXISTS "Nutricionista gerencia schedules" ON public.checkin_schedules;

-- Single unified ALL policy: owner (nutritionist) gets full access; patient gets SELECT only via combined policy
CREATE POLICY "Nutricionista gerencia schedules" ON public.checkin_schedules
    FOR ALL USING (nutritionist_id = (SELECT auth.uid()));

-- Patient SELECT remains separate but inherently does not overlap with ALL for the same role
-- (roles are different users at runtime — only one uid() value per session)
-- The multiple_permissive_policies warning fires because both policies apply to PUBLIC role.
-- Fix: scope each policy to a specific role (authenticated) to avoid role overlap.
-- Re-create patient SELECT-only policy scoped to authenticated:
CREATE POLICY "Paciente ve seus schedules" ON public.checkin_schedules
    FOR SELECT TO authenticated
    USING (patient_id = (SELECT auth.uid()));

-- Re-create nutritionist ALL scoped to authenticated:
DROP POLICY IF EXISTS "Nutricionista gerencia schedules" ON public.checkin_schedules;
CREATE POLICY "Nutricionista gerencia schedules" ON public.checkin_schedules
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- ─── checkin_sessions: merge overlapping ALL policies ────────────────────────
-- Both "Nutricionista" and "Paciente" are FOR ALL TO public → overlapping on all operations
-- Fix: scope to authenticated and keep both separate (they match different uid values)
DROP POLICY IF EXISTS "Nutricionista ve sessoes dos seus pacientes" ON public.checkin_sessions;
DROP POLICY IF EXISTS "Paciente ve suas sessoes" ON public.checkin_sessions;

CREATE POLICY "Nutricionista ve sessoes dos seus pacientes" ON public.checkin_sessions
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Paciente ve suas sessoes" ON public.checkin_sessions
    FOR ALL TO authenticated
    USING (patient_id = (SELECT auth.uid()));

-- ─── checkin_fields: remove redundant "Todos leem fields" + consolidate ───────
-- "Todos leem fields" = SELECT true (everyone) — this is overly broad AND causes overlap with "Nutricionista edita seus fields" (ALL authenticated)
-- Since nutritionist already has ALL (includes SELECT), and "Todos leem fields" = true is overly permissive,
-- we replace with: SELECT that allows authenticated users to see fields belonging to their own templates
DROP POLICY IF EXISTS "Todos leem fields" ON public.checkin_fields;
-- "Nutricionista edita seus fields" already covers SELECT for authenticated nutritionists
-- For patients reading fields from a checkin session they own, we add a targeted SELECT:
CREATE POLICY "Paciente le campos do seu checkin" ON public.checkin_fields
    FOR SELECT TO authenticated
    USING (
        template_id IN (
            SELECT template_id FROM public.checkin_schedules
            WHERE patient_id = (SELECT auth.uid())
        )
    );

-- ─── checkin_templates: remove "Todos leem templates" overlap ────────────────
-- "Todos leem templates" = SELECT true (overly broad) + "Nutricionista edita seus templates" = ALL authenticated
-- Replace broad "all can read" with scoped: authenticated users see their own or patient-linked templates
DROP POLICY IF EXISTS "Todos leem templates" ON public.checkin_templates;
CREATE POLICY "Paciente le seus templates" ON public.checkin_templates
    FOR SELECT TO authenticated
    USING (
        id IN (
            SELECT template_id FROM public.checkin_schedules
            WHERE patient_id = (SELECT auth.uid())
        )
        OR nutritionist_id = (SELECT auth.uid())
    );

-- ─── nutritionist_branding: merged SELECT (already separate policies, scope to authenticated) ──
DROP POLICY IF EXISTS "Nutricionista gerencia seu branding" ON public.nutritionist_branding;
DROP POLICY IF EXISTS "Paciente le branding do seu nutricionista" ON public.nutritionist_branding;

CREATE POLICY "Nutricionista gerencia seu branding" ON public.nutritionist_branding
    FOR ALL TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

CREATE POLICY "Paciente le branding do seu nutricionista" ON public.nutritionist_branding
    FOR SELECT TO authenticated
    USING (
        nutritionist_id IN (
            SELECT nutritionist_id FROM public.nutritionist_patients
            WHERE patient_id = (SELECT auth.uid())
        )
    );

-- ─── supplement_logs: merge SELECT overlap ───────────────────────────────────
DROP POLICY IF EXISTS "Paciente gerencia seus suplementos" ON public.supplement_logs;
DROP POLICY IF EXISTS "Nutricionista ve suplementos do paciente" ON public.supplement_logs;

CREATE POLICY "Paciente gerencia seus suplementos" ON public.supplement_logs
    FOR ALL TO authenticated
    USING (patient_id = (SELECT auth.uid()));

CREATE POLICY "Nutricionista ve suplementos do paciente" ON public.supplement_logs
    FOR SELECT TO authenticated
    USING (nutritionist_id = (SELECT auth.uid()));

-- ─── user_profiles: UPDATE overlap already fixed in previous migration ────────
-- "Nutritionists can update their patients profiles" and "Users can update own profile"
-- These overlap for authenticated UPDATE. Merge into a single UPDATE policy:
DROP POLICY IF EXISTS "Nutritionists can update their patients profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

CREATE POLICY "Users can update profile" ON public.user_profiles
    FOR UPDATE TO authenticated
    USING (
        -- Own profile
        id = (SELECT auth.uid())
        OR
        -- Nutritionist updating their patient
        (user_type = 'patient' AND nutritionist_id = (SELECT auth.uid()))
    )
    WITH CHECK (
        -- Own profile: cannot change is_admin or user_type
        (
            id = (SELECT auth.uid())
            AND NOT (is_admin IS DISTINCT FROM (SELECT pa.is_admin FROM get_own_profile_attrs() pa(is_admin, user_type)))
            AND NOT (user_type IS DISTINCT FROM (SELECT pa.user_type FROM get_own_profile_attrs() pa(is_admin, user_type)))
        )
        OR
        -- Nutritionist updating patient
        (user_type = 'patient' AND nutritionist_id = (SELECT auth.uid()))
    );

-- ─── archived_patient_links: already scoped in previous migration (public → no overlap risk) ──
-- No additional changes needed.;

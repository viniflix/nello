-- =====================================================
-- 1. USER_ACHIEVEMENTS: Drop old policies, create optimized consolidated SELECT
-- =====================================================
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_select_own" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_select_patient_for_nutritionist" ON public.user_achievements;

CREATE POLICY "user_achievements_select" ON public.user_achievements
FOR SELECT TO authenticated
USING (
  (select auth.uid()) = user_id
  OR EXISTS (
    SELECT 1 FROM nutritionist_patients np
    WHERE np.nutritionist_id = (select auth.uid()) AND np.patient_id = user_achievements.user_id
  )
);

-- =====================================================
-- 2. PROGRESS_PHOTOS: Replace auth.uid() with (select auth.uid())
-- =====================================================
DROP POLICY IF EXISTS "progress_photos_select" ON public.progress_photos;
DROP POLICY IF EXISTS "progress_photos_insert" ON public.progress_photos;
DROP POLICY IF EXISTS "progress_photos_update" ON public.progress_photos;
DROP POLICY IF EXISTS "progress_photos_delete" ON public.progress_photos;

CREATE POLICY "progress_photos_select" ON public.progress_photos
FOR SELECT TO authenticated
USING (
  (patient_id = (select auth.uid()))
  OR (EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = progress_photos.patient_id AND p.nutritionist_id = (select auth.uid())
  ))
);

CREATE POLICY "progress_photos_insert" ON public.progress_photos
FOR INSERT TO authenticated
WITH CHECK (
  (patient_id = (select auth.uid()))
  OR (EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = progress_photos.patient_id AND p.nutritionist_id = (select auth.uid())
  ))
);

CREATE POLICY "progress_photos_update" ON public.progress_photos
FOR UPDATE TO authenticated
USING (
  (patient_id = (select auth.uid()))
  OR (EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = progress_photos.patient_id AND p.nutritionist_id = (select auth.uid())
  ))
)
WITH CHECK (
  (patient_id = (select auth.uid()))
  OR (EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = progress_photos.patient_id AND p.nutritionist_id = (select auth.uid())
  ))
);

CREATE POLICY "progress_photos_delete" ON public.progress_photos
FOR DELETE TO authenticated
USING (
  (patient_id = (select auth.uid()))
  OR (EXISTS (
    SELECT 1 FROM user_profiles p
    WHERE p.id = progress_photos.patient_id AND p.nutritionist_id = (select auth.uid())
  ))
);

-- =====================================================
-- 3. MESSAGE_TEMPLATES: Consolidate SELECT + auth initplan for all
-- =====================================================
DROP POLICY IF EXISTS "message_templates_select_defaults" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_select_own" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_insert_own" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_update_own" ON public.message_templates;
DROP POLICY IF EXISTS "message_templates_delete_own" ON public.message_templates;

CREATE POLICY "message_templates_select" ON public.message_templates
FOR SELECT TO authenticated
USING (
  nutritionist_id IS NULL OR nutritionist_id = (select auth.uid())
);

CREATE POLICY "message_templates_insert_own" ON public.message_templates
FOR INSERT TO authenticated
WITH CHECK (nutritionist_id = (select auth.uid()));

CREATE POLICY "message_templates_update_own" ON public.message_templates
FOR UPDATE TO authenticated
USING (nutritionist_id = (select auth.uid()))
WITH CHECK (nutritionist_id = (select auth.uid()));

CREATE POLICY "message_templates_delete_own" ON public.message_templates
FOR DELETE TO authenticated
USING (nutritionist_id = (select auth.uid()));

-- =====================================================
-- 4. TEMPLATE_DISPATCH_LOG: Replace auth.uid() with (select auth.uid())
-- =====================================================
DROP POLICY IF EXISTS "template_dispatch_log_select_scoped" ON public.template_dispatch_log;
DROP POLICY IF EXISTS "template_dispatch_log_insert_own" ON public.template_dispatch_log;

CREATE POLICY "template_dispatch_log_select_scoped" ON public.template_dispatch_log
FOR SELECT TO authenticated
USING (
  nutritionist_id = (select auth.uid()) OR patient_id = (select auth.uid())
);

CREATE POLICY "template_dispatch_log_insert_own" ON public.template_dispatch_log
FOR INSERT TO authenticated
WITH CHECK (nutritionist_id = (select auth.uid()));

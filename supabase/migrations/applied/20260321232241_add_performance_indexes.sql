
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── foods ILIKE: GIN trigram on base tables behind the view ───────────────────
CREATE INDEX IF NOT EXISTS idx_reference_foods_name_trgm
    ON public.reference_foods USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nutritionist_foods_name_trgm
    ON public.nutritionist_foods USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_reference_foods_is_active
    ON public.reference_foods (is_active)
    WHERE is_active = true OR is_active IS NULL;

-- ── appointments cron ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_time_status
    ON public.appointments (appointment_time, status)
    WHERE status NOT IN ('cancelled', 'completed', 'no_show');

-- ── chats: fast lookup for get_unread_senders ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chats_to_id_created
    ON public.chats (to_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chats_from_to
    ON public.chats (from_id, to_id);

-- ── feed_tasks ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feed_tasks_nutritionist_status
    ON public.feed_tasks (nutritionist_id, status)
    WHERE status != 'resolved';

-- ── archived_patient_links ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_archived_patient_links_patient_id
    ON public.archived_patient_links (patient_id);

-- ── checkin_fields ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_checkin_fields_template_id
    ON public.checkin_fields (template_id);

-- ── checkin_schedules ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_checkin_schedules_patient_id
    ON public.checkin_schedules (patient_id);

CREATE INDEX IF NOT EXISTS idx_checkin_schedules_nutritionist_id
    ON public.checkin_schedules (nutritionist_id);

-- ── checkin_sessions ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_patient_id
    ON public.checkin_sessions (patient_id);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_nutritionist_id
    ON public.checkin_sessions (nutritionist_id);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_schedule_id
    ON public.checkin_sessions (schedule_id);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_template_id
    ON public.checkin_sessions (template_id);

-- ── checkin_templates ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_checkin_templates_nutritionist_id
    ON public.checkin_templates (nutritionist_id);

-- ── supplement_logs ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supplement_logs_patient_id
    ON public.supplement_logs (patient_id);

CREATE INDEX IF NOT EXISTS idx_supplement_logs_nutritionist_id
    ON public.supplement_logs (nutritionist_id);

-- ── nutritionist_foods & food_measures ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nutritionist_foods_nutritionist_id
    ON public.nutritionist_foods (nutritionist_id);

CREATE INDEX IF NOT EXISTS idx_food_measures_reference_food_id
    ON public.food_measures (reference_food_id);

CREATE INDEX IF NOT EXISTS idx_food_measures_nutritionist_food_id
    ON public.food_measures (nutritionist_food_id);

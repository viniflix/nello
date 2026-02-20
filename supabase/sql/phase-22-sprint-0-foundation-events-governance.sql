-- Phase 22: Sprint 0 foundation (events, rules, feed tasks)
-- Objetivo:
-- 1) Estruturas base para feed inteligente e auditoria de eventos
-- 2) Regras configuraveis de priorizacao
-- 3) Fundacao de trilha operacional (feed_tasks)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------
-- 1) notification_rules: regras configuraveis de prioridade
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'feed_priority',
  nutritionist_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_rules_scope_owner_key
  ON public.notification_rules (
    scope,
    coalesce(nutritionist_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rule_key
  );

CREATE INDEX IF NOT EXISTS idx_notification_rules_owner_scope_active
  ON public.notification_rules (nutritionist_id, scope, is_active);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_rules_select_owner_or_global" ON public.notification_rules;
CREATE POLICY "notification_rules_select_owner_or_global"
  ON public.notification_rules
  FOR SELECT
  TO authenticated
  USING (
    nutritionist_id IS NULL
    OR nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "notification_rules_insert_owner_or_admin" ON public.notification_rules;
CREATE POLICY "notification_rules_insert_owner_or_admin"
  ON public.notification_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      nutritionist_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.user_profiles up
        WHERE up.id = (SELECT auth.uid())
          AND up.role = 'nutritionist'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "notification_rules_update_owner_or_admin" ON public.notification_rules;
CREATE POLICY "notification_rules_update_owner_or_admin"
  ON public.notification_rules
  FOR UPDATE
  TO authenticated
  USING (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  )
  WITH CHECK (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "notification_rules_delete_owner_or_admin" ON public.notification_rules;
CREATE POLICY "notification_rules_delete_owner_or_admin"
  ON public.notification_rules
  FOR DELETE
  TO authenticated
  USING (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

-- -----------------------------------------------------
-- 2) feed_tasks: estado operacional do feed (open/snoozed/resolved)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nutritionist_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_id text,
  title text NOT NULL,
  description text,
  priority_score integer NOT NULL DEFAULT 0,
  priority_reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'resolved')),
  snooze_until timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_tasks_nutritionist_status_updated
  ON public.feed_tasks (nutritionist_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_tasks_nutritionist_snooze
  ON public.feed_tasks (nutritionist_id, snooze_until)
  WHERE status = 'snoozed';

CREATE INDEX IF NOT EXISTS idx_feed_tasks_patient
  ON public.feed_tasks (patient_id, created_at DESC);

ALTER TABLE public.feed_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_tasks_owner_select" ON public.feed_tasks;
CREATE POLICY "feed_tasks_owner_select"
  ON public.feed_tasks
  FOR SELECT
  TO authenticated
  USING (
    nutritionist_id = (SELECT auth.uid())
    OR resolved_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "feed_tasks_owner_insert" ON public.feed_tasks;
CREATE POLICY "feed_tasks_owner_insert"
  ON public.feed_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "feed_tasks_owner_update" ON public.feed_tasks;
CREATE POLICY "feed_tasks_owner_update"
  ON public.feed_tasks
  FOR UPDATE
  TO authenticated
  USING (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  )
  WITH CHECK (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "feed_tasks_owner_delete" ON public.feed_tasks;
CREATE POLICY "feed_tasks_owner_delete"
  ON public.feed_tasks
  FOR DELETE
  TO authenticated
  USING (
    nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

-- -----------------------------------------------------
-- 3) activity_log: contrato unificado de eventos
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  source_module text,
  patient_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  nutritionist_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS event_version integer,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS patient_id uuid,
  ADD COLUMN IF NOT EXISTS nutritionist_id uuid,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.activity_log
SET
  event_name = COALESCE(event_name, 'legacy.event'),
  event_version = COALESCE(event_version, 1),
  occurred_at = COALESCE(occurred_at, created_at, now()),
  payload = COALESCE(payload, '{}'::jsonb),
  created_at = COALESCE(created_at, now())
WHERE
  event_name IS NULL
  OR event_version IS NULL
  OR occurred_at IS NULL
  OR payload IS NULL
  OR created_at IS NULL;

ALTER TABLE public.activity_log
  ALTER COLUMN event_name SET NOT NULL,
  ALTER COLUMN event_version SET NOT NULL,
  ALTER COLUMN event_version SET DEFAULT 1,
  ALTER COLUMN occurred_at SET NOT NULL,
  ALTER COLUMN occurred_at SET DEFAULT now(),
  ALTER COLUMN payload SET NOT NULL,
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_activity_log_nutritionist_occurred
  ON public.activity_log (nutritionist_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_patient_occurred
  ON public.activity_log (patient_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_event_occurred
  ON public.activity_log (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_payload_gin
  ON public.activity_log USING gin (payload);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_select_involved" ON public.activity_log;
CREATE POLICY "activity_log_select_involved"
  ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (
    actor_user_id = (SELECT auth.uid())
    OR patient_id = (SELECT auth.uid())
    OR nutritionist_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.nutritionist_patients np
      WHERE np.patient_id = activity_log.patient_id
        AND np.nutritionist_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "activity_log_insert_involved" ON public.activity_log;
CREATE POLICY "activity_log_insert_involved"
  ON public.activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = (SELECT auth.uid())
    OR (
      actor_user_id IS NULL
      AND (
        patient_id = (SELECT auth.uid())
        OR nutritionist_id = (SELECT auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = (SELECT auth.uid())
        AND up.role = 'super_admin'
    )
  );

-- -----------------------------------------------------
-- 4) Funcoes utilitarias de logging
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_activity_event(
  p_event_name text,
  p_event_version integer DEFAULT 1,
  p_source_module text DEFAULT null,
  p_patient_id uuid DEFAULT null,
  p_nutritionist_id uuid DEFAULT null,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.activity_log (
    event_name,
    event_version,
    source_module,
    patient_id,
    nutritionist_id,
    actor_user_id,
    occurred_at,
    payload
  )
  VALUES (
    COALESCE(NULLIF(trim(p_event_name), ''), 'unknown.event'),
    GREATEST(COALESCE(p_event_version, 1), 1),
    p_source_module,
    p_patient_id,
    p_nutritionist_id,
    (SELECT auth.uid()),
    now(),
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- -----------------------------------------------------
-- 5) Triggers de updated_at
-- -----------------------------------------------------
DROP TRIGGER IF EXISTS trg_notification_rules_set_updated_at ON public.notification_rules;
CREATE TRIGGER trg_notification_rules_set_updated_at
BEFORE UPDATE ON public.notification_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_feed_tasks_set_updated_at ON public.feed_tasks;
CREATE TRIGGER trg_feed_tasks_set_updated_at
BEFORE UPDATE ON public.feed_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------
-- 6) Seed de regras globais default
-- -----------------------------------------------------
INSERT INTO public.notification_rules (scope, nutritionist_id, rule_key, weight, config, is_active)
SELECT 'feed_priority', null, 'pending_data', 5, '{"label":"Pendencia de dados essenciais"}'::jsonb, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_rules nr
  WHERE nr.scope = 'feed_priority'
    AND nr.nutritionist_id IS NULL
    AND nr.rule_key = 'pending_data'
);

INSERT INTO public.notification_rules (scope, nutritionist_id, rule_key, weight, config, is_active)
SELECT 'feed_priority', null, 'low_adherence', 4, '{"days_inactive_threshold":2}'::jsonb, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_rules nr
  WHERE nr.scope = 'feed_priority'
    AND nr.nutritionist_id IS NULL
    AND nr.rule_key = 'low_adherence'
);

INSERT INTO public.notification_rules (scope, nutritionist_id, rule_key, weight, config, is_active)
SELECT 'feed_priority', null, 'lab_high_risk', 5, '{"label":"Risco laboratorial alto"}'::jsonb, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_rules nr
  WHERE nr.scope = 'feed_priority'
    AND nr.nutritionist_id IS NULL
    AND nr.rule_key = 'lab_high_risk'
);

INSERT INTO public.notification_rules (scope, nutritionist_id, rule_key, weight, config, is_active)
SELECT 'feed_priority', null, 'appointment_upcoming', 3, '{"hours_window":24}'::jsonb, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_rules nr
  WHERE nr.scope = 'feed_priority'
    AND nr.nutritionist_id IS NULL
    AND nr.rule_key = 'appointment_upcoming'
);

INSERT INTO public.notification_rules (scope, nutritionist_id, rule_key, weight, config, is_active)
SELECT 'feed_priority', null, 'recent_activity', 1, '{"label":"Atividade recente"}'::jsonb, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_rules nr
  WHERE nr.scope = 'feed_priority'
    AND nr.nutritionist_id IS NULL
    AND nr.rule_key = 'recent_activity'
);

COMMIT;

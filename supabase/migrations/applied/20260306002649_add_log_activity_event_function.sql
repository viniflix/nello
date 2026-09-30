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

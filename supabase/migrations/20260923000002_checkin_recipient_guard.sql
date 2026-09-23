-- An offline clinical profile cannot receive an in-app check-in.
CREATE OR REPLACE FUNCTION private.require_checkin_patient_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
  IF NEW.is_active IS TRUE AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=NEW.patient_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='checkin_patient_account_required';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_checkin_patient_account ON public.checkin_schedules;
CREATE TRIGGER trg_checkin_patient_account
BEFORE INSERT OR UPDATE OF patient_id, is_active ON public.checkin_schedules
FOR EACH ROW EXECUTE FUNCTION private.require_checkin_patient_account();

-- A deleted account must not prevent other due check-ins from dispatching.
CREATE OR REPLACE FUNCTION private.dispatch_due_checkins()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private' AS $function$
DECLARE
  v_schedule record;
  v_session_id uuid;
  v_fields jsonb;
  v_sent integer := 0;
  v_now timestamptz := now();
BEGIN
  UPDATE public.checkin_sessions SET status='expired'
  WHERE status='pending' AND expires_at<=v_now;
  FOR v_schedule IN
    SELECT s.*,t.name,t.frequency,t.send_days,t.send_time
    FROM public.checkin_schedules s
    JOIN public.checkin_templates t ON t.id=s.template_id
    JOIN public.care_episodes ce ON ce.id=s.care_episode_id
    WHERE s.is_active IS TRUE AND t.is_active IS TRUE
      AND s.channel='in_app' AND s.next_send_at<=v_now
      AND ce.status='active' AND coalesce(ce.is_simulation,false)=false
      AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id=s.patient_id)
    ORDER BY s.next_send_at,s.id
    LIMIT 100 FOR UPDATE OF s SKIP LOCKED
  LOOP
    SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.order_index,f.id),'[]'::jsonb)
      INTO v_fields FROM public.checkin_fields f WHERE f.template_id=v_schedule.template_id;
    IF jsonb_array_length(v_fields)=0 THEN
      RAISE WARNING 'Check-in schedule % has no fields',v_schedule.id;
      CONTINUE;
    END IF;
    INSERT INTO public.checkin_sessions(
      schedule_id,patient_id,nutritionist_id,template_id,care_episode_id,
      scheduled_for,sent_at,expires_at,fields_snapshot
    ) VALUES (
      v_schedule.id,v_schedule.patient_id,v_schedule.nutritionist_id,
      v_schedule.template_id,v_schedule.care_episode_id,v_schedule.next_send_at,
      v_now,v_now+interval '48 hours',v_fields
    ) ON CONFLICT (schedule_id,scheduled_for) DO NOTHING RETURNING id INTO v_session_id;
    IF v_session_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,type,title,message,link_url,content)
      VALUES (v_schedule.patient_id,'checkin','Novo check-in disponível',
        'Responda seu check-in no app Nello.','/patient/checkin/'||v_session_id::text,
        jsonb_build_object('session_id',v_session_id));
      v_sent:=v_sent+1;
    END IF;
    UPDATE public.checkin_schedules SET last_sent_at=v_now,
      next_send_at=private.next_checkin_send_at(v_schedule.frequency,
        v_schedule.send_days,v_schedule.send_time,v_schedule.time_zone,v_now)
    WHERE id=v_schedule.id;
    v_session_id:=NULL;
  END LOOP;
  RETURN v_sent;
END;
$function$;

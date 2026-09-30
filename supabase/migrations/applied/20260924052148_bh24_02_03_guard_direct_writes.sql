-- Apply appointment status and billing invariants to direct table writes too.
CREATE OR REPLACE FUNCTION private.guard_appointment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status IN ('scheduled', 'awaiting_confirmation') AND NEW.status IN ('confirmed', 'cancelled'))
    OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled', 'no_show'))
  ) THEN
    RAISE EXCEPTION 'APPOINTMENT_INVALID_TRANSITION';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_appointment_status_transition ON public.appointments;
CREATE TRIGGER trg_guard_appointment_status_transition
BEFORE UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.guard_appointment_status_transition();

CREATE OR REPLACE FUNCTION private.cancel_pending_appointment_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.financial_transactions
    WHERE appointment_id = NEW.id AND status IN ('pending', 'overdue');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cancel_pending_appointment_charge ON public.appointments;
CREATE TRIGGER trg_cancel_pending_appointment_charge
AFTER UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.cancel_pending_appointment_charge();

CREATE OR REPLACE FUNCTION private.guard_financial_appointment_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_nutritionist uuid;
  v_patient uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.appointment_id IS NOT NULL
     AND NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FINANCIAL_APPOINTMENT_LINK_IMMUTABLE';
  END IF;
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT a.nutritionist_id, a.patient_id INTO v_nutritionist, v_patient
  FROM public.appointments a WHERE a.id = NEW.appointment_id FOR KEY SHARE;
  IF NOT FOUND OR v_nutritionist IS DISTINCT FROM NEW.nutritionist_id
     OR v_patient IS DISTINCT FROM NEW.patient_id
     OR NEW.type <> 'income' THEN
    RAISE EXCEPTION 'FINANCIAL_APPOINTMENT_LINK_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_financial_appointment_link ON public.financial_transactions;
CREATE TRIGGER trg_guard_financial_appointment_link
BEFORE INSERT OR UPDATE OF appointment_id, nutritionist_id, patient_id, type
ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION private.guard_financial_appointment_link();

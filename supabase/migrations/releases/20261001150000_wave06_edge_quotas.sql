-- Private technical counters only: no request payload, network address or clinical data.
CREATE TABLE private.edge_operation_quotas (
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK (operation IN ('pdf','sentry','document')),
 window_start timestamptz NOT NULL,
 attempts integer NOT NULL CHECK (attempts > 0),
 PRIMARY KEY (actor_id,operation)
);
ALTER TABLE private.edge_operation_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.edge_operation_quotas FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.consume_edge_operation_quota(p_actor uuid,p_operation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,private,pg_temp
AS $function$
DECLARE v_limit integer;v_attempts integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id=p_actor AND coalesce(is_active,true)) THEN RETURN false;END IF;
 v_limit:=CASE p_operation WHEN 'pdf' THEN 10 WHEN 'sentry' THEN 30 WHEN 'document' THEN 20 ELSE NULL END;
 IF v_limit IS NULL THEN RAISE EXCEPTION 'unsupported_operation' USING ERRCODE='22023';END IF;
 INSERT INTO private.edge_operation_quotas AS q(actor_id,operation,window_start,attempts)
 VALUES(p_actor,p_operation,clock_timestamp(),1)
 ON CONFLICT(actor_id,operation) DO UPDATE SET
 attempts=CASE WHEN q.window_start<=clock_timestamp()-interval '1 minute' THEN 1 ELSE least(q.attempts+1,v_limit+1) END,
 window_start=CASE WHEN q.window_start<=clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE q.window_start END
 RETURNING attempts INTO v_attempts;
 RETURN v_attempts<=v_limit;
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_edge_operation_quota(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_operation_quota(uuid,text) TO service_role;

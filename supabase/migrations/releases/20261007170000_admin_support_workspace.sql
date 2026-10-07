-- Private support content never enters clinical records or product telemetry.
BEGIN;
CREATE FUNCTION private.support_require(p_write boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF auth.uid() IS NULL OR NOT private.is_admin() OR NOT EXISTS(SELECT 1 FROM private.admin_operators WHERE user_id=auth.uid() AND revoked_at IS NULL AND (NOT p_write OR role IN ('owner','operator'))) THEN
  RAISE EXCEPTION USING errcode='42501',message='support_admin_required';
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.support_require(boolean) FROM PUBLIC,anon,authenticated;
CREATE TABLE private.support_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),
 contact_email text NOT NULL CHECK(length(contact_email)<=254 AND contact_email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','waiting_user','waiting_fix','closed')),
 category text NOT NULL DEFAULT 'guidance' CHECK(category IN ('bug','friction','suggestion','guidance')),
 module text NOT NULL DEFAULT 'other' CHECK(module IN ('meal_plan','chat','patients','auth','billing','other')),
 issue_id text CHECK(issue_id ~ '^[0-9]{1,30}$'), revision bigint NOT NULL DEFAULT 1,
 received_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 first_reply_at timestamptz, closed_at timestamptz, reopen_count integer NOT NULL DEFAULT 0,
 classification text NOT NULL DEFAULT 'unreviewed' CHECK(classification IN ('unreviewed','operational','sensitive')),
 legal_hold boolean NOT NULL DEFAULT false, review_after timestamptz NOT NULL DEFAULT now()+interval '180 days'
);
CREATE TABLE private.support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES private.support_cases(id) ON DELETE RESTRICT,
 direction text NOT NULL CHECK(direction IN ('incoming','outgoing','note')), body text NOT NULL CHECK(length(body)<=20000),
 partial boolean NOT NULL DEFAULT false, provider_id uuid UNIQUE, provider_message_id text,
 attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=20),
 state text NOT NULL CHECK(state IN ('received','internal','queued','sending','unknown','sent','delivered','bounced','failed')),
 actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT, nonce uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), occurred_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz,
 lease uuid, lease_at timestamptz, provider_event_at timestamptz
);
CREATE INDEX support_cases_queue ON private.support_cases(status,updated_at DESC,id);
CREATE INDEX support_messages_case ON private.support_messages(case_id,created_at DESC,id);
CREATE TABLE private.support_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,case_id uuid NOT NULL REFERENCES private.support_cases(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT, kind text NOT NULL,
 reason text NOT NULL CHECK(length(reason)<=500),revision bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.support_callbacks (
 event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 200),provider_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('email.sent','email.delivered','email.bounced','email.failed','email.delivery_delayed','email.received')),
 occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.support_rate (actor_id uuid NOT NULL,minute timestamptz NOT NULL,count integer NOT NULL,PRIMARY KEY(actor_id,minute));
ALTER TABLE private.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.support_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.support_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.support_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.support_cases,private.support_messages,private.support_events,private.support_callbacks,private.support_rate FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_support_queue(p_status text DEFAULT NULL,p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.support_require();
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR (p_status IS NOT NULL AND p_status NOT IN ('new','in_progress','waiting_user','waiting_fix','closed')) THEN RAISE EXCEPTION USING errcode='22023',message='invalid_support_filter'; END IF;
 RETURN jsonb_build_object('schema_version',1,'generated_at',now(),'source','Banco Nello · atendimento privado','can_write',EXISTS(SELECT 1 FROM private.admin_operators WHERE user_id=auth.uid() AND revoked_at IS NULL AND role IN ('owner','operator')),
 'page',p_page,'page_size',20,'total',(SELECT count(*) FROM private.support_cases WHERE p_status IS NULL OR status=p_status),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY updated_at DESC,id) FROM (SELECT id,subject,contact_email,status,category,module,issue_id,revision,received_at,updated_at,first_reply_at,reopen_count FROM private.support_cases WHERE p_status IS NULL OR status=p_status ORDER BY updated_at DESC,id LIMIT 20 OFFSET (p_page-1)*20) q),'[]'::jsonb),
 'metrics',jsonb_build_object('open',(SELECT count(*) FROM private.support_cases WHERE status<>'closed'),'unknown_sends',(SELECT count(*) FROM private.support_messages WHERE state='unknown' OR (state='sending' AND lease_at<now()-interval '2 minutes')),
 'first_reply_p50_hours',(SELECT percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM(first_reply_at-received_at))/3600) FROM private.support_cases WHERE first_reply_at>=received_at AND received_at>=now()-interval '30 days'),
 'first_reply_sample',(SELECT count(*) FROM private.support_cases WHERE first_reply_at>=received_at AND received_at>=now()-interval '30 days')));
END $$;
CREATE FUNCTION public.admin_support_case(p_id uuid,p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_case private.support_cases; v_messages jsonb;
BEGIN
 PERFORM private.support_require();
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_message_page'; END IF;
 SELECT * INTO v_case FROM private.support_cases WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='support_case_not_found'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY created_at,id),'[]'::jsonb) INTO v_messages FROM
 (SELECT id,direction,body,partial,attachments,(direction='outgoing' AND state='queued' AND actor_id=auth.uid()) AS can_send,CASE WHEN state='sending' AND lease_at<now()-interval '2 minutes' THEN 'unknown' ELSE state END AS state,created_at,occurred_at,accepted_at FROM private.support_messages WHERE case_id=p_id ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET (p_page-1)*30) q;
 RETURN jsonb_build_object('schema_version',1,'generated_at',now(),'source','Banco Nello · conteúdo privado','can_write',EXISTS(SELECT 1 FROM private.admin_operators WHERE user_id=auth.uid() AND revoked_at IS NULL AND role IN ('owner','operator')),'item',to_jsonb(v_case),'messages',v_messages,
 'page',p_page,'has_more',(SELECT count(*) FROM private.support_messages WHERE case_id=p_id)>p_page*30,
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY id DESC) FROM (SELECT id,kind,reason,revision,created_at FROM private.support_events WHERE case_id=p_id ORDER BY id DESC LIMIT 30)e),'[]'::jsonb));
END $$;
CREATE FUNCTION public.admin_support_create(p_subject text,p_email text,p_nonce uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids text[]; h text; c uuid;
BEGIN
 PERFORM private.support_require(true);
 IF length(btrim(coalesce(p_subject,''))) NOT BETWEEN 1 AND 200 OR p_email IS NULL OR length(p_email)>254 OR p_email !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' THEN RAISE EXCEPTION USING errcode='22023',message='invalid_support_contact'; END IF;
 h:=md5(jsonb_build_array(btrim(p_subject),lower(p_email))::text); ids:=private.wave09_receipt(p_nonce,'support:create',h);
 IF ids IS NOT NULL THEN RETURN jsonb_build_object('success',true,'id',ids[1],'replayed',true); END IF;
 INSERT INTO private.support_cases(subject,contact_email) VALUES(btrim(p_subject),lower(p_email)) RETURNING id INTO c;
 INSERT INTO private.support_events(case_id,actor_id,kind,reason,revision) VALUES(c,auth.uid(),'created','Caso criado manualmente; email não comprova identidade.',1);
 PERFORM private.wave09_receipt(p_nonce,'support:create',h,ARRAY[c::text]);
 RETURN jsonb_build_object('success',true,'id',c,'replayed',false);
END $$;
CREATE FUNCTION public.admin_support_update(p_id uuid,p_revision bigint,p_nonce uuid,p_status text,p_category text,p_module text,p_issue_id text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.support_cases; ids text[]; h text;
BEGIN
 PERFORM private.support_require(true);
 IF p_id IS NULL OR p_revision IS NULL OR p_status IS NULL OR p_status NOT IN ('new','in_progress','waiting_user','waiting_fix','closed') OR p_category IS NULL OR p_category NOT IN ('bug','friction','suggestion','guidance') OR p_module IS NULL OR p_module NOT IN ('meal_plan','chat','patients','auth','billing','other') OR (p_issue_id IS NOT NULL AND p_issue_id !~ '^[0-9]{1,30}$') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_support_update'; END IF;
 h:=md5(jsonb_build_array(p_id,p_revision,p_status,p_category,p_module,p_issue_id,btrim(p_reason))::text); ids:=private.wave09_receipt(p_nonce,'support:update',h);
 IF ids IS NOT NULL THEN RETURN jsonb_build_object('success',true,'revision',ids[1]::bigint,'replayed',true); END IF;
 SELECT * INTO c FROM private.support_cases WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='support_case_not_found'; END IF;
 IF c.revision<>p_revision THEN RAISE EXCEPTION USING errcode='PT409',message='support_case_changed'; END IF;
 UPDATE private.support_cases SET status=p_status,category=p_category,module=p_module,issue_id=p_issue_id,revision=revision+1,updated_at=clock_timestamp(),closed_at=CASE WHEN p_status='closed' THEN now() ELSE NULL END,reopen_count=reopen_count+CASE WHEN c.status='closed' AND p_status<>'closed' THEN 1 ELSE 0 END WHERE id=p_id RETURNING * INTO c;
 INSERT INTO private.support_events(case_id,actor_id,kind,reason,revision) VALUES(p_id,auth.uid(),'triaged',btrim(p_reason),c.revision);
 PERFORM private.wave09_receipt(p_nonce,'support:update',h,ARRAY[c.revision::text]);
 RETURN jsonb_build_object('success',true,'revision',c.revision,'replayed',false);
END $$;
CREATE FUNCTION public.admin_support_compose(p_id uuid,p_revision bigint,p_nonce uuid,p_body text,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.support_cases; ids text[]; h text; m uuid;
BEGIN
 PERFORM private.support_require(true);
 IF p_id IS NULL OR p_revision IS NULL OR p_kind IS NULL OR p_kind NOT IN ('note','outgoing') OR length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_support_message'; END IF;
 h:=md5(jsonb_build_array(p_id,p_revision,p_kind,p_body)::text);ids:=private.wave09_receipt(p_nonce,'support:compose',h);
 IF ids IS NOT NULL THEN RETURN jsonb_build_object('success',true,'id',ids[1],'replayed',true); END IF;
 SELECT * INTO c FROM private.support_cases WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='support_case_not_found'; END IF;
 IF c.revision<>p_revision THEN RAISE EXCEPTION USING errcode='PT409',message='support_case_changed'; END IF;
 IF p_kind='outgoing' AND EXISTS(SELECT 1 FROM private.support_messages WHERE case_id=p_id AND direction='outgoing' AND state IN ('queued','sending','unknown')) THEN RAISE EXCEPTION USING errcode='PT409',message='support_reply_pending_reconciliation'; END IF;
 INSERT INTO private.support_messages(case_id,direction,body,state,actor_id,nonce) VALUES(p_id,p_kind,p_body,CASE WHEN p_kind='note' THEN 'internal' ELSE 'queued' END,auth.uid(),p_nonce) RETURNING id INTO m;
 UPDATE private.support_cases SET revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO private.support_events(case_id,actor_id,kind,reason,revision) VALUES(p_id,auth.uid(),p_kind,CASE WHEN p_kind='note' THEN 'Nota interna registrada; não enviada.' ELSE 'Resposta preparada; ainda não enviada.' END,c.revision+1);
 PERFORM private.wave09_receipt(p_nonce,'support:compose',h,ARRAY[m::text]);
 RETURN jsonb_build_object('success',true,'id',m,'replayed',false);
END $$;
CREATE FUNCTION public.admin_support_claim(p_message uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.support_messages; c private.support_cases; n integer; l uuid:=gen_random_uuid();
BEGIN
 PERFORM private.support_require(true);
 DELETE FROM private.support_rate WHERE actor_id=auth.uid() AND minute<now()-interval '1 hour';
 INSERT INTO private.support_rate VALUES(auth.uid(),date_trunc('minute',now()),1) ON CONFLICT(actor_id,minute) DO UPDATE SET count=private.support_rate.count+1 RETURNING count INTO n;
 IF n>10 THEN RAISE EXCEPTION USING errcode='PT429',message='support_rate_limited'; END IF;
 SELECT * INTO m FROM private.support_messages WHERE id=p_message FOR UPDATE;
 IF NOT FOUND OR m.direction<>'outgoing' OR m.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING errcode='42501',message='support_send_denied'; END IF;
 IF m.state<>'queued' THEN RAISE EXCEPTION USING errcode='PT409',message='support_send_already_attempted'; END IF;
 SELECT * INTO c FROM private.support_cases WHERE id=m.case_id;
 UPDATE private.support_messages SET state='sending',lease=l,lease_at=clock_timestamp() WHERE id=p_message;
 RETURN jsonb_build_object('id',m.id,'lease',l,'to',c.contact_email,'subject',c.subject,'body',m.body,'idempotency_key','nello-support-'||m.id::text);
END $$;
CREATE FUNCTION public.support_delivery_record(p_message uuid,p_lease uuid,p_state text,p_provider uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.support_messages; callback_row record;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('sent','failed','unknown') OR (p_state='sent' AND p_provider IS NULL) THEN RAISE EXCEPTION USING errcode='22023',message='invalid_delivery_record'; END IF;
 SELECT * INTO m FROM private.support_messages WHERE id=p_message FOR UPDATE;
 IF NOT FOUND OR m.state<>'sending' OR m.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION USING errcode='PT409',message='delivery_lease_changed'; END IF;
 UPDATE private.support_messages SET state=p_state,provider_id=p_provider,accepted_at=CASE WHEN p_state='sent' THEN now() END WHERE id=p_message;
 IF p_state='sent' THEN
  UPDATE private.support_cases SET first_reply_at=coalesce(first_reply_at,now()),updated_at=clock_timestamp(),revision=revision+1 WHERE id=m.case_id;
  FOR callback_row IN SELECT * FROM private.support_callbacks WHERE provider_id=p_provider ORDER BY occurred_at,event_id LOOP
   PERFORM public.support_callback(callback_row.event_id,callback_row.provider_id,callback_row.kind,callback_row.occurred_at);
  END LOOP;
 END IF;
 RETURN jsonb_build_object('success',true,'state',p_state);
END $$;
CREATE FUNCTION public.support_receive(p_provider uuid,p_from text,p_subject text,p_body text,p_occurred timestamptz,p_message_id text,p_attachments jsonb,p_partial boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid; m uuid;
BEGIN
 IF p_provider IS NULL OR p_occurred IS NULL OR NOT isfinite(p_occurred) OR p_occurred>now()+interval '5 minutes' OR p_from IS NULL OR p_from !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' OR length(p_from)>254 OR length(coalesce(p_subject,'')) NOT BETWEEN 1 AND 200 OR p_body IS NULL OR length(p_body)>20000 OR p_partial IS NULL OR jsonb_typeof(p_attachments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_attachments)>20 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_received_email'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('support:receive:'||p_provider::text,0));
 SELECT case_id INTO c FROM private.support_messages WHERE provider_id=p_provider;
 IF FOUND THEN RETURN jsonb_build_object('success',true,'id',c,'replayed',true); END IF;
 INSERT INTO private.support_cases(subject,contact_email,received_at) VALUES(p_subject,lower(p_from),p_occurred) RETURNING id INTO c;
 INSERT INTO private.support_messages(case_id,direction,body,partial,provider_id,provider_message_id,attachments,state,occurred_at) VALUES(c,'incoming',p_body,p_partial,p_provider,left(p_message_id,998),p_attachments,'received',p_occurred) RETURNING id INTO m;
 INSERT INTO private.support_events(case_id,kind,reason,revision) VALUES(c,'received','Recebido pelo provedor; remetente não vinculado automaticamente a uma conta.',1);
 RETURN jsonb_build_object('success',true,'id',c,'replayed',false);
END $$;
CREATE FUNCTION public.support_callback(p_event text,p_provider uuid,p_kind text,p_occurred timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.support_messages; next_state text;
BEGIN
 IF p_event IS NULL OR length(p_event) NOT BETWEEN 1 AND 200 OR p_provider IS NULL OR p_kind IS NULL OR p_kind NOT IN ('email.sent','email.delivered','email.bounced','email.failed','email.delivery_delayed','email.received') OR p_occurred IS NULL OR NOT isfinite(p_occurred) OR p_occurred>now()+interval '5 minutes' THEN RAISE EXCEPTION USING errcode='22023',message='invalid_support_callback'; END IF;
 INSERT INTO private.support_callbacks(event_id,provider_id,kind,occurred_at) VALUES(p_event,p_provider,p_kind,p_occurred) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM private.support_callbacks WHERE event_id=p_event AND provider_id=p_provider AND kind=p_kind AND occurred_at=p_occurred) THEN RAISE EXCEPTION USING errcode='22023',message='callback_identity_reused'; END IF;
 SELECT * INTO m FROM private.support_messages WHERE provider_id=p_provider AND direction='outgoing' FOR UPDATE;
 IF FOUND AND (m.provider_event_at IS NULL OR p_occurred>m.provider_event_at OR (p_occurred=m.provider_event_at AND p_kind IN ('email.delivered','email.bounced','email.failed'))) THEN
  next_state:=CASE p_kind WHEN 'email.delivered' THEN 'delivered' WHEN 'email.bounced' THEN 'bounced' WHEN 'email.failed' THEN 'failed' ELSE m.state END;
  IF m.state NOT IN ('delivered','bounced','failed') OR next_state IN ('bounced','failed') THEN UPDATE private.support_messages SET state=next_state,provider_event_at=p_occurred WHERE id=m.id; END IF;
 END IF;
 RETURN jsonb_build_object('success',true);
END $$;
CREATE FUNCTION public.support_callback_seen(p_event text,p_provider uuid,p_kind text,p_occurred timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM private.support_callbacks WHERE event_id=p_event) THEN
  IF NOT EXISTS(SELECT 1 FROM private.support_callbacks WHERE event_id=p_event AND provider_id=p_provider AND kind=p_kind AND occurred_at=p_occurred) THEN RAISE EXCEPTION USING errcode='22023',message='callback_identity_reused'; END IF;
  RETURN true;
 END IF;
 RETURN false;
END $$;
CREATE FUNCTION public.support_delivery_observed(p_provider uuid,p_state text,p_message_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.support_messages;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('sent','delivered','bounced','failed') THEN RAISE EXCEPTION USING errcode='22023',message='invalid_observed_delivery'; END IF;
 SELECT * INTO m FROM private.support_messages WHERE provider_id=p_provider AND direction='outgoing' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='outgoing_source_not_found'; END IF;
 -- Observation time is not the provider's delivery-event time.
 IF m.state NOT IN ('delivered','bounced','failed') OR p_state IN ('bounced','failed') THEN UPDATE private.support_messages SET state=p_state,provider_message_id=left(p_message_id,998) WHERE id=m.id RETURNING * INTO m; END IF;
 RETURN jsonb_build_object('success',true,'state',m.state,'checked_at',now());
END $$;
CREATE FUNCTION public.admin_support_message_source(p_message uuid,p_attachment uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.support_messages; attachment jsonb;
BEGIN
 PERFORM private.support_require();
 SELECT * INTO m FROM private.support_messages WHERE id=p_message;
 IF NOT FOUND OR m.direction='note' OR m.provider_id IS NULL THEN RAISE EXCEPTION USING errcode='P0002',message='provider_source_unavailable'; END IF;
 IF p_attachment IS NOT NULL THEN
  SELECT value INTO attachment FROM jsonb_array_elements(m.attachments) WHERE value->>'id'=p_attachment::text;
  IF attachment IS NULL OR m.direction<>'incoming' THEN RAISE EXCEPTION USING errcode='P0002',message='attachment_not_found'; END IF;
 END IF;
 RETURN jsonb_build_object('provider_id',m.provider_id,'direction',m.direction,'state',m.state,'attachment',attachment);
END $$;
-- Grant only enumerated APIs. Private tables are never exposed through REST.
REVOKE ALL ON FUNCTION public.admin_support_queue(text,integer),public.admin_support_case(uuid,integer),public.admin_support_create(text,text,uuid),public.admin_support_update(uuid,bigint,uuid,text,text,text,text,text),public.admin_support_compose(uuid,bigint,uuid,text,text),public.admin_support_claim(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_support_queue(text,integer),public.admin_support_case(uuid,integer),public.admin_support_create(text,text,uuid),public.admin_support_update(uuid,bigint,uuid,text,text,text,text,text),public.admin_support_compose(uuid,bigint,uuid,text,text),public.admin_support_claim(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.support_delivery_record(uuid,uuid,text,uuid),public.support_receive(uuid,text,text,text,timestamptz,text,jsonb,boolean),public.support_callback(text,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_delivery_record(uuid,uuid,text,uuid),public.support_receive(uuid,text,text,text,timestamptz,text,jsonb,boolean),public.support_callback(text,uuid,text,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.support_callback_seen(text,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_callback_seen(text,uuid,text,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.support_delivery_observed(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_delivery_observed(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_support_message_source(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_support_message_source(uuid,uuid) TO authenticated;
COMMIT;

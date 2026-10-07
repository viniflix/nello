-- Additive operational intelligence. No clinical data or account access is changed.
BEGIN;
CREATE FUNCTION private.intelligence_require(p_write boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.wave05_require_active_actor();
 IF NOT private.admin_action_allowed(CASE WHEN p_write THEN 'triage' ELSE 'read' END) THEN
  RAISE EXCEPTION USING errcode='42501',message='intelligence_admin_required';
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.intelligence_require(boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.valid_intelligence_record(k text,p jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE key text; allowed text[]; required text[];
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR length(p::text)>6000
 OR p::text ~* '(Bearer[[:space:]]+|whsec_[a-z0-9+/=]{16,}|phx_[a-z0-9_]{16,}|re_[a-z0-9_]{16,}|eyJ[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\.)' THEN RETURN false; END IF;
 IF k='decision' THEN
  allowed:=ARRAY['title','evidence','action','expected','review_on','outcome','result'];
  required:=ARRAY['title','evidence','action','expected','review_on','outcome','result'];
 ELSIF k='change' THEN
  allowed:=ARRAY['title','detail','module','change_kind','release','occurred_at'];required:=allowed;
 ELSIF k='feature' THEN
  allowed:=ARRAY['title','feature_key','module','stage','scope','rationale','review_on'];required:=allowed;
 ELSIF k='capacity' THEN
  allowed:=ARRAY['provider','resource','unit','used','limit','cost','currency','source_note','period_start','period_end','measured_on'];
  required:=ARRAY['provider','resource','unit','currency','source_note','period_start','period_end','measured_on'];
 ELSE RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) f WHERE f<>ALL(allowed)) OR NOT p ?& allowed THEN RETURN false; END IF;
 FOREACH key IN ARRAY required LOOP
  IF jsonb_typeof(p->key) IS DISTINCT FROM 'string' OR length(p->>key)>1000 THEN RETURN false; END IF;
 END LOOP;
 IF k='decision' THEN
  RETURN coalesce(length(btrim(p->>'title')) BETWEEN 1 AND 140
   AND length(btrim(p->>'evidence')) BETWEEN 10 AND 1000 AND length(btrim(p->>'action')) BETWEEN 10 AND 1000
   AND length(btrim(p->>'expected')) BETWEEN 10 AND 500 AND p->>'review_on' ~ '^\d{4}-\d{2}-\d{2}$'
   AND (p->>'review_on')::date IS NOT NULL AND p->>'outcome' IN ('planned','improved','worse','unchanged','inconclusive')
   AND (p->>'outcome'='planned' OR length(btrim(p->>'result')) BETWEEN 10 AND 1000),false);
 ELSIF k='change' THEN
  RETURN coalesce(length(btrim(p->>'title')) BETWEEN 1 AND 140 AND length(btrim(p->>'detail')) BETWEEN 10 AND 1000
   AND p->>'module' IN ('auth','meal_plan','chat','patients','billing','analytics','infrastructure','other')
   AND p->>'change_kind' IN ('release','configuration','incident')
   AND (p->>'release'='' OR p->>'release' ~ '^[a-f0-9]{40}$')
   AND p->>'occurred_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' AND length(p->>'occurred_at')<=35
   AND (p->>'occurred_at')::timestamptz<=now()+interval '5 minutes',false);
 ELSIF k='feature' THEN
  RETURN coalesce(length(btrim(p->>'title')) BETWEEN 1 AND 140 AND p->>'feature_key' ~ '^[a-z][a-z0-9_.-]{1,79}$'
   AND p->>'module' IN ('auth','meal_plan','chat','patients','billing','analytics','infrastructure','other')
   AND p->>'stage' IN ('evaluation','beta','active','deprecated','retired')
   AND length(btrim(p->>'scope')) BETWEEN 10 AND 500 AND length(btrim(p->>'rationale')) BETWEEN 10 AND 1000
   AND p->>'review_on' ~ '^\d{4}-\d{2}-\d{2}$' AND (p->>'review_on')::date IS NOT NULL,false);
 ELSE
  RETURN coalesce(p->>'provider' IN ('Supabase','Sentry','PostHog','Resend','Vercel','Other')
   AND length(btrim(p->>'resource')) BETWEEN 1 AND 80 AND length(btrim(p->>'unit')) BETWEEN 1 AND 40
   AND jsonb_typeof(p->'used')='number' AND (p->>'used')::numeric BETWEEN 0 AND 1000000000000000
   AND (jsonb_typeof(p->'limit')='null' OR (jsonb_typeof(p->'limit')='number' AND (p->>'limit')::numeric BETWEEN 0 AND 1000000000000000))
   AND (jsonb_typeof(p->'cost')='null' OR (jsonb_typeof(p->'cost')='number' AND (p->>'cost')::numeric BETWEEN 0 AND 1000000000000000))
   AND p->>'currency' IN ('BRL','USD') AND length(btrim(p->>'source_note')) BETWEEN 10 AND 500
   AND p->>'period_start' ~ '^\d{4}-\d{2}-\d{2}$' AND p->>'period_end' ~ '^\d{4}-\d{2}-\d{2}$'
   AND p->>'measured_on' ~ '^\d{4}-\d{2}-\d{2}$'
   AND (p->>'period_start')::date<=(p->>'measured_on')::date AND (p->>'measured_on')::date<=(p->>'period_end')::date
   AND (p->>'measured_on')::date<=(now() AT TIME ZONE 'America/Fortaleza')::date,false);
 END IF;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_intelligence_record(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE private.admin_intelligence_records (
 id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('decision','change','capacity','feature')),
 payload jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 CHECK(private.valid_intelligence_record(kind,payload))
);
CREATE UNIQUE INDEX intelligence_feature_key ON private.admin_intelligence_records((payload->>'feature_key')) WHERE kind='feature';
CREATE INDEX intelligence_records_kind_time ON private.admin_intelligence_records(kind,updated_at DESC,id);
CREATE TABLE private.admin_intelligence_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 record_id uuid NOT NULL REFERENCES private.admin_intelligence_records(id) ON DELETE RESTRICT,
 revision bigint NOT NULL, payload jsonb NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(record_id,revision)
);
CREATE TABLE private.admin_intelligence_signals (
 key text PRIMARY KEY CHECK(key IN ('privacy_overdue','support_unknown','review_due','incident_investigation')),
 active boolean NOT NULL, value bigint NOT NULL CHECK(value>=0),episode bigint NOT NULL,
 revision bigint NOT NULL DEFAULT 1,changed_at timestamptz NOT NULL DEFAULT now(),evaluated_at timestamptz NOT NULL DEFAULT now(),
 muted_until timestamptz
);
CREATE TABLE private.admin_intelligence_signal_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 signal_key text NOT NULL REFERENCES private.admin_intelligence_signals(key) ON DELETE RESTRICT,
 episode bigint NOT NULL,revision bigint NOT NULL,kind text NOT NULL CHECK(kind IN ('condition','mute','unmute')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),muted_until timestamptz,
 actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(signal_key,revision)
);
ALTER TABLE private.admin_intelligence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.admin_intelligence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.admin_intelligence_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.admin_intelligence_signal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_intelligence_records,private.admin_intelligence_events,private.admin_intelligence_signals,private.admin_intelligence_signal_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_intelligence_save(p_kind text,p_id uuid,p_revision bigint,p_nonce uuid,p_payload jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.admin_intelligence_records; ids text[]; h text;
BEGIN
 PERFORM private.intelligence_require(true);
 IF p_id IS NULL OR p_revision IS NULL OR p_revision<0 OR NOT private.valid_intelligence_record(p_kind,p_payload)
 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_intelligence_record'; END IF;
 h:=md5(jsonb_build_array(p_kind,p_id,p_revision,p_payload,btrim(p_reason))::text);
 ids:=private.wave09_receipt(p_nonce,'admin-intelligence:save',h);
 IF ids IS NOT NULL THEN RETURN jsonb_build_object('success',true,'id',ids[1],'revision',ids[2]::bigint,'replayed',true); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-intelligence:'||p_id,0));
 SELECT * INTO r FROM private.admin_intelligence_records WHERE id=p_id FOR UPDATE;
 IF (NOT FOUND AND p_revision<>0) OR (r.id IS NOT NULL AND (r.revision<>p_revision OR r.kind<>p_kind)) THEN
  RAISE EXCEPTION USING errcode='PT409',message='intelligence_record_changed';
 END IF;
 INSERT INTO private.admin_intelligence_records(id,kind,payload,actor_id) VALUES(p_id,p_kind,p_payload,auth.uid())
 ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=private.admin_intelligence_records.revision+1,
 updated_at=clock_timestamp(),actor_id=auth.uid() RETURNING * INTO r;
 INSERT INTO private.admin_intelligence_events(record_id,revision,payload,reason,actor_id) VALUES(r.id,r.revision,r.payload,btrim(p_reason),auth.uid());
 PERFORM private.wave09_receipt(p_nonce,'admin-intelligence:save',h,ARRAY[r.id::text,r.revision::text]);
 RETURN jsonb_build_object('success',true,'id',r.id,'revision',r.revision,'replayed',false);
END $$;

CREATE FUNCTION public.admin_intelligence_overview(p_kind text DEFAULT 'decision',p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb; support jsonb; product jsonb; keys text[]:=ARRAY['privacy_overdue','support_unknown','review_due','incident_investigation'];
 values_ bigint[]; i integer; s private.admin_intelligence_signals; current_active boolean;
BEGIN
 PERFORM private.intelligence_require();
 IF p_kind IS NULL OR p_kind NOT IN ('decision','change','capacity','feature') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN
  RAISE EXCEPTION USING errcode='22023',message='invalid_intelligence_page';
 END IF;
 -- System-owned condition cache: reading cannot submit a severity or any clinical mutation.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-intelligence:conditions',0));
 b:=public.admin_operational_briefing();support:=public.admin_support_queue(NULL,1)->'metrics';product:=public.admin_product_analytics(30);
 values_:=ARRAY[(SELECT (q->>'overdue')::bigint FROM jsonb_array_elements(b->'queues') q WHERE q->>'key'='privacy'),(support->>'unknown_sends')::bigint,
  (SELECT count(*) FROM private.admin_intelligence_records WHERE kind='decision' AND payload->>'outcome'='planned' AND (payload->>'review_on')::date<(now() AT TIME ZONE 'America/Fortaleza')::date),
  (SELECT (q->>'count')::bigint FROM jsonb_array_elements(b->'queues') q WHERE q->>'key'='incidents')];
 IF EXISTS(SELECT 1 FROM unnest(values_) v WHERE v IS NULL OR v<0) THEN RAISE EXCEPTION USING errcode='22023',message='invalid_intelligence_sources';END IF;
 FOR i IN 1..4 LOOP
  current_active:=values_[i]>0;
  SELECT * INTO s FROM private.admin_intelligence_signals WHERE key=keys[i] FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO private.admin_intelligence_signals(key,active,value,episode) VALUES(keys[i],current_active,values_[i],CASE WHEN current_active THEN 1 ELSE 0 END) RETURNING * INTO s;
   INSERT INTO private.admin_intelligence_signal_events(signal_key,episode,revision,kind,reason) VALUES(s.key,s.episode,s.revision,'condition','Primeira avaliação da regra intelligence-v1.');
  ELSIF s.active IS DISTINCT FROM current_active THEN
   UPDATE private.admin_intelligence_signals SET active=current_active,value=values_[i],episode=episode+CASE WHEN current_active THEN 1 ELSE 0 END,
   revision=revision+1,changed_at=clock_timestamp(),evaluated_at=clock_timestamp(),muted_until=NULL WHERE key=s.key RETURNING * INTO s;
   INSERT INTO private.admin_intelligence_signal_events(signal_key,episode,revision,kind,reason) VALUES(s.key,s.episode,s.revision,'condition',CASE WHEN current_active THEN 'Condição observada novamente; silêncio anterior removido.' ELSE 'Condição deixou de ser observada; não comprova causa ou correção técnica.' END);
  ELSE
   UPDATE private.admin_intelligence_signals SET value=values_[i],evaluated_at=clock_timestamp() WHERE key=s.key;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'definition_version','intelligence-v1','source','Supabase · regras operacionais e registros privados',
 'generated_at',clock_timestamp(),'data_through',clock_timestamp(),'can_write',private.admin_action_allowed('triage'),
 'briefing',b,'support',support,'product',product,'kind',p_kind,'page',p_page,'page_size',20,
 'total',(SELECT count(*) FROM private.admin_intelligence_records WHERE kind=p_kind),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY updated_at DESC,id) FROM (SELECT id,kind,payload,revision,created_at,updated_at FROM private.admin_intelligence_records WHERE kind=p_kind ORDER BY updated_at DESC,id LIMIT 20 OFFSET (p_page-1)*20) q),'[]'::jsonb),
 'signals',(SELECT jsonb_agg(to_jsonb(t) ORDER BY key) FROM private.admin_intelligence_signals t),
 'signal_events',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY id DESC) FROM (SELECT id,signal_key,episode,revision,kind,reason,muted_until,created_at FROM private.admin_intelligence_signal_events ORDER BY id DESC LIMIT 30) q),'[]'::jsonb));
END $$;

CREATE FUNCTION public.admin_intelligence_history(p_id uuid,p_page integer DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.intelligence_require();
 IF p_id IS NULL OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_intelligence_history'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.admin_intelligence_records WHERE id=p_id) THEN RAISE EXCEPTION USING errcode='P0002',message='intelligence_record_not_found'; END IF;
 RETURN jsonb_build_object('schema_version',1,'generated_at',now(),'source','Supabase · revisões administrativas', 'page',p_page,
 'total',(SELECT count(*) FROM private.admin_intelligence_events WHERE record_id=p_id),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY revision DESC) FROM (SELECT id,record_id,revision,payload,reason,created_at FROM private.admin_intelligence_events WHERE record_id=p_id ORDER BY revision DESC LIMIT 20 OFFSET (p_page-1)*20) q),'[]'::jsonb));
END $$;

CREATE FUNCTION public.admin_intelligence_mute(p_key text,p_revision bigint,p_hours integer,p_nonce uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.admin_intelligence_signals; ids text[]; h text;
BEGIN
 PERFORM private.intelligence_require(true);
 IF p_key IS NULL OR p_key NOT IN ('privacy_overdue','support_unknown','review_due','incident_investigation') OR p_revision IS NULL OR p_revision<1
 OR p_hours IS NULL OR p_hours NOT IN (0,1,6,24) OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION USING errcode='22023',message='invalid_intelligence_mute';
 END IF;
 h:=md5(jsonb_build_array(p_key,p_revision,p_hours,btrim(p_reason))::text);ids:=private.wave09_receipt(p_nonce,'admin-intelligence:mute',h);
 IF ids IS NOT NULL THEN RETURN jsonb_build_object('success',true,'revision',ids[1]::bigint,'replayed',true); END IF;
 SELECT * INTO s FROM private.admin_intelligence_signals WHERE key=p_key FOR UPDATE;
 IF NOT FOUND OR s.revision<>p_revision THEN RAISE EXCEPTION USING errcode='PT409',message='intelligence_signal_changed'; END IF;
 IF NOT s.active AND p_hours>0 THEN RAISE EXCEPTION USING errcode='22023',message='intelligence_signal_inactive'; END IF;
 UPDATE private.admin_intelligence_signals SET muted_until=CASE WHEN p_hours=0 THEN NULL ELSE clock_timestamp()+make_interval(hours=>p_hours) END,
 revision=revision+1 WHERE key=p_key RETURNING * INTO s;
 INSERT INTO private.admin_intelligence_signal_events(signal_key,episode,revision,kind,reason,actor_id,muted_until) VALUES(s.key,s.episode,s.revision,CASE WHEN p_hours=0 THEN 'unmute' ELSE 'mute' END,btrim(p_reason),auth.uid(),s.muted_until);
 PERFORM private.wave09_receipt(p_nonce,'admin-intelligence:mute',h,ARRAY[s.revision::text]);
 RETURN jsonb_build_object('success',true,'revision',s.revision,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.admin_intelligence_save(text,uuid,bigint,uuid,jsonb,text),public.admin_intelligence_overview(text,integer),public.admin_intelligence_history(uuid,integer),public.admin_intelligence_mute(text,bigint,integer,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_intelligence_save(text,uuid,bigint,uuid,jsonb,text),public.admin_intelligence_overview(text,integer),public.admin_intelligence_history(uuid,integer),public.admin_intelligence_mute(text,bigint,integer,uuid,text) TO authenticated;
COMMIT;

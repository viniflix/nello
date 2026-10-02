-- Forward-only: existing messages, files and clinical records are preserved.
BEGIN;
CREATE TABLE private.realtime_inboxes (
 actor_id uuid PRIMARY KEY,
 channel_id uuid NOT NULL UNIQUE DEFAULT extensions.gen_random_uuid()
);
CREATE TABLE private.chat_presence_leases (
 actor_id uuid NOT NULL,
 session_id uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 typing_recipient uuid,
 typing_until timestamptz,
 PRIMARY KEY(actor_id,session_id)
);
CREATE INDEX chat_presence_expiry ON private.chat_presence_leases(expires_at);
CREATE INDEX chat_presence_live ON private.chat_presence_leases(actor_id,expires_at);
ALTER TABLE private.realtime_inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.chat_presence_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.realtime_inboxes,private.chat_presence_leases FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.realtime_inbox_topic(p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inbox uuid;
BEGIN
 INSERT INTO private.realtime_inboxes(actor_id) SELECT id FROM public.user_profiles WHERE id=p_actor ON CONFLICT DO NOTHING;
 SELECT channel_id INTO inbox FROM private.realtime_inboxes WHERE actor_id=p_actor;
 RETURN CASE WHEN inbox IS NOT NULL THEN 'inbox:'||inbox::text END;
END$$;
REVOKE ALL ON FUNCTION private.realtime_inbox_topic(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.can_receive_realtime() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM private.realtime_inboxes
  WHERE actor_id=auth.uid() AND 'inbox:'||channel_id::text=realtime.topic())
$$;
REVOKE ALL ON FUNCTION private.can_receive_realtime() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_receive_realtime() TO authenticated;
-- A client may receive its inbox, but may never publish Broadcast/Presence.
CREATE POLICY wave08_private_inbox_receive ON realtime.messages FOR SELECT TO authenticated
 USING(extension='broadcast' AND private.can_receive_realtime());
CREATE POLICY wave08_private_inbox_boundary ON realtime.messages AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(extension='broadcast' AND private.can_receive_realtime()) WITH CHECK(false);

CREATE FUNCTION private.signal_realtime(p_actor uuid,p_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE topic text;
BEGIN
 IF p_kind NOT IN ('chat','notifications','presence','profile','clinical','access') THEN RAISE EXCEPTION 'invalid_realtime_signal'; END IF;
 topic:=private.realtime_inbox_topic(p_actor);
 IF topic IS NOT NULL THEN
  PERFORM realtime.send(jsonb_build_object('kind',p_kind),'changed',topic,true);
 END IF;
END$$;
REVOKE ALL ON FUNCTION private.signal_realtime(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_realtime_inbox(p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authentication_required'; END IF;
 RETURN private.realtime_inbox_topic(auth.uid());
END$$;
REVOKE ALL ON FUNCTION public.get_realtime_inbox(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_realtime_inbox(uuid) TO authenticated;

CREATE FUNCTION private.chat_presence_snapshot(p_actor uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,
  'online_until',(SELECT max(expires_at) FROM private.chat_presence_leases l WHERE l.actor_id=p.id AND l.expires_at>now()),
  'typing_until',(SELECT max(typing_until) FROM private.chat_presence_leases l WHERE l.actor_id=p.id AND l.expires_at>now() AND l.typing_recipient=p_actor AND l.typing_until>now()),
  'online',EXISTS(SELECT 1 FROM private.chat_presence_leases l WHERE l.actor_id=p.id AND l.expires_at>now()),
  'typing',EXISTS(SELECT 1 FROM private.chat_presence_leases l WHERE l.actor_id=p.id AND l.expires_at>now() AND l.typing_recipient=p_actor AND l.typing_until>now()))),'[]'::jsonb)
 FROM public.user_profiles p WHERE p.id<>p_actor AND private.wave05_chat_relationship(p_actor,p.id)
$$;
REVOKE ALL ON FUNCTION private.chat_presence_snapshot(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.get_chat_presence(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 RETURN private.chat_presence_snapshot(auth.uid());
END$$;
REVOKE ALL ON FUNCTION public.get_chat_presence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_chat_presence(uuid) TO authenticated;

CREATE FUNCTION public.update_chat_presence(p_session uuid,p_recipient uuid DEFAULT NULL,p_typing boolean DEFAULT false,p_online boolean DEFAULT true,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); previous_recipient uuid; previous_typing boolean; peer uuid;
BEGIN
 IF p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 IF p_session IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='session_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('presence:'||actor::text,0));
 IF p_recipient IS NOT NULL AND NOT private.wave05_chat_relationship(actor,p_recipient) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='relationship_inactive';
 END IF;
 SELECT typing_recipient,typing_until>now() INTO previous_recipient,previous_typing
 FROM private.chat_presence_leases WHERE actor_id=actor AND session_id=p_session;
 DELETE FROM private.chat_presence_leases WHERE expires_at<now();
 IF p_online IS TRUE THEN
  IF NOT EXISTS(SELECT 1 FROM private.chat_presence_leases WHERE actor_id=actor AND session_id=p_session)
   AND (SELECT count(*) FROM private.chat_presence_leases WHERE actor_id=actor)>=10 THEN
   RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='presence_session_limit';
  END IF;
  INSERT INTO private.chat_presence_leases(actor_id,session_id,expires_at,typing_recipient,typing_until)
   VALUES(actor,p_session,now()+interval '75 seconds',CASE WHEN p_typing IS TRUE THEN p_recipient END,
    CASE WHEN p_typing IS TRUE AND p_recipient IS NOT NULL THEN now()+interval '5 seconds' END)
  ON CONFLICT(actor_id,session_id) DO UPDATE SET expires_at=excluded.expires_at,
   typing_recipient=excluded.typing_recipient,typing_until=excluded.typing_until;
  UPDATE public.user_profiles SET last_seen_at=now() WHERE id=actor AND (last_seen_at IS NULL OR last_seen_at<now()-interval '60 seconds');
 ELSE DELETE FROM private.chat_presence_leases WHERE actor_id=actor AND session_id=p_session;
 END IF;
 IF true THEN
  FOR peer IN SELECT p.id FROM public.user_profiles p WHERE p.id<>actor AND private.wave05_chat_relationship(actor,p.id)
  LOOP PERFORM private.signal_realtime(peer,'presence'); END LOOP;
 END IF;
 IF previous_recipient IS NOT NULL AND private.wave05_chat_relationship(actor,previous_recipient)
  AND (previous_recipient IS DISTINCT FROM p_recipient OR previous_typing IS DISTINCT FROM p_typing OR p_online IS NOT TRUE) THEN
  PERFORM private.signal_realtime(previous_recipient,'presence');
 END IF;
 IF p_recipient IS NOT NULL AND p_typing IS TRUE THEN PERFORM private.signal_realtime(p_recipient,'presence'); END IF;
 RETURN private.chat_presence_snapshot(actor);
END$$;
REVOKE ALL ON FUNCTION public.update_chat_presence(uuid,uuid,boolean,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_chat_presence(uuid,uuid,boolean,boolean,uuid) TO authenticated;

ALTER TABLE public.chats ADD COLUMN client_message_id uuid;
CREATE UNIQUE INDEX wave08_chat_idempotency ON public.chats(from_id,client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX wave08_chat_cursor ON public.chats(from_id,to_id,created_at DESC,id DESC);
CREATE FUNCTION public.send_chat_message(p_recipient uuid,p_message text,p_type text DEFAULT 'text',p_media text DEFAULT NULL,p_client_id uuid DEFAULT NULL,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); sent public.chats%rowtype; locked uuid;
BEGIN
 IF p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 IF p_client_id IS NULL OR p_recipient IS NULL OR p_recipient=actor OR p_type IS NULL
  OR p_type NOT IN ('text','image','audio','video','pdf') OR p_message IS NULL OR octet_length(p_message)>16000
  OR (p_type='text' AND (length(btrim(p_message))=0 OR p_media IS NOT NULL))
  OR (p_type<>'text' AND (p_media IS NULL OR length(p_media)>512)) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_chat_message';
 END IF;
 -- Serialize membership changes against this operation; sender is never input.
 SELECT np.patient_id INTO locked FROM public.nutritionist_patients np
  JOIN public.care_episodes e ON e.patient_id=np.patient_id AND e.nutritionist_id=np.nutritionist_id AND e.status='active'
  WHERE np.status='active' AND ((np.patient_id=actor AND np.nutritionist_id=p_recipient) OR (np.nutritionist_id=actor AND np.patient_id=p_recipient))
  LIMIT 1 FOR SHARE OF np,e;
 IF locked IS NULL OR NOT private.wave05_chat_relationship(actor,p_recipient) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='relationship_inactive';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_client_id::text,0));
 SELECT * INTO sent FROM public.chats WHERE from_id=actor AND client_message_id=p_client_id;
 IF FOUND THEN
  IF sent.to_id<>p_recipient OR sent.message<>p_message OR sent.message_type<>p_type OR sent.media_url IS DISTINCT FROM p_media THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='idempotency_key_reused';
  END IF;
 ELSE
  INSERT INTO public.chats(from_id,to_id,message,message_type,media_url,client_message_id)
   VALUES(actor,p_recipient,p_message,p_type,p_media,p_client_id) RETURNING * INTO sent;
 END IF;
 RETURN to_jsonb(sent)||jsonb_build_object('id',sent.id::text);
END$$;
REVOKE ALL ON FUNCTION public.send_chat_message(uuid,text,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid,text,text,text,uuid,uuid) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.chats FROM anon,authenticated;

CREATE FUNCTION public.list_chat_messages(p_recipient uuid,p_before_time timestamptz DEFAULT NULL,p_before_id bigint DEFAULT NULL,p_limit integer DEFAULT 50,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); rows jsonb; more boolean;
BEGIN
 IF p_actor IS DISTINCT FROM actor THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 IF actor IS NULL OR p_recipient IS NULL OR p_recipient=actor OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
  OR (p_before_time IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_chat_cursor';
 END IF;
 WITH page AS (
  SELECT c.* FROM public.chats c WHERE ((c.from_id=actor AND c.to_id=p_recipient) OR (c.to_id=actor AND c.from_id=p_recipient))
   AND (p_before_time IS NULL OR (coalesce(c.created_at,'epoch'::timestamptz),c.id)<(p_before_time,p_before_id))
  ORDER BY c.created_at DESC NULLS LAST,c.id DESC LIMIT p_limit+1
 ), numbered AS (SELECT page.*,row_number() OVER(ORDER BY created_at DESC NULLS LAST,id DESC) rn FROM page)
 SELECT coalesce(jsonb_agg((to_jsonb(n)-'rn')||jsonb_build_object('id',n.id::text,'created_at',coalesce(n.created_at,'epoch'::timestamptz)) ORDER BY n.created_at DESC NULLS LAST,n.id DESC) FILTER(WHERE rn<=p_limit),'[]'::jsonb),
  coalesce(bool_or(rn>p_limit),false) INTO rows,more FROM numbered n;
 RETURN jsonb_build_object('messages',rows,'has_more',more);
END$$;
REVOKE ALL ON FUNCTION public.list_chat_messages(uuid,timestamptz,bigint,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_chat_messages(uuid,timestamptz,bigint,integer,uuid) TO authenticated;

CREATE FUNCTION public.mark_chat_read(p_recipient uuid,p_through_id bigint,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); cutoff timestamptz;
BEGIN
 IF p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 SELECT created_at INTO cutoff FROM public.chats WHERE id=p_through_id
  AND ((from_id=actor AND to_id=p_recipient) OR (from_id=p_recipient AND to_id=actor));
 IF cutoff IS NULL THEN RETURN; END IF;
 UPDATE public.notifications SET is_read=true WHERE user_id=actor AND type='new_message'
  AND content->>'from_id'=p_recipient::text AND created_at<=cutoff AND is_read IS DISTINCT FROM true;
END$$;
REVOKE ALL ON FUNCTION public.mark_chat_read(uuid,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid,bigint,uuid) TO authenticated;

CREATE FUNCTION public.mutate_own_notifications(p_ids bigint[],p_remove boolean DEFAULT false,p_actor uuid DEFAULT NULL) RETURNS bigint[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); ids bigint[];
BEGIN
 IF p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 IF p_ids IS NULL OR cardinality(p_ids)>500 OR array_position(p_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_notification_selection'; END IF;
 SELECT array_agg(DISTINCT id) INTO ids FROM unnest(p_ids) id;
 PERFORM 1 FROM public.notifications WHERE id=ANY(ids) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE id=ANY(ids) AND user_id<>actor) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='notification_not_available'; END IF;
 IF p_remove IS TRUE THEN DELETE FROM public.notifications WHERE id=ANY(ids) AND user_id=actor;
 ELSE UPDATE public.notifications SET is_read=true WHERE id=ANY(ids) AND user_id=actor AND is_read IS DISTINCT FROM true; END IF;
 RETURN coalesce(ids,'{}'::bigint[]);
END$$;
REVOKE ALL ON FUNCTION public.mutate_own_notifications(bigint[],boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_own_notifications(bigint[],boolean,uuid) TO authenticated;

CREATE FUNCTION public.mark_all_notifications_read(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_actor IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='session_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 UPDATE public.notifications SET is_read=true WHERE user_id=auth.uid() AND is_read IS DISTINCT FROM true;
END$$;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(uuid) TO authenticated;

CREATE FUNCTION private.wave08_signal_changes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; patient uuid; professional uuid;
BEGIN
 IF TG_TABLE_NAME='chats' THEN
  PERFORM private.signal_realtime((row_data->>'from_id')::uuid,'chat');
  PERFORM private.signal_realtime((row_data->>'to_id')::uuid,'chat');
 ELSIF TG_TABLE_NAME='notifications' THEN PERFORM private.signal_realtime((row_data->>'user_id')::uuid,'notifications');
 ELSIF TG_TABLE_NAME='user_profiles' THEN
  IF TG_OP='DELETE' THEN
   DELETE FROM private.chat_presence_leases WHERE actor_id=OLD.id OR typing_recipient=OLD.id;
   DELETE FROM private.realtime_inboxes WHERE actor_id=OLD.id;
   RETURN OLD;
  END IF;
  IF TG_OP<>'UPDATE' OR (to_jsonb(OLD)-'last_seen_at'-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'last_seen_at'-'updated_at') THEN
   PERFORM private.signal_realtime((row_data->>'id')::uuid,'profile');
  END IF;
  IF TG_OP='UPDATE' AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
   FOR professional IN SELECT id FROM public.user_profiles p WHERE private.wave05_chat_relationship(OLD.id,p.id) OR p.id=OLD.id
    OR p.id IN(SELECT nutritionist_id FROM public.care_episodes WHERE patient_id=OLD.id)
    OR p.id IN(SELECT patient_id FROM public.care_episodes WHERE nutritionist_id=OLD.id)
   LOOP PERFORM private.signal_realtime(professional,'access'); END LOOP;
  END IF;
 ELSE
  IF TG_OP='UPDATE' AND TG_TABLE_NAME IN('care_episodes','nutritionist_patients') THEN
   PERFORM private.signal_realtime((to_jsonb(OLD)->>'patient_id')::uuid,'access');
   PERFORM private.signal_realtime((to_jsonb(OLD)->>'nutritionist_id')::uuid,'access');
  END IF;
  patient:=(row_data->>'patient_id')::uuid;
  IF patient IS NOT NULL THEN
   PERFORM private.signal_realtime(patient,CASE WHEN TG_TABLE_NAME IN('care_episodes','nutritionist_patients') THEN 'access' ELSE 'clinical' END);
   FOR professional IN SELECT DISTINCT nutritionist_id FROM public.care_episodes WHERE patient_id=patient
    AND (status='active' OR id::text=row_data->>'care_episode_id' OR id::text=row_data->>'id')
   LOOP PERFORM private.signal_realtime(professional,CASE WHEN TG_TABLE_NAME IN('care_episodes','nutritionist_patients') THEN 'access' ELSE 'clinical' END); END LOOP;
   professional:=(row_data->>'nutritionist_id')::uuid;
   IF professional IS NOT NULL THEN PERFORM private.signal_realtime(professional,CASE WHEN TG_TABLE_NAME IN('care_episodes','nutritionist_patients') THEN 'access' ELSE 'clinical' END); END IF;
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END$$;
REVOKE ALL ON FUNCTION private.wave08_signal_changes() FROM PUBLIC,anon,authenticated;
DO $$DECLARE relation text; BEGIN
 FOR relation IN SELECT DISTINCT table_name FROM information_schema.columns
  WHERE table_schema='public' AND (column_name='patient_id' OR table_name IN('chats','notifications','user_profiles'))
   AND table_name IN(SELECT tablename FROM pg_tables WHERE schemaname='public')
 LOOP EXECUTE format('CREATE TRIGGER wave08_realtime_signal AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.wave08_signal_changes()',relation); END LOOP;
END$$;
COMMIT;

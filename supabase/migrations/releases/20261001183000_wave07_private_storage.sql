-- Forward-only Storage release. No clinical object or history is deleted.
BEGIN;

CREATE TABLE private.storage_upload_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text NOT NULL,
 object_path text NOT NULL,
 actor_id uuid REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 tenant_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 patient_id uuid REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 care_episode_id uuid REFERENCES public.care_episodes(id) ON DELETE RESTRICT,
 quota_key text NOT NULL,
 chat_recipient_id uuid REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 mime_type text NOT NULL,
 expected_size bigint NOT NULL CHECK(expected_size BETWEEN 1 AND 20971520),
 verified_size bigint CHECK(verified_size BETWEEN 1 AND 20971520),
 sha256 text CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 source_sha256 text CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','processing','confirmed','failed','deleting','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 verified_at timestamptz,
 bound_at timestamptz,
 deleted_at timestamptz,
 failure_code text CHECK(failure_code ~ '^[a-z_]{1,64}$'),
 UNIQUE(bucket_id,object_path),
 CHECK(status <> 'confirmed' OR (sha256 IS NOT NULL AND source_sha256 IS NOT NULL AND verified_size IS NOT NULL AND verified_at IS NOT NULL))
);
ALTER TABLE private.storage_upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.storage_upload_reservations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON private.storage_upload_reservations TO service_role;
CREATE INDEX storage_upload_actor_quota ON private.storage_upload_reservations(quota_key,created_at);
CREATE INDEX storage_upload_tenant_quota ON private.storage_upload_reservations(tenant_id,created_at);
CREATE INDEX storage_upload_cleanup ON private.storage_upload_reservations(status,expires_at);

CREATE FUNCTION private.storage_upload_scope(p_bucket text,p_path text,p_recipient uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor uuid:=auth.uid(); target uuid; tenant uuid; record_id uuid; episode uuid; patient uuid; allowed boolean:=false;
 uuid_pattern text:='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
BEGIN
 IF p_path IS NULL OR length(p_path)>512 OR p_path ~ '[[:cntrl:]%?#\\]' OR p_path ~ '(^|/)[.]{1,2}(/|$)' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_object_path';
 END IF;
 IF actor IS NOT NULL AND NOT private.wave05_active_actor() THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='actor_not_authorized';
 END IF;
 IF p_bucket='anamnesis-attachments' THEN
  allowed:=private.can_access_anamnesis_attachment_object(p_path,true);
  IF split_part(p_path,'/',1)='public' THEN
   allowed:=allowed AND p_token IS NOT NULL AND split_part(p_path,'/',2)=p_token::text;
  ELSE allowed:=allowed AND actor IS NOT NULL; END IF;
  IF allowed THEN
   record_id:=split_part(p_path,'/',3)::uuid;
   SELECT r.nutritionist_id INTO tenant FROM public.anamnesis_records r
    JOIN public.care_episodes e ON e.id=r.care_episode_id AND e.patient_id=r.patient_id
    JOIN public.user_profiles u ON u.id=r.nutritionist_id
    WHERE r.id=record_id AND e.status='active' AND e.nutritionist_id=r.nutritionist_id AND u.is_active IS DISTINCT FROM false;
   allowed:=tenant IS NOT NULL;
  END IF;
 ELSIF actor IS NULL THEN allowed:=false;
 ELSIF p_bucket IN ('avatars','financial-docs','chat_media','lab-results-pdfs') THEN
  IF p_path !~ ('^'||uuid_pattern||'/'||uuid_pattern||'[.](jpg|png|webp|pdf|mp3|wav|ogg|webm|m4a|mp4|mov)$') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_object_path';
  END IF;
  target:=split_part(p_path,'/',1)::uuid;
  IF p_bucket='avatars' THEN
   IF EXISTS(SELECT 1 FROM public.data_subject_requests d WHERE d.subject_id=target AND d.request_type='deletion'
    AND d.status='in_progress' AND d.retention_decision='delete_non_clinical') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account_erasure_in_progress';
   END IF;
   allowed:=target=actor OR EXISTS(SELECT 1 FROM public.care_episodes e
    WHERE e.patient_id=target AND e.status='active' AND private.can_write_active_care_episode(e.id));
   SELECT e.nutritionist_id INTO tenant FROM public.care_episodes e WHERE e.patient_id=target AND e.status='active';
   tenant:=coalesce(tenant,actor);
  ELSIF p_bucket='financial-docs' THEN
   allowed:=target=actor AND EXISTS(SELECT 1 FROM public.user_profiles u WHERE u.id=actor AND u.user_type IN ('nutritionist','admin'));
   tenant:=actor;
  ELSIF p_bucket='chat_media' THEN
   allowed:=target=actor AND p_recipient IS NOT NULL AND private.wave05_chat_relationship(actor,p_recipient);
   SELECT e.nutritionist_id INTO tenant FROM public.care_episodes e
    WHERE e.status='active' AND ((e.patient_id=actor AND e.nutritionist_id=p_recipient) OR (e.patient_id=p_recipient AND e.nutritionist_id=actor));
   tenant:=coalesce(tenant,actor);
  ELSE
   SELECT e.nutritionist_id INTO tenant FROM public.care_episodes e
    WHERE e.patient_id=target AND e.status='active' AND (actor=target OR private.can_write_active_care_episode(e.id));
   allowed:=tenant IS NOT NULL;
  END IF;
 ELSIF p_bucket='patient-photos' THEN
  allowed:=p_path ~ ('^'||uuid_pattern||'/'||uuid_pattern||'/(progress_photos/'||uuid_pattern||'|anthropometry/'||uuid_pattern||'/'||uuid_pattern||')[.](jpg|png|webp)$')
   AND private.can_upload_patient_photo_object(p_path);
  IF allowed THEN SELECT e.nutritionist_id INTO tenant FROM public.care_episodes e WHERE e.id=split_part(p_path,'/',2)::uuid; END IF;
 ELSIF p_bucket='clinical-attachments' THEN
  allowed:=private.can_upload_clinical_attachment_object(p_bucket,p_path);
  IF allowed THEN SELECT e.nutritionist_id INTO tenant FROM public.clinical_attachments a JOIN public.care_episodes e ON e.id=a.care_episode_id WHERE a.storage_path=p_path; END IF;
 ELSIF p_bucket='document-assets' THEN
  allowed:=private.can_upload_document_asset_object(p_bucket,p_path); tenant:=actor;
 END IF;
 IF allowed IS DISTINCT FROM true OR tenant IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='upload_scope_forbidden'; END IF;
 IF p_bucket='lab-results-pdfs' THEN
  SELECT e.id,e.patient_id INTO episode,patient FROM public.care_episodes e WHERE e.patient_id=target AND e.status='active' AND e.nutritionist_id=tenant;
 ELSIF p_bucket='patient-photos' THEN episode:=split_part(p_path,'/',2)::uuid; patient:=split_part(p_path,'/',1)::uuid;
 ELSIF p_bucket='clinical-attachments' THEN SELECT a.care_episode_id,a.patient_id INTO episode,patient FROM public.clinical_attachments a WHERE a.storage_path=p_path;
 ELSIF p_bucket='anamnesis-attachments' THEN SELECT r.care_episode_id,r.patient_id INTO episode,patient FROM public.anamnesis_records r WHERE r.id=record_id;
 ELSIF p_bucket='chat_media' THEN SELECT e.id,e.patient_id INTO episode,patient FROM public.care_episodes e WHERE e.nutritionist_id=tenant AND e.status='active' AND e.patient_id IN (actor,p_recipient);
 END IF;
 RETURN jsonb_build_object('actor_id',actor,'tenant_id',tenant,'patient_id',patient,'care_episode_id',episode,'quota_key',
  CASE WHEN actor IS NOT NULL THEN actor::text ELSE encode(extensions.digest(p_token::text,'sha256'),'hex') END);
END$$;
REVOKE ALL ON FUNCTION private.storage_upload_scope(text,text,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reserve_storage_upload(p_bucket text,p_path text,p_mime text,p_size bigint,p_chat_recipient uuid DEFAULT NULL,p_public_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope jsonb; reservation private.storage_upload_reservations%rowtype; max_size bigint; extension text; used bigint; uploads bigint;
BEGIN
 scope:=private.storage_upload_scope(p_bucket,p_path,p_chat_recipient,p_public_token);
 max_size:=CASE p_bucket WHEN 'chat_media' THEN 20971520 WHEN 'clinical-attachments' THEN 15728640
  WHEN 'avatars' THEN 5242880 WHEN 'patient-photos' THEN 5242880 WHEN 'document-assets' THEN 5242880 ELSE 10485760 END;
 IF p_size IS NULL OR p_size<1 OR p_size>max_size THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='upload_size_exceeded'; END IF;
 extension:=CASE p_mime WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp'
  WHEN 'application/pdf' THEN 'pdf' WHEN 'audio/mpeg' THEN 'mp3' WHEN 'audio/wav' THEN 'wav'
  WHEN 'audio/ogg' THEN 'ogg' WHEN 'audio/webm' THEN 'webm' WHEN 'audio/mp4' THEN 'm4a'
  WHEN 'video/mp4' THEN 'mp4' WHEN 'video/webm' THEN 'webm' WHEN 'video/quicktime' THEN 'mov' END;
 IF extension IS NULL OR (p_bucket<>'chat_media' AND p_mime NOT IN ('image/jpeg','image/png','image/webp','application/pdf'))
  OR (p_bucket IN ('avatars','patient-photos','document-assets') AND p_mime='application/pdf')
  OR (p_bucket='lab-results-pdfs' AND p_mime<>'application/pdf')
  OR (p_bucket NOT IN ('clinical-attachments','document-assets') AND p_path NOT LIKE '%.'||extension) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported_upload_type';
 END IF;
 -- Serialize both counters: concurrent requests cannot overbook actor/tenant.
 PERFORM pg_advisory_xact_lock(hashtextextended('storage-tenant:'||(scope->>'tenant_id'),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('storage-actor:'||(scope->>'quota_key'),0));
 SELECT * INTO reservation FROM private.storage_upload_reservations WHERE bucket_id=p_bucket AND object_path=p_path FOR UPDATE;
 IF FOUND THEN
  IF reservation.quota_key=scope->>'quota_key' AND reservation.mime_type=p_mime AND reservation.expected_size=p_size
   AND reservation.chat_recipient_id IS NOT DISTINCT FROM p_chat_recipient AND reservation.status IN ('reserved','confirmed') AND reservation.expires_at>now() THEN
   RETURN jsonb_build_object('id',reservation.id,'bucket',reservation.bucket_id,'path',reservation.object_path,'status',reservation.status);
  END IF;
  RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='object_path_already_reserved';
 END IF;
 IF EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=p_bucket AND o.name=p_path) THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='object_overwrite_forbidden'; END IF;
 SELECT count(*),coalesce(sum(greatest(expected_size,coalesce(verified_size,0))),0) INTO uploads,used FROM private.storage_upload_reservations WHERE quota_key=scope->>'quota_key' AND created_at>now()-interval '24 hours';
 IF uploads>=80 OR used+p_size>209715200 OR (auth.uid() IS NULL AND uploads>=20) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='actor_upload_quota_exceeded'; END IF;
 SELECT count(*),coalesce(sum(greatest(expected_size,coalesce(verified_size,0))),0) INTO uploads,used FROM private.storage_upload_reservations WHERE tenant_id=(scope->>'tenant_id')::uuid AND created_at>now()-interval '24 hours';
 IF uploads>=500 OR used+p_size>1073741824 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='tenant_upload_quota_exceeded'; END IF;
 INSERT INTO private.storage_upload_reservations(bucket_id,object_path,actor_id,tenant_id,patient_id,care_episode_id,quota_key,chat_recipient_id,mime_type,expected_size)
 VALUES(p_bucket,p_path,(scope->>'actor_id')::uuid,(scope->>'tenant_id')::uuid,(scope->>'patient_id')::uuid,(scope->>'care_episode_id')::uuid,scope->>'quota_key',p_chat_recipient,p_mime,p_size) RETURNING * INTO reservation;
 RETURN jsonb_build_object('id',reservation.id,'bucket',reservation.bucket_id,'path',reservation.object_path,'status',reservation.status);
END$$;
REVOKE ALL ON FUNCTION public.reserve_storage_upload(text,text,text,bigint,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_storage_upload(text,text,text,bigint,uuid,uuid) TO anon,authenticated;

-- Freeze legacy object/episode bindings BEFORE accepting new client references.
-- A new clinician cannot mint access by inserting the URI of an old report into
-- a new record for the same patient. Unknown/orphaned objects stay private.
CREATE TABLE private.storage_legacy_episode_access (
 bucket_id text NOT NULL,object_path text NOT NULL,
 care_episode_id uuid NOT NULL REFERENCES public.care_episodes(id) ON DELETE RESTRICT,
 PRIMARY KEY(bucket_id,object_path,care_episode_id)
);
ALTER TABLE private.storage_legacy_episode_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.storage_legacy_episode_access FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.storage_legacy_episode_access TO service_role;
INSERT INTO private.storage_legacy_episode_access(bucket_id,object_path,care_episode_id)
SELECT DISTINCT o.bucket_id,o.name,r.care_episode_id FROM storage.objects o
 JOIN public.lab_results r ON split_part(o.name,'/',1)=r.patient_id::text
  AND (r.pdf_url=o.name OR split_part(split_part(r.pdf_url,'/lab-results-pdfs/',2),'?',1)=o.name)
 WHERE o.bucket_id='lab-results-pdfs' AND r.care_episode_id IS NOT NULL
UNION
SELECT o.bucket_id,o.name,p.care_episode_id FROM storage.objects o JOIN public.progress_photos p ON p.storage_path=o.name
 WHERE o.bucket_id='patient-photos' AND p.care_episode_id IS NOT NULL
UNION
SELECT o.bucket_id,o.name,e.id FROM storage.objects o JOIN public.care_episodes e
 ON split_part(o.name,'/',1)=e.patient_id::text AND split_part(o.name,'/',2)=e.id::text
 WHERE o.bucket_id='patient-photos' AND split_part(o.name,'/',3)='anthropometry';

CREATE FUNCTION public.claim_storage_upload(p_reservation_id uuid,p_public_token uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reservation private.storage_upload_reservations%rowtype; scope jsonb;
BEGIN
 SELECT * INTO reservation FROM private.storage_upload_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='upload_not_found'; END IF;
 scope:=private.storage_upload_scope(reservation.bucket_id,reservation.object_path,reservation.chat_recipient_id,p_public_token);
 IF reservation.quota_key IS DISTINCT FROM scope->>'quota_key' OR reservation.actor_id IS DISTINCT FROM auth.uid()
  OR reservation.care_episode_id IS DISTINCT FROM (scope->>'care_episode_id')::uuid
  OR reservation.tenant_id IS DISTINCT FROM (scope->>'tenant_id')::uuid THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='upload_not_found';
 END IF;
 IF reservation.status='confirmed' THEN
  RETURN jsonb_build_object('id',reservation.id,'bucket',reservation.bucket_id,'path',reservation.object_path,'status','confirmed','sha256',reservation.sha256,'size',reservation.verified_size,'mime',reservation.mime_type);
 END IF;
 IF reservation.status<>'reserved' OR reservation.expires_at<=now() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='upload_not_pending'; END IF;
 UPDATE private.storage_upload_reservations SET status='processing' WHERE id=reservation.id;
 RETURN jsonb_build_object('id',reservation.id,'bucket',reservation.bucket_id,'path',reservation.object_path,'status','processing','size',reservation.expected_size,'mime',reservation.mime_type,'actor_id',reservation.actor_id);
END$$;
REVOKE ALL ON FUNCTION public.claim_storage_upload(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_storage_upload(uuid,uuid) TO anon,authenticated;

CREATE FUNCTION public.finish_storage_upload(p_reservation_id uuid,p_sha256 text,p_source_sha256 text,p_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reservation private.storage_upload_reservations%rowtype; metadata jsonb; max_size bigint; used bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_upload_verification_required'; END IF;
 SELECT * INTO reservation FROM private.storage_upload_reservations WHERE id=p_reservation_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='upload_not_pending'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('storage-tenant:'||reservation.tenant_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('storage-actor:'||reservation.quota_key,0));
 SELECT * INTO reservation FROM private.storage_upload_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR reservation.status<>'processing' OR reservation.expires_at<=now() THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='upload_not_pending'; END IF;
 IF reservation.bucket_id='avatars' AND EXISTS(SELECT 1 FROM public.data_subject_requests d
  WHERE d.subject_id::text=split_part(reservation.object_path,'/',1) AND d.request_type='deletion'
   AND d.status='in_progress' AND d.retention_decision='delete_non_clinical') THEN RAISE EXCEPTION 'account_erasure_in_progress'; END IF;
 IF p_sha256 IS NULL OR p_source_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_source_sha256 !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_upload_hash';
 END IF;
 max_size:=CASE reservation.bucket_id WHEN 'chat_media' THEN 20971520 WHEN 'clinical-attachments' THEN 15728640
  WHEN 'avatars' THEN 5242880 WHEN 'patient-photos' THEN 5242880 WHEN 'document-assets' THEN 5242880 ELSE 10485760 END;
 SELECT o.metadata INTO metadata FROM storage.objects o WHERE o.bucket_id=reservation.bucket_id AND o.name=reservation.object_path;
 IF metadata IS NULL OR p_size IS NULL OR p_size<1 OR p_size>max_size
  OR metadata->>'size' !~ '^[0-9]+$' OR (metadata->>'size')::bigint IS DISTINCT FROM p_size
  OR metadata->>'mimetype' IS DISTINCT FROM reservation.mime_type THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified_object_metadata_mismatch'; END IF;
 SELECT coalesce(sum(greatest(expected_size,coalesce(verified_size,0))),0) INTO used FROM private.storage_upload_reservations
  WHERE tenant_id=reservation.tenant_id AND created_at>now()-interval '24 hours';
 IF used+greatest(0,p_size-reservation.expected_size)>1073741824 THEN RAISE EXCEPTION 'tenant_upload_quota_exceeded'; END IF;
 SELECT coalesce(sum(greatest(expected_size,coalesce(verified_size,0))),0) INTO used FROM private.storage_upload_reservations
  WHERE quota_key=reservation.quota_key AND created_at>now()-interval '24 hours';
 IF used+greatest(0,p_size-reservation.expected_size)>209715200 THEN RAISE EXCEPTION 'actor_upload_quota_exceeded'; END IF;
 UPDATE private.storage_upload_reservations SET status='confirmed',verified_size=p_size,sha256=p_sha256,source_sha256=p_source_sha256,verified_at=now() WHERE id=reservation.id;
 RETURN jsonb_build_object('id',reservation.id,'bucket',reservation.bucket_id,'path',reservation.object_path,'status','confirmed','sha256',p_sha256,'size',p_size,'mime',reservation.mime_type);
END$$;
REVOKE ALL ON FUNCTION public.finish_storage_upload(uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_storage_upload(uuid,text,text,bigint) TO service_role;

CREATE FUNCTION private.storage_object_readable(p_bucket text,p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); target uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM private.storage_erasure_work_items w WHERE w.bucket_id=p_bucket AND w.object_path=p_path) THEN RETURN false; END IF;
 IF actor IS NULL THEN
  RETURN p_bucket='anamnesis-attachments' AND private.can_access_anamnesis_attachment_object(p_path,false)
   AND EXISTS(SELECT 1 FROM public.anamnesis_records a,jsonb_array_elements(coalesce(a.attachments,'[]'::jsonb)) f
    WHERE a.id::text=split_part(p_path,'/',3) AND f->>'storage_path'=p_path)
   AND NOT EXISTS(SELECT 1 FROM private.storage_upload_reservations r WHERE r.bucket_id=p_bucket AND r.object_path=p_path AND r.status<>'confirmed');
 END IF;
 IF NOT private.wave05_active_actor() THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM private.storage_upload_reservations r WHERE r.bucket_id=p_bucket AND r.object_path=p_path AND r.status<>'confirmed') THEN RETURN false; END IF;
 IF p_bucket='clinical-attachments' THEN RETURN private.can_read_clinical_attachment_object(p_bucket,p_path);
 ELSIF p_bucket='document-assets' THEN RETURN private.can_read_document_asset_object(p_bucket,p_path);
 ELSIF p_bucket='anamnesis-attachments' THEN RETURN private.can_access_anamnesis_attachment_object(p_path,false)
  AND EXISTS(SELECT 1 FROM public.anamnesis_records a,jsonb_array_elements(coalesce(a.attachments,'[]'::jsonb)) f
   WHERE a.id::text=split_part(p_path,'/',3) AND f->>'storage_path'=p_path);
 ELSIF p_bucket='financial-docs' THEN RETURN split_part(p_path,'/',1)=actor::text;
 ELSIF p_bucket='chat_media' THEN
  RETURN split_part(p_path,'/',1)=actor::text OR EXISTS(SELECT 1 FROM public.chats c
   WHERE c.from_id::text=split_part(p_path,'/',1) AND actor IN (c.from_id,c.to_id)
    AND (c.media_url=p_path OR c.media_url='storage:chat_media/'||p_path
     OR split_part(split_part(c.media_url,'/chat_media/',2),'?',1)=p_path));
 ELSIF p_bucket IN ('lab-results-pdfs','patient-photos') THEN
  IF p_bucket='patient-photos' AND EXISTS(SELECT 1 FROM public.progress_photos p WHERE p.storage_path=p_path AND p.status<>'active') THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM private.storage_legacy_episode_access a WHERE a.bucket_id=p_bucket AND a.object_path=p_path AND private.can_read_care_episode(a.care_episode_id))
   OR EXISTS(SELECT 1 FROM private.storage_upload_reservations r WHERE r.bucket_id=p_bucket AND r.object_path=p_path AND r.status='confirmed' AND private.can_read_care_episode(r.care_episode_id));
 ELSIF p_bucket='avatars' THEN
  IF split_part(p_path,'/',1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  target:=split_part(p_path,'/',1)::uuid;
  RETURN target=actor OR private.admin_member() OR EXISTS(SELECT 1 FROM public.care_episodes e
   WHERE ((e.patient_id=target AND actor IN (e.nutritionist_id,e.supervisor_id))
    OR (e.patient_id=actor AND target IN (e.nutritionist_id,e.supervisor_id))) AND private.can_read_care_episode(e.id));
 END IF;
 RETURN false;
END$$;
REVOKE ALL ON FUNCTION private.storage_object_readable(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.storage_object_readable(text,text) TO anon,authenticated,service_role;

-- Replace overlapping permissive policies, not just the most visible one.
DO $$DECLARE policy record;
BEGIN
 FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname<>'wave05_storage_active_actor' LOOP
  EXECUTE format('DROP POLICY %I ON storage.objects',policy.policyname);
 END LOOP;
END$$;
CREATE POLICY wave07_private_object_read ON storage.objects FOR SELECT TO anon,authenticated
 USING(private.storage_object_readable(bucket_id,name));
-- No client INSERT, UPDATE, or DELETE. Only the validated Edge writer and the
-- narrowly scoped maintenance worker operate on actual object bytes.
UPDATE storage.buckets SET public=false,updated_at=now()
 WHERE id IN ('avatars','financial-docs','chat_media','lab-results-pdfs','patient-photos','clinical-attachments','document-assets','anamnesis-attachments','IDV','brand-archive');
UPDATE storage.buckets SET file_size_limit=10485760,allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','image/webp']
 WHERE id='financial-docs';
UPDATE storage.buckets SET file_size_limit=20971520,allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','image/webp','audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4','video/mp4','video/webm','video/quicktime']
 WHERE id='chat_media';

CREATE FUNCTION private.storage_reference_path(p_value text,p_bucket text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF p_value IS NULL THEN RETURN NULL; END IF;
 IF p_value LIKE 'storage:'||p_bucket||'/%' THEN result:=substr(p_value,length(p_bucket)+10);
 ELSIF p_value LIKE p_bucket||'/%' THEN result:=substr(p_value,length(p_bucket)+2);
 ELSIF p_value LIKE 'http%/storage/v1/object/%/'||p_bucket||'/%' THEN
  result:=split_part(split_part(p_value,'/'||p_bucket||'/',2),'?',1);
 ELSIF p_value !~ '[:?#%]' AND p_value NOT LIKE '/%' THEN result:=p_value;
 END IF;
 IF result IS NULL OR result ~ '[[:cntrl:]%?#\\]' OR result ~ '(^|/)[.]{1,2}(/|$)' THEN RETURN NULL; END IF;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION private.storage_reference_path(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.bind_verified_storage_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE value text; previous text; path text; bucket text:=TG_ARGV[0];
 reservation private.storage_upload_reservations%rowtype; row_data jsonb:=to_jsonb(NEW); authorized boolean:=false;
BEGIN
 value:=row_data->>TG_ARGV[1];
 IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD)->>TG_ARGV[1]; IF value IS NOT DISTINCT FROM previous THEN RETURN NEW; END IF; END IF;
 IF value IS NULL OR value='' THEN RETURN NEW; END IF;
 -- Pre-existing external OAuth avatars are not Storage references. New file
 -- setters still go through the reserved writer; ordinary profile edits keep
 -- untouched legacy values intact.
 IF bucket='avatars' AND value ~ '^https://' AND value NOT LIKE '%/storage/v1/object/%' THEN
  IF auth.role()='service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='private_avatar_reference_required';
 END IF;
 path:=private.storage_reference_path(value,bucket);
 IF path IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_private_file_reference'; END IF;
 SELECT * INTO reservation FROM private.storage_upload_reservations WHERE bucket_id=bucket AND object_path=path FOR UPDATE;
 IF NOT FOUND THEN
  IF bucket IN ('lab-results-pdfs','patient-photos') AND EXISTS(SELECT 1 FROM private.storage_legacy_episode_access a
   WHERE a.bucket_id=bucket AND a.object_path=path AND a.care_episode_id=(row_data->>'care_episode_id')::uuid) THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='verified_upload_required';
 END IF;
 IF reservation.status<>'confirmed' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='verified_upload_required'; END IF;
 IF bucket='avatars' THEN authorized:=split_part(path,'/',1)=row_data->>'id';
 ELSIF bucket='financial-docs' THEN authorized:=reservation.actor_id=(row_data->>'nutritionist_id')::uuid;
 ELSIF bucket='chat_media' THEN authorized:=reservation.actor_id=(row_data->>'from_id')::uuid AND reservation.chat_recipient_id=(row_data->>'to_id')::uuid;
 ELSE authorized:=reservation.patient_id=(row_data->>'patient_id')::uuid AND reservation.care_episode_id=(row_data->>'care_episode_id')::uuid; END IF;
 IF authorized IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='file_reference_scope_forbidden'; END IF;
 UPDATE private.storage_upload_reservations SET bound_at=coalesce(bound_at,now()) WHERE id=reservation.id;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.bind_verified_storage_reference() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave07_verified_avatar BEFORE INSERT OR UPDATE OF avatar_url ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_reference('avatars','avatar_url');
CREATE TRIGGER wave07_verified_financial_file BEFORE INSERT OR UPDATE OF attachment_url ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_reference('financial-docs','attachment_url');
CREATE TRIGGER wave07_verified_financial_record_file BEFORE INSERT OR UPDATE OF attachment_url ON public.financial_records FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_reference('financial-docs','attachment_url');
CREATE TRIGGER wave07_verified_chat_file BEFORE INSERT OR UPDATE OF media_url ON public.chats FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_reference('chat_media','media_url');
CREATE TRIGGER wave07_verified_lab_file BEFORE INSERT OR UPDATE OF pdf_url ON public.lab_results FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_reference('lab-results-pdfs','pdf_url');
CREATE TRIGGER wave07_verified_progress_file BEFORE INSERT OR UPDATE OF storage_path ON public.progress_photos FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_reference('patient-photos','storage_path');

CREATE FUNCTION public.fail_storage_upload(p_reservation_id uuid,p_failure_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_upload_verification_required';
 END IF;
 IF p_failure_code NOT IN ('validation_or_upload_failed','cleanup_required') THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid_failure_code';
 END IF;
 UPDATE private.storage_upload_reservations SET status='failed',failure_code=p_failure_code
  WHERE id=p_reservation_id AND status IN ('processing','failed');
 RETURN FOUND;
END$$;
REVOKE ALL ON FUNCTION public.fail_storage_upload(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_storage_upload(uuid,text) TO service_role;

-- Only failed/expired unconfirmed objects are technical cleanup candidates.
-- Clinical retention decisions never enter this automatic queue.
CREATE FUNCTION public.claim_expired_storage_uploads(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,bucket_id text,object_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_storage_maintenance_required';
 END IF;
 RETURN QUERY WITH candidates AS (
  SELECT r.id FROM private.storage_upload_reservations r
   WHERE (r.status IN ('reserved','processing','failed') AND r.expires_at<now())
      OR (r.status='deleting' AND r.expires_at<now())
      OR (r.status='confirmed' AND r.bound_at IS NULL AND r.verified_at<now()-interval '6 hours')
   ORDER BY r.expires_at,r.id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,50),100))
 ) UPDATE private.storage_upload_reservations r SET status='deleting',expires_at=now()+interval '15 minutes'
   FROM candidates c WHERE r.id=c.id RETURNING r.id,r.bucket_id,r.object_path;
END$$;
REVOKE ALL ON FUNCTION public.claim_expired_storage_uploads(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_storage_uploads(integer) TO service_role;

CREATE FUNCTION public.finish_expired_storage_upload_cleanup(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_storage_maintenance_required';
 END IF;
 UPDATE private.storage_upload_reservations r SET status='deleted',deleted_at=now()
 WHERE r.id=p_reservation_id AND r.status='deleting'
   AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=r.bucket_id AND o.name=r.object_path);
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='cleanup_not_verified'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.finish_expired_storage_upload_cleanup(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_expired_storage_upload_cleanup(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_clinical_attachment_upload(p_attachment_id uuid, p_sha256 text, p_size_bytes bigint, p_mime_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_object_metadata jsonb;
  v_verified private.storage_upload_reservations%rowtype;
  v_object_size_text text;
  v_object_mime text;
  v_target_status text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;

  select a.* into v_attachment
  from public.clinical_attachments a
  where a.id=p_attachment_id
  for update;
  if not found then raise exception using errcode='P0002',message='upload_intent_not_found'; end if;
  if v_attachment.author_id<>v_actor then
    raise exception using errcode='42501',message='upload_confirmation_forbidden';
  end if;
  if v_attachment.status<>'uploading' or v_attachment.upload_confirmed_at is not null then
    raise exception 'upload_already_finalized';
  end if;
  if v_attachment.upload_expires_at<=now() then
    perform set_config('app.clinical_attachment_reason','upload_intent_expired',true);
    update public.clinical_attachments set status='upload_failed' where id=v_attachment.id;
    return jsonb_build_object('success',false,'code','upload_expired','attachment_id',v_attachment.id);
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_sha256';
  end if;
  if v_attachment.source='patient' then
    if not exists(
      select 1 from public.care_episodes e
      where e.id=v_attachment.care_episode_id and e.patient_id=v_actor and e.status='active'
    ) then raise exception using errcode='42501',message='upload_confirmation_forbidden'; end if;
  elsif not private.lock_and_can_write_active_care_episode(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='upload_confirmation_forbidden';
  end if;

  select o.metadata into v_object_metadata
  from storage.objects o
  where o.bucket_id=v_attachment.storage_bucket and o.name=v_attachment.storage_path;
  if not found then raise exception 'uploaded_object_not_found'; end if;

  select * into v_verified from private.storage_upload_reservations
   where bucket_id=v_attachment.storage_bucket and object_path=v_attachment.storage_path for update;
  if not found or v_verified.status<>'confirmed' or v_verified.actor_id is distinct from v_actor
    or v_verified.patient_id is distinct from v_attachment.patient_id
    or v_verified.care_episode_id is distinct from v_attachment.care_episode_id
    or v_verified.expected_size is distinct from v_attachment.size_bytes
    or v_verified.sha256 is distinct from p_sha256 then
   raise exception using errcode='42501',message='trusted_upload_verification_required';
  end if;
  v_object_size_text:=v_object_metadata->>'size';
  v_object_mime:=v_object_metadata->>'mimetype';
  if v_object_size_text is null or v_object_size_text !~ '^[0-9]+$'
    or v_object_size_text::bigint<>v_verified.verified_size
    or p_size_bytes is null or p_size_bytes<>v_verified.verified_size
    or v_object_mime is distinct from v_attachment.mime_type
    or p_mime_type is distinct from v_attachment.mime_type then
    raise exception 'upload_metadata_mismatch';
  end if;

  v_target_status:=case when v_attachment.source='patient' then 'pending_review' else 'active' end;
  perform set_config('app.clinical_attachment_reason','upload_confirmed',true);
  update public.clinical_attachments
  set sha256=v_verified.sha256,size_bytes=v_verified.verified_size,status=v_target_status,upload_confirmed_at=now()
  where id=v_attachment.id;

  update private.storage_upload_reservations set bound_at=coalesce(bound_at,now()) where id=v_verified.id;
  return jsonb_build_object(
    'success',true,'attachment_id',v_attachment.id,'status',v_target_status
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.confirm_document_asset_upload_verified(p_upload_id uuid, p_actor_id uuid, p_sha256 text, p_size_bytes bigint, p_mime_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_upload public.document_asset_uploads%rowtype;
  v_metadata jsonb;
  v_verified private.storage_upload_reservations%rowtype;
  v_created_identity_id uuid;
begin
 perform private.wave05_require_active_actor();

  if auth.role() is distinct from 'service_role' or p_actor_id is null then
    raise exception using errcode = '42501', message = 'trusted_document_confirmation_required';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_sha256';
  end if;

  select * into v_upload
  from public.document_asset_uploads
  where id = p_upload_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'document_asset_upload_not_found'; end if;
  if v_upload.professional_id is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'document_asset_confirmation_forbidden';
  end if;
  if v_upload.status <> 'uploading' then
    raise exception using errcode = '23514', message = 'document_asset_upload_already_finalized';
  end if;
  if v_upload.expires_at <= now() then
    update public.document_asset_uploads
    set status = 'expired', failure_code = 'upload_expired'
    where id = v_upload.id;
    return jsonb_build_object('success', false, 'code', 'upload_expired', 'upload_id', v_upload.id);
  end if;

  select metadata into v_metadata
  from storage.objects
  where bucket_id = v_upload.storage_bucket and name = v_upload.storage_path;
  if not found then raise exception using errcode = 'P0002', message = 'uploaded_document_asset_not_found'; end if;
  select * into v_verified from private.storage_upload_reservations
   where bucket_id=v_upload.storage_bucket and object_path=v_upload.storage_path for update;
  if not found or v_verified.status<>'confirmed' or v_verified.actor_id is distinct from p_actor_id
    or v_verified.expected_size is distinct from v_upload.size_bytes
    or v_verified.sha256 is distinct from p_sha256 then
   raise exception using errcode='42501',message='trusted_upload_verification_required';
  end if;
  if v_metadata->>'size' is null
     or (v_metadata->>'size')::bigint is distinct from v_verified.verified_size
     or v_metadata->>'mimetype' is distinct from v_upload.mime_type
     or p_size_bytes is distinct from v_verified.verified_size
     or p_mime_type is distinct from v_upload.mime_type then
    raise exception using errcode = '22023', message = 'document_asset_metadata_mismatch';
  end if;

  v_created_identity_id := private.version_document_identity_asset(
    p_actor_id, v_upload.identity_id, v_upload.asset_type, v_upload.storage_path,
    'document_' || v_upload.asset_type || '_updated'
  );

  update public.document_asset_uploads
  set status = 'confirmed', sha256 = v_verified.sha256, size_bytes=v_verified.verified_size, confirmed_at = now(),
      created_identity_id = v_created_identity_id
  where id = v_upload.id;

  update private.storage_upload_reservations set bound_at=coalesce(bound_at,now()) where id=v_verified.id;
  return jsonb_build_object(
    'success', true,
    'upload_id', v_upload.id,
    'asset_type', v_upload.asset_type,
    'identity_id', v_created_identity_id
  );
end;
$function$;

CREATE FUNCTION public.confirm_document_asset_storage_upload(p_upload_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE verified private.storage_upload_reservations%rowtype;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_document_confirmation_required';
 END IF;
 SELECT r.* INTO verified FROM private.storage_upload_reservations r
 JOIN public.document_asset_uploads u ON u.storage_bucket=r.bucket_id AND u.storage_path=r.object_path
 WHERE u.id=p_upload_id AND u.professional_id=p_actor_id AND r.actor_id=p_actor_id AND r.status='confirmed';
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_upload_verification_required'; END IF;
 RETURN public.confirm_document_asset_upload_verified(p_upload_id,p_actor_id,verified.sha256,verified.verified_size,verified.mime_type);
END$$;
REVOKE ALL ON FUNCTION public.confirm_document_asset_storage_upload(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_document_asset_storage_upload(uuid,uuid) TO service_role;

CREATE FUNCTION private.bind_verified_storage_array()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; previous jsonb:='[]'; values_json jsonb; path text; bucket text:=TG_ARGV[0];
 row_data jsonb:=to_jsonb(NEW); verified private.storage_upload_reservations%rowtype;
BEGIN
 values_json:=coalesce(nullif(row_data->TG_ARGV[1],'null'::jsonb),'[]'::jsonb);
 IF TG_OP='UPDATE' THEN previous:=coalesce(nullif(to_jsonb(OLD)->TG_ARGV[1],'null'::jsonb),'[]'::jsonb); END IF;
 IF values_json IS NOT DISTINCT FROM previous THEN RETURN NEW; END IF;
 IF bucket='anamnesis-attachments' AND row_data->>'status' NOT IN ('submitted','completed','validated') THEN
  FOR item IN SELECT value FROM jsonb_array_elements(previous) LOOP
   IF values_json @> jsonb_build_array(item) THEN CONTINUE; END IF;
   UPDATE private.storage_upload_reservations SET bound_at=NULL
    WHERE bucket_id=bucket AND object_path=item->>'storage_path' AND status='confirmed'
     AND split_part(object_path,'/',3)=row_data->>'id';
  END LOOP;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(values_json) LOOP
  IF previous @> jsonb_build_array(item) THEN CONTINUE; END IF;
  path:=private.storage_reference_path(CASE WHEN bucket='anamnesis-attachments' THEN item->>'storage_path' ELSE item#>>'{}' END,bucket);
  IF path IS NULL THEN RAISE EXCEPTION 'invalid_private_file_reference'; END IF;
  SELECT * INTO verified FROM private.storage_upload_reservations WHERE bucket_id=bucket AND object_path=path FOR UPDATE;
  IF NOT FOUND THEN
   IF bucket='patient-photos' AND EXISTS(SELECT 1 FROM private.storage_legacy_episode_access a
    WHERE a.bucket_id=bucket AND a.object_path=path AND a.care_episode_id=(row_data->>'care_episode_id')::uuid) THEN CONTINUE; END IF;
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='verified_upload_required';
  END IF;
  IF verified.status<>'confirmed' OR verified.patient_id IS DISTINCT FROM (row_data->>'patient_id')::uuid
   OR verified.care_episode_id IS DISTINCT FROM (row_data->>'care_episode_id')::uuid
   OR (bucket='anamnesis-attachments' AND split_part(path,'/',3) IS DISTINCT FROM row_data->>'id') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='file_reference_scope_forbidden';
  END IF;
  UPDATE private.storage_upload_reservations SET bound_at=coalesce(bound_at,now()) WHERE id=verified.id;
 END LOOP;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.bind_verified_storage_array() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave07_verified_anamnesis_file BEFORE INSERT OR UPDATE OF attachments ON public.anamnesis_records
 FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_array('anamnesis-attachments','attachments');
CREATE TRIGGER wave07_verified_anthropometry_file BEFORE INSERT OR UPDATE OF photos ON public.growth_records
 FOR EACH ROW EXECUTE FUNCTION private.bind_verified_storage_array('patient-photos','photos');

CREATE OR REPLACE FUNCTION public.confirm_clinical_attachment_replacement(p_attachment_id uuid, p_sha256 text, p_size_bytes bigint, p_mime_type text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_previous public.clinical_attachments%rowtype;
  v_metadata jsonb;
  v_verified private.storage_upload_reservations%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(coalesce(v_reason,''))<10 then
    raise exception using errcode='22023',message='attachment_replacement_reason_required';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_sha256';
  end if;
  select * into v_attachment from public.clinical_attachments where id=p_attachment_id for update;
  if not found or v_attachment.replaces_attachment_id is null then
    raise exception using errcode='P0002',message='replacement_intent_not_found';
  end if;
  if v_attachment.author_id<>v_actor or v_attachment.status<>'uploading'
    or v_attachment.upload_confirmed_at is not null or v_attachment.upload_expires_at<=now() then
    raise exception using errcode='42501',message='replacement_confirmation_forbidden';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_replacement_forbidden';
  end if;
  select * into v_previous from public.clinical_attachments
    where id=v_attachment.replaces_attachment_id for update;
  if v_previous.status<>'active' then
    raise exception using errcode='23514',message='replacement_source_not_active';
  end if;
  select metadata into v_metadata from storage.objects
    where bucket_id=v_attachment.storage_bucket and name=v_attachment.storage_path;
  if not found then raise exception 'uploaded_object_not_found'; end if;
  select * into v_verified from private.storage_upload_reservations
   where bucket_id=v_attachment.storage_bucket and object_path=v_attachment.storage_path for update;
  if not found or v_verified.status<>'confirmed' or v_verified.actor_id is distinct from v_actor
    or v_verified.patient_id is distinct from v_attachment.patient_id
    or v_verified.care_episode_id is distinct from v_attachment.care_episode_id
    or v_verified.expected_size is distinct from v_attachment.size_bytes
    or v_verified.sha256 is distinct from p_sha256 then
   raise exception using errcode='42501',message='trusted_upload_verification_required';
  end if;
  if false
    or (v_metadata->>'size')::bigint is distinct from v_verified.verified_size
    or v_metadata->>'mimetype' is distinct from v_attachment.mime_type
    or p_size_bytes is distinct from v_verified.verified_size
    or p_mime_type is distinct from v_attachment.mime_type then
    raise exception using errcode='22023',message='upload_metadata_mismatch';
  end if;

  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set sha256=v_verified.sha256,size_bytes=v_verified.verified_size,status='active',upload_confirmed_at=now()
    where id=v_attachment.id;
  update public.clinical_attachments set status='superseded' where id=v_previous.id;
  update private.storage_upload_reservations set bound_at=coalesce(bound_at,now()) where id=v_verified.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
    'replaced_attachment_id',v_previous.id,'status','active');
end
$function$;

-- LGPD applies only to an explicit administrative non-clinical decision.
-- Clinical/fiscal files remain under their existing legal retention workflow.
CREATE TABLE private.storage_erasure_work_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.data_subject_requests(id) ON DELETE RESTRICT,
 bucket_id text NOT NULL CHECK(bucket_id='avatars'), object_path text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','deleting','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(), leased_until timestamptz,
 deleted_at timestamptz, backup_retirement_sha256 text CHECK(backup_retirement_sha256 ~ '^[0-9a-f]{64}$'),
 UNIQUE(request_id,bucket_id,object_path)
);
ALTER TABLE private.storage_erasure_work_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.storage_erasure_work_items FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON private.storage_erasure_work_items TO service_role;

CREATE FUNCTION private.storage_erasure_request_boundary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.request_type<>'deletion' OR NEW.retention_decision IS DISTINCT FROM 'delete_non_clinical' THEN RETURN NEW; END IF;
 IF NEW.status='in_progress' THEN
  INSERT INTO private.storage_erasure_work_items(request_id,bucket_id,object_path)
  SELECT NEW.id,o.bucket_id,o.name FROM storage.objects o
   WHERE o.bucket_id='avatars' AND split_part(o.name,'/',1)=NEW.subject_id::text
   ON CONFLICT DO NOTHING;
 END IF;
 IF NEW.status='fulfilled' AND (
  EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='avatars' AND split_part(o.name,'/',1)=NEW.subject_id::text)
  OR EXISTS(SELECT 1 FROM private.storage_erasure_work_items w WHERE w.request_id=NEW.id
    AND (w.status<>'deleted' OR w.backup_retirement_sha256 IS NULL))) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='storage_and_backup_erasure_evidence_required';
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION private.storage_erasure_request_boundary() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave07_storage_erasure_decision BEFORE UPDATE ON public.data_subject_requests
 FOR EACH ROW EXECUTE FUNCTION private.storage_erasure_request_boundary();

CREATE FUNCTION public.claim_storage_erasure_work(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,bucket_id text,object_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_storage_maintenance_required'; END IF;
 RETURN QUERY WITH candidates AS (
  SELECT w.id FROM private.storage_erasure_work_items w JOIN public.data_subject_requests r ON r.id=w.request_id
  WHERE r.status='in_progress' AND r.retention_decision='delete_non_clinical'
   AND (w.status='queued' OR (w.status='deleting' AND w.leased_until<now()))
  ORDER BY w.created_at FOR UPDATE OF w SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,50),100))
 ) UPDATE private.storage_erasure_work_items w SET status='deleting',leased_until=now()+interval '15 minutes'
  FROM candidates c WHERE c.id=w.id RETURNING w.id,w.bucket_id,w.object_path;
END$$;
REVOKE ALL ON FUNCTION public.claim_storage_erasure_work(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_erasure_work(integer) TO service_role;

CREATE FUNCTION public.finish_storage_erasure_work(p_work_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_storage_maintenance_required'; END IF;
 UPDATE private.storage_erasure_work_items w SET status='deleted',deleted_at=now()
 WHERE w.id=p_work_id AND w.status='deleting' AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=w.bucket_id AND o.name=w.object_path);
 IF NOT FOUND THEN RAISE EXCEPTION 'storage_erasure_not_verified'; END IF;
END$$;
REVOKE ALL ON FUNCTION public.finish_storage_erasure_work(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_storage_erasure_work(uuid) TO service_role;

-- This evidence is supplied only after backup expiration/deletion is checked by
-- the operator. Removing the live bytes alone cannot certify backup erasure.
CREATE FUNCTION public.acknowledge_storage_erasure_backups(p_request_id uuid,p_evidence_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_storage_maintenance_required'; END IF;
 IF p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[0-9a-f]{64}$'
  OR EXISTS(SELECT 1 FROM private.storage_erasure_work_items w WHERE w.request_id=p_request_id AND w.status<>'deleted') THEN
  RAISE EXCEPTION 'backup_retirement_evidence_invalid';
 END IF;
 UPDATE private.storage_erasure_work_items SET backup_retirement_sha256=p_evidence_sha256 WHERE request_id=p_request_id AND backup_retirement_sha256 IS NULL;
END$$;
REVOKE ALL ON FUNCTION public.acknowledge_storage_erasure_backups(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_storage_erasure_backups(uuid,text) TO service_role;

-- Obtain current exclusions independently of the old backup being restored.
CREATE FUNCTION public.list_storage_recovery_exclusions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='trusted_storage_maintenance_required'; END IF;
 RETURN jsonb_build_object('capturedAt',now(),'complete',true,'exclusions',coalesce(
  (SELECT jsonb_agg(jsonb_build_object('bucket_id',w.bucket_id,'object_path',w.object_path) ORDER BY w.bucket_id,w.object_path)
   FROM (SELECT DISTINCT bucket_id,object_path FROM private.storage_erasure_work_items) w),'[]'::jsonb));
END$$;
REVOKE ALL ON FUNCTION public.list_storage_recovery_exclusions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_storage_recovery_exclusions() TO service_role;

CREATE FUNCTION public.abandon_storage_upload(p_bucket text,p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reservation private.storage_upload_reservations%rowtype;
BEGIN
 PERFORM private.wave05_require_active_actor();
 SELECT * INTO reservation FROM private.storage_upload_reservations WHERE bucket_id=p_bucket AND object_path=p_path FOR UPDATE;
 IF NOT FOUND OR reservation.actor_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL OR reservation.bound_at IS NOT NULL
  OR reservation.status NOT IN ('reserved','confirmed','failed') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bound_or_foreign_file_cannot_be_abandoned';
 END IF;
 UPDATE private.storage_upload_reservations SET expires_at=now()-interval '1 second',verified_at=CASE WHEN status='confirmed' THEN now()-interval '7 hours' ELSE verified_at END
  WHERE id=reservation.id;
END$$;
REVOKE ALL ON FUNCTION public.abandon_storage_upload(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.abandon_storage_upload(text,text) TO authenticated;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE FUNCTION private.schedule_storage_maintenance_request()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint text; credential text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets WHERE name='nello_storage_maintenance_url';
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='nello_storage_maintenance_service_key';
 IF endpoint IS NULL OR credential IS NULL THEN RETURN NULL; END IF;
 -- Vault configuration is operator-owned. Reject arbitrary external recipients.
 IF endpoint NOT IN ('https://afyoidxrshkmplxhcyeh.supabase.co/functions/v1/storage-maintenance',
  'http://kong:8000/functions/v1/storage-maintenance') THEN RAISE EXCEPTION 'maintenance_endpoint_invalid'; END IF;
 SELECT net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||credential,'Content-Type','application/json'),
  body:='{}'::jsonb,timeout_milliseconds:=30000) INTO request_id;
 RETURN request_id;
END$$;
REVOKE ALL ON FUNCTION private.schedule_storage_maintenance_request() FROM PUBLIC,anon,authenticated;
DO $$BEGIN
 IF current_database()='postgres' THEN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  PERFORM cron.schedule('nello-storage-maintenance','*/15 * * * *','select private.schedule_storage_maintenance_request();');
 ELSIF current_database() !~ '^nello_qa_wave02_[0-9]+$' THEN
  RAISE EXCEPTION 'storage_scheduler_requires_primary_database';
 END IF;
 -- Disposable SQL clones are not scheduler databases. Their queue/ACL/state
 -- contracts run unchanged; HTTP scheduling is exercised on local postgres.
END$$;

COMMIT;

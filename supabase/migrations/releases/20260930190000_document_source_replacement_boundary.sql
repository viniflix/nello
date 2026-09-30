-- Forward repair: preserve historical migration bytes and same-source replacement lifecycle.
-- Existing duplicates must be reconciled explicitly; indexes deliberately fail rather than discard records.
CREATE UNIQUE INDEX document_artifacts_one_live_source_idx ON public.document_artifacts(source_type, (coalesce(source_key,source_id::text))) WHERE coalesce(source_key,source_id::text) IS NOT NULL AND supersedes_id IS NULL AND status IN ('draft','finalized','signed');
CREATE UNIQUE INDEX document_artifacts_one_signed_source_idx ON public.document_artifacts(source_type, (coalesce(source_key,source_id::text))) WHERE coalesce(source_key,source_id::text) IS NOT NULL AND status='signed';
CREATE UNIQUE INDEX document_artifacts_one_pending_replacement_idx ON public.document_artifacts(supersedes_id) WHERE supersedes_id IS NOT NULL AND status IN ('draft','finalized');

CREATE OR REPLACE FUNCTION public.create_document_artifact_from_clinical_record(p_record_id uuid, p_visibility text DEFAULT 'professional_private'::text, p_supersedes_id uuid DEFAULT NULL::uuid, p_replacement_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_r public.clinical_records%rowtype;v_i public.professional_document_identities%rowtype;v_id uuid:=gen_random_uuid();v_old public.document_artifacts%rowtype;v_responsible uuid;
begin
 if v_actor is null then raise exception using errcode='42501',message='authentication_required';end if;
 if p_visibility not in('professional_private','shared_with_patient','share_later') then raise exception using errcode='22023',message='invalid_document_visibility';end if;
 select * into v_r from public.clinical_records where id=p_record_id for update;
 if not found or v_r.status not in('finalized','signed','corrected') or not private.can_write_active_care_episode(v_r.care_episode_id) then raise exception using errcode='42501',message='clinical_record_document_forbidden';end if;
 if v_actor not in(v_r.nutritionist_id,coalesce(v_r.student_id,v_r.nutritionist_id),coalesce(v_r.supervisor_id,v_r.nutritionist_id)) then raise exception using errcode='42501',message='clinical_record_document_forbidden';end if;
 v_responsible:=coalesce(v_r.supervisor_id,v_r.nutritionist_id);
 select * into v_i from public.professional_document_identities where professional_id=v_responsible and status='active';
 if not found then raise exception using errcode='23514',message='responsible_document_identity_required';end if;
 if p_supersedes_id is null and exists(select 1 from public.document_artifacts a where a.source_type='clinical_record' and a.source_id=v_r.id and a.status in('draft','finalized','signed')) then raise exception using errcode='23505',message='clinical_record_document_already_exists';end if;
 if p_supersedes_id is not null then select * into v_old from public.document_artifacts where id=p_supersedes_id for update;
   if not found or v_old.status is distinct from 'signed' or v_old.professional_id is distinct from v_responsible
   or v_old.patient_id is distinct from v_r.patient_id or v_old.care_episode_id is distinct from v_r.care_episode_id
   or v_old.source_type is distinct from 'clinical_record'
   or not exists(select 1 from public.clinical_records prior where prior.id=v_old.source_id and coalesce(prior.root_record_id,prior.id)=coalesce(v_r.root_record_id,v_r.id)) or length(coalesce(btrim(p_replacement_reason),''))<10 then raise exception using errcode='22023',message='invalid_document_replacement';end if;end if;
 insert into public.document_artifacts(id,layout_code,layout_version,source_type,source_id,patient_id,care_episode_id,professional_id,preparer_id,supervisor_id,identity_id,visibility,draft_payload,supersedes_id,replacement_reason)
 values(v_id,'clinical_record',1,'clinical_record',v_r.id,v_r.patient_id,v_r.care_episode_id,v_responsible,v_actor,v_r.supervisor_id,v_i.id,p_visibility,
 jsonb_build_object('title','REGISTRO CLÍNICO','record_type',v_r.record_type,'encounter_at',v_r.encounter_at,'content',v_r.content,'source_canonical_hash',v_r.canonical_hash),p_supersedes_id,nullif(btrim(p_replacement_reason),''));
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,to_status,reason)values(v_id,v_actor,'created','draft','document_created_from_clinical_record');
 return jsonb_build_object('artifact_id',v_id,'status','draft','revision',1);
end$function$;

CREATE OR REPLACE FUNCTION public.sign_document_artifact(p_artifact_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_a public.document_artifacts%rowtype;v_v public.professional_verifications%rowtype;v_old public.document_artifacts%rowtype;v_code uuid:=gen_random_uuid();
begin
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or v_actor is null or v_actor<>v_a.professional_id or not private.can_manage_document_artifact(v_a.id) then raise exception using errcode='42501',message='document_signature_forbidden';end if;
 if v_a.status<>'finalized' then raise exception using errcode='23514',message='only_finalized_document_can_be_signed';end if;
 select * into v_v from public.professional_verifications where user_id=v_actor and professional_role='nutritionist' and status='approved' and valid_until>now();
 if not found or v_v.normalized_crn is null then raise exception using errcode='42501',message='verified_crn_required_for_signature';end if;
 if not exists(select 1 from public.professional_document_identities i where i.id=v_a.identity_id and i.professional_id=v_actor and i.normalized_crn=v_v.normalized_crn) then raise exception using errcode='42501',message='document_identity_verification_mismatch';end if;
 if v_a.supersedes_id is not null then
   select * into v_old from public.document_artifacts where id=v_a.supersedes_id for update;
   if not found or v_old.status is distinct from 'signed' or v_old.professional_id is distinct from v_a.professional_id
     or v_old.patient_id is distinct from v_a.patient_id or v_old.care_episode_id is distinct from v_a.care_episode_id
     or v_old.source_type is distinct from 'clinical_record' or v_a.source_type is distinct from 'clinical_record'
     or not exists(select 1 from public.clinical_records prior join public.clinical_records successor
       on coalesce(prior.root_record_id,prior.id)=coalesce(successor.root_record_id,successor.id)
       where prior.id=v_old.source_id and successor.id=v_a.source_id) then
     raise exception using errcode='22023',message='invalid_document_replacement';end if;
   update public.document_artifacts set status='superseded',updated_at=now() where id=v_old.id;
 end if;
 update public.document_artifacts set status='signed',signed_at=now(),signed_by=v_actor,signature_method='nello_internal',authenticity_code=v_code,
 signature_evidence=jsonb_build_object('method','nello_internal','actor_id',v_actor,'identity_id',v_a.identity_id,'canonical_sha256',v_a.canonical_sha256,'verified_crn',v_v.normalized_crn),revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,v_actor,'signed','finalized','signed','document_signed_internally',jsonb_build_object('method','nello_internal'));
 if v_a.supersedes_id is not null then
   insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.supersedes_id,v_actor,'superseded','signed','superseded',v_a.replacement_reason,jsonb_build_object('replacement_id',v_a.id));end if;
 return jsonb_build_object('artifact_id',v_a.id,'status','signed','authenticity_code',v_code,'sha256',v_a.canonical_sha256);
end$function$;

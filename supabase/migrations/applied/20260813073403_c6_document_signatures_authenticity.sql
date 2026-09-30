-- C6.5: internal Nello signature, minimized authenticity and invalidation.
create function public.sign_document_artifact(p_artifact_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_a public.document_artifacts%rowtype;v_v public.professional_verifications%rowtype;v_code uuid:=gen_random_uuid();
begin
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or v_actor is null or v_actor<>v_a.professional_id or not private.can_manage_document_artifact(v_a.id) then raise exception using errcode='42501',message='document_signature_forbidden';end if;
 if v_a.status<>'finalized' then raise exception using errcode='23514',message='only_finalized_document_can_be_signed';end if;
 select * into v_v from public.professional_verifications where user_id=v_actor and professional_role='nutritionist' and status='approved' and valid_until>now();
 if not found or v_v.normalized_crn is null then raise exception using errcode='42501',message='verified_crn_required_for_signature';end if;
 if not exists(select 1 from public.professional_document_identities i where i.id=v_a.identity_id and i.professional_id=v_actor and i.normalized_crn=v_v.normalized_crn) then raise exception using errcode='42501',message='document_identity_verification_mismatch';end if;
 update public.document_artifacts set status='signed',signed_at=now(),signed_by=v_actor,signature_method='nello_internal',authenticity_code=v_code,
 signature_evidence=jsonb_build_object('method','nello_internal','actor_id',v_actor,'identity_id',v_a.identity_id,'canonical_sha256',v_a.canonical_sha256,'verified_crn',v_v.normalized_crn),revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,v_actor,'signed','finalized','signed','document_signed_internally',jsonb_build_object('method','nello_internal'));
 if v_a.supersedes_id is not null then update public.document_artifacts set status='superseded',updated_at=now() where id=v_a.supersedes_id and status='signed';
   insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.supersedes_id,v_actor,'superseded','signed','superseded',v_a.replacement_reason,jsonb_build_object('replacement_id',v_a.id));end if;
 return jsonb_build_object('artifact_id',v_a.id,'status','signed','authenticity_code',v_code,'sha256',v_a.canonical_sha256);
end$$;

create function public.invalidate_document_artifact(p_artifact_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.document_artifacts%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='document_invalidation_reason_required';end if;
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or auth.uid()<>v_a.professional_id or not private.can_manage_document_artifact(v_a.id) then raise exception using errcode='42501',message='document_invalidation_forbidden';end if;
 if v_a.status<>'signed' then raise exception using errcode='23514',message='only_signed_document_can_be_invalidated';end if;
 update public.document_artifacts set status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason)values(v_a.id,auth.uid(),'invalidated','signed','invalidated',v_reason);
 return jsonb_build_object('artifact_id',v_a.id,'status','invalidated','sha256',v_a.canonical_sha256);
end$$;

create function public.verify_document_authenticity(p_code uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('found',true,'document_type',a.layout_code,'status',a.status,'signed_at',a.signed_at,
 'professional',jsonb_build_object('name',i.professional_name,'crn_region',i.crn_region,'crn_number',i.crn_number),
 'integrity',jsonb_build_object('sha256',a.canonical_sha256),'issuer','Nello')
 from public.document_artifacts a join public.professional_document_identities i on i.id=a.identity_id
 where a.authenticity_code=p_code and a.status in('signed','invalidated','superseded')),jsonb_build_object('found',false))$$;

revoke all on function public.sign_document_artifact(uuid),public.invalidate_document_artifact(uuid,text),public.verify_document_authenticity(uuid) from public,anon,authenticated;
grant execute on function public.sign_document_artifact(uuid),public.invalidate_document_artifact(uuid,text) to authenticated,service_role;
grant execute on function public.verify_document_authenticity(uuid) to public,anon,authenticated,service_role;

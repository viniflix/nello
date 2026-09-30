-- C6.4: canonical document artifacts. PDF is a projection, never the source.
create table public.document_artifacts(
 id uuid primary key default gen_random_uuid(), layout_code text not null, layout_version integer not null,
 source_type text not null check(source_type in('clinical_record','manual','meal_plan','prescription','data_export')),
 source_id uuid, patient_id uuid references public.user_profiles(id) on delete restrict,
 care_episode_id uuid references public.care_episodes(id) on delete restrict,
 professional_id uuid not null references public.user_profiles(id) on delete restrict,
 preparer_id uuid not null references public.user_profiles(id) on delete restrict,
 supervisor_id uuid references public.user_profiles(id) on delete restrict,
 identity_id uuid not null references public.professional_document_identities(id) on delete restrict,
 status text not null default 'draft' check(status in('draft','finalized','signed','invalidated','superseded')),
 visibility text not null check(visibility in('professional_private','shared_with_patient','share_later')),
 revision bigint not null default 1, draft_payload jsonb not null check(jsonb_typeof(draft_payload)='object'),
 canonical_payload jsonb, canonical_sha256 text check(canonical_sha256 is null or canonical_sha256~'^[0-9a-f]{64}$'),
 supersedes_id uuid references public.document_artifacts(id) on delete restrict, replacement_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 finalized_at timestamptz, finalized_by uuid references public.user_profiles(id) on delete restrict,
 signed_at timestamptz, signed_by uuid references public.user_profiles(id) on delete restrict,
 signature_method text, signature_evidence jsonb, authenticity_code uuid unique,
 invalidated_at timestamptz, invalidated_by uuid references public.user_profiles(id) on delete restrict,
 invalidation_reason text,
 foreign key(layout_code,layout_version) references public.document_layout_versions(layout_code,version) on delete restrict,
 check((supersedes_id is null and replacement_reason is null) or (supersedes_id is not null and length(btrim(replacement_reason))>=10)),
 check((status='draft' and canonical_payload is null and canonical_sha256 is null and finalized_at is null)
   or (status<>'draft' and canonical_payload is not null and canonical_sha256 is not null and finalized_at is not null)),
 check((status in('signed','invalidated','superseded') and signed_at is not null and signed_by is not null and authenticity_code is not null)
   or (status in('draft','finalized') and signed_at is null and signed_by is null and authenticity_code is null))
);
create index document_artifacts_episode_created_idx on public.document_artifacts(care_episode_id,created_at desc);
create index document_artifacts_patient_status_idx on public.document_artifacts(patient_id,status,created_at desc);

create table public.document_artifact_events(
 id uuid primary key default gen_random_uuid(),artifact_id uuid not null references public.document_artifacts(id) on delete restrict,
 actor_id uuid not null references public.user_profiles(id) on delete restrict,event_type text not null,
 from_status text,to_status text,reason text not null,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.document_artifacts enable row level security;alter table public.document_artifact_events enable row level security;
revoke all on table public.document_artifacts,public.document_artifact_events from public,anon,authenticated;
grant select,insert,update on public.document_artifacts to service_role;grant select,insert on public.document_artifact_events to service_role;

create function private.reject_document_artifact_delete() returns trigger language plpgsql set search_path='' as $$begin raise exception using errcode='P0001',message='document_artifact_delete_forbidden';end$$;
create function private.reject_document_artifact_event_mutation() returns trigger language plpgsql set search_path='' as $$begin raise exception using errcode='P0001',message='document_artifact_events_are_immutable';end$$;
create function private.protect_document_artifact_frozen_fields() returns trigger language plpgsql set search_path='' as $$begin
 if old.status<>'draft' and (new.canonical_payload is distinct from old.canonical_payload or new.canonical_sha256 is distinct from old.canonical_sha256
   or new.identity_id is distinct from old.identity_id or new.layout_code is distinct from old.layout_code or new.layout_version is distinct from old.layout_version
   or new.patient_id is distinct from old.patient_id or new.care_episode_id is distinct from old.care_episode_id or new.source_id is distinct from old.source_id) then
   raise exception using errcode='P0001',message='document_artifact_canonical_fields_are_frozen';end if;
 if old.signed_at is not null and (new.signed_at is distinct from old.signed_at or new.signed_by is distinct from old.signed_by
   or new.signature_method is distinct from old.signature_method or new.signature_evidence is distinct from old.signature_evidence
   or new.authenticity_code is distinct from old.authenticity_code) then
   raise exception using errcode='P0001',message='document_artifact_signature_is_immutable';end if;
 return new;end$$;
create trigger trg_document_artifacts_no_delete before delete on public.document_artifacts for each row execute function private.reject_document_artifact_delete();
create trigger trg_document_artifact_events_immutable before update or delete on public.document_artifact_events for each row execute function private.reject_document_artifact_event_mutation();
create trigger trg_document_artifact_frozen_fields before update on public.document_artifacts for each row execute function private.protect_document_artifact_frozen_fields();
revoke all on function private.reject_document_artifact_delete(),private.reject_document_artifact_event_mutation(),private.protect_document_artifact_frozen_fields() from public,anon,authenticated;

create function private.can_manage_document_artifact(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.document_artifacts a where a.id=p_id
 and auth.uid() in(a.professional_id,a.preparer_id,coalesce(a.supervisor_id,a.professional_id))
 and (a.care_episode_id is null or private.can_write_active_care_episode(a.care_episode_id)))$$;
revoke all on function private.can_manage_document_artifact(uuid) from public,anon,authenticated;

create function public.create_document_artifact_from_clinical_record(p_record_id uuid,p_visibility text default 'professional_private',p_supersedes_id uuid default null,p_replacement_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_r public.clinical_records%rowtype;v_i public.professional_document_identities%rowtype;v_id uuid:=gen_random_uuid();v_old public.document_artifacts%rowtype;v_responsible uuid;
begin
 if v_actor is null then raise exception using errcode='42501',message='authentication_required';end if;
 if p_visibility not in('professional_private','shared_with_patient','share_later') then raise exception using errcode='22023',message='invalid_document_visibility';end if;
 select * into v_r from public.clinical_records where id=p_record_id;
 if not found or v_r.status not in('finalized','signed','corrected') or not private.can_write_active_care_episode(v_r.care_episode_id) then raise exception using errcode='42501',message='clinical_record_document_forbidden';end if;
 if v_actor not in(v_r.nutritionist_id,coalesce(v_r.student_id,v_r.nutritionist_id),coalesce(v_r.supervisor_id,v_r.nutritionist_id)) then raise exception using errcode='42501',message='clinical_record_document_forbidden';end if;
 v_responsible:=coalesce(v_r.supervisor_id,v_r.nutritionist_id);
 select * into v_i from public.professional_document_identities where professional_id=v_responsible and status='active';
 if not found then raise exception using errcode='23514',message='responsible_document_identity_required';end if;
 if p_supersedes_id is not null then select * into v_old from public.document_artifacts where id=p_supersedes_id for share;
   if not found or v_old.professional_id<>v_responsible or length(coalesce(btrim(p_replacement_reason),''))<10 then raise exception using errcode='22023',message='invalid_document_replacement';end if;end if;
 insert into public.document_artifacts(id,layout_code,layout_version,source_type,source_id,patient_id,care_episode_id,professional_id,preparer_id,supervisor_id,identity_id,visibility,draft_payload,supersedes_id,replacement_reason)
 values(v_id,'clinical_record',1,'clinical_record',v_r.id,v_r.patient_id,v_r.care_episode_id,v_responsible,v_actor,v_r.supervisor_id,v_i.id,p_visibility,
 jsonb_build_object('title','REGISTRO CLÍNICO','record_type',v_r.record_type,'encounter_at',v_r.encounter_at,'content',v_r.content,'source_canonical_hash',v_r.canonical_hash),p_supersedes_id,nullif(btrim(p_replacement_reason),''));
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,to_status,reason)values(v_id,v_actor,'created','draft','document_created_from_clinical_record');
 return jsonb_build_object('artifact_id',v_id,'status','draft','revision',1);
end$$;

create function public.update_document_artifact_draft(p_artifact_id uuid,p_payload jsonb,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.document_artifacts%rowtype;v_size integer;
begin
 if jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='document_draft_payload_must_be_object';end if;
 v_size:=octet_length(p_payload::text);if v_size>1048576 then raise exception using errcode='22023',message='document_draft_payload_too_large';end if;
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or not private.can_manage_document_artifact(p_artifact_id) then raise exception using errcode='42501',message='document_artifact_write_forbidden';end if;
 if v_a.status<>'draft' then raise exception using errcode='23514',message='only_draft_document_can_change';end if;
 if p_expected_revision is distinct from v_a.revision then raise exception using errcode='40001',message='document_artifact_revision_conflict';end if;
 update public.document_artifacts set draft_payload=p_payload,revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,auth.uid(),'draft_updated','draft','draft','document_draft_updated',jsonb_build_object('revision',v_a.revision+1));
 return jsonb_build_object('artifact_id',v_a.id,'status','draft','revision',v_a.revision+1);
end$$;

create function public.finalize_document_artifact(p_artifact_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a public.document_artifacts%rowtype;v_p public.user_profiles%rowtype;v_c jsonb;v_hash text;
begin
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or not private.can_manage_document_artifact(p_artifact_id) then raise exception using errcode='42501',message='document_artifact_finalize_forbidden';end if;
 if v_a.status<>'draft' then raise exception using errcode='23514',message='only_draft_document_can_finalize';end if;
 if p_expected_revision is distinct from v_a.revision then raise exception using errcode='40001',message='document_artifact_revision_conflict';end if;
 select * into v_p from public.user_profiles where id=v_a.patient_id;
 v_c:=private.compose_document_payload(v_a.layout_code,v_a.layout_version,v_a.identity_id,
   jsonb_strip_nulls(jsonb_build_object('id',v_p.id,'name',v_p.name,'birth_date',v_p.birth_date)),
   v_a.draft_payload,jsonb_build_object('artifact_id',v_a.id,'source_type',v_a.source_type,'source_id',v_a.source_id,'visibility',v_a.visibility,'created_at',v_a.created_at));
 v_hash:=encode(extensions.digest(convert_to(v_c::text,'UTF8'),'sha256'),'hex');
 update public.document_artifacts set status='finalized',canonical_payload=v_c,canonical_sha256=v_hash,finalized_at=now(),finalized_by=auth.uid(),revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,auth.uid(),'finalized','draft','finalized','document_finalized',jsonb_build_object('sha256',v_hash));
 return jsonb_build_object('artifact_id',v_a.id,'status','finalized','revision',v_a.revision+1,'sha256',v_hash);
end$$;

create function public.get_document_artifact(p_artifact_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_a public.document_artifacts%rowtype;begin
 if auth.uid() is null then raise exception using errcode='42501',message='authentication_required';end if;
 select * into v_a from public.document_artifacts where id=p_artifact_id;
 if not found then raise exception using errcode='P0002',message='document_artifact_not_found';end if;
 if auth.uid()=v_a.patient_id then
   if v_a.status not in('signed','invalidated','superseded') or v_a.visibility<>'shared_with_patient' then raise exception using errcode='42501',message='document_artifact_read_forbidden';end if;
 elsif auth.uid() not in(v_a.professional_id,v_a.preparer_id,coalesce(v_a.supervisor_id,v_a.professional_id)) then raise exception using errcode='42501',message='document_artifact_read_forbidden';end if;
 return jsonb_strip_nulls(jsonb_build_object(
   'id',v_a.id,'status',v_a.status,'visibility',v_a.visibility,'revision',v_a.revision,
   'source_type',v_a.source_type,'source_id',v_a.source_id,'patient_id',v_a.patient_id,
   'care_episode_id',v_a.care_episode_id,'professional_id',v_a.professional_id,
   'preparer_id',v_a.preparer_id,'supervisor_id',v_a.supervisor_id,
   'canonical_payload',v_a.canonical_payload,'sha256',v_a.canonical_sha256,
   'signed_at',v_a.signed_at,'authenticity_code',v_a.authenticity_code,
   'invalidation_reason',v_a.invalidation_reason
 ));
end$$;

create function public.list_document_artifacts(p_patient_id uuid,p_episode_id uuid) returns setof jsonb language sql stable security definer set search_path='' as $$
 select public.get_document_artifact(a.id) from public.document_artifacts a where a.patient_id=p_patient_id and a.care_episode_id=p_episode_id
 and (auth.uid() in(a.professional_id,a.preparer_id,coalesce(a.supervisor_id,a.professional_id)) or (auth.uid()=a.patient_id and a.status in('signed','invalidated','superseded') and a.visibility='shared_with_patient')) order by a.created_at desc$$;

revoke all on function public.create_document_artifact_from_clinical_record(uuid,text,uuid,text),public.update_document_artifact_draft(uuid,jsonb,bigint),public.finalize_document_artifact(uuid,bigint),public.get_document_artifact(uuid),public.list_document_artifacts(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_document_artifact_from_clinical_record(uuid,text,uuid,text),public.update_document_artifact_draft(uuid,jsonb,bigint),public.finalize_document_artifact(uuid,bigint),public.get_document_artifact(uuid),public.list_document_artifacts(uuid,uuid) to authenticated,service_role;

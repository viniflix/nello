-- C5 etapa 5: revisÃ£o, compartilhamento, substituiÃ§Ã£o, invalidaÃ§Ã£o e pendÃªncias.

create function private.can_manage_clinical_attachment(p_episode_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select private.lock_and_can_write_active_care_episode(p_episode_id)
    and exists (
      select 1 from public.care_episodes e
      where e.id=p_episode_id and e.status='active'
        and auth.uid() in (e.nutritionist_id,e.supervisor_id)
    )
$$;

create or replace function private.record_clinical_attachment_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_actor_id uuid;
  v_action text;
  v_reason text:=nullif(btrim(current_setting('app.clinical_attachment_reason',true)),'');
begin
  v_actor_id:=coalesce(auth.uid(),new.reviewed_by,new.author_id);
  if tg_op='INSERT' then
    v_action:='created';
  elsif old.status='pending_review' and new.status='active'
    and old.reviewed_by is distinct from new.reviewed_by then
    v_action:='reviewed';
  elsif old.status<>new.status then
    v_action:=case
      when new.status='superseded' then 'replaced'
      when new.status='invalidated' and old.status='pending_review' then 'rejected'
      when new.status='invalidated' then 'invalidated'
      else 'status_changed'
    end;
  elsif old.visibility<>new.visibility then
    v_action:='visibility_changed';
  elsif old.reviewed_by is distinct from new.reviewed_by then
    v_action:='reviewed';
  else
    v_action:='metadata_updated';
  end if;

  insert into public.clinical_attachment_events(
    clinical_attachment_id,patient_id,care_episode_id,actor_id,actor_role,action,
    from_status,to_status,from_visibility,to_visibility,reason,metadata
  ) values (
    new.id,new.patient_id,new.care_episode_id,v_actor_id,
    private.clinical_attachment_actor_role(v_actor_id,new.source),v_action,
    case when tg_op='UPDATE' then old.status end,new.status,
    case when tg_op='UPDATE' then old.visibility end,new.visibility,
    coalesce(new.invalidation_reason,v_reason),'{}'::jsonb
  );
  return new;
end
$$;

create function public.review_patient_clinical_attachment(
  p_attachment_id uuid,
  p_decision text,
  p_reason text default null,
  p_category_code text default null,
  p_description text default null,
  p_clinical_date date default null,
  p_clinical_record_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_decision not in ('accept','reject') then
    raise exception using errcode='22023',message='invalid_review_decision';
  end if;

  select * into v_attachment from public.clinical_attachments
  where id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_attachment.source<>'patient' or v_attachment.status<>'pending_review' then
    raise exception using errcode='23514',message='attachment_not_pending_review';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_review_forbidden';
  end if;

  if p_decision='reject' then
    if length(coalesce(v_reason,''))<10 then
      raise exception using errcode='22023',message='review_rejection_reason_required';
    end if;
    perform set_config('app.clinical_attachment_reason',v_reason,true);
    update public.clinical_attachments
      set status='invalidated',reviewed_by=v_actor,reviewed_at=now(),
          invalidation_reason=v_reason,invalidated_at=now()
      where id=v_attachment.id;
  else
    if p_category_code is not null and not exists(
      select 1 from public.clinical_attachment_categories
      where code=p_category_code and is_active
    ) then raise exception using errcode='22023',message='invalid_attachment_category'; end if;
    if p_clinical_record_id is not null and not exists(
      select 1 from public.clinical_records r
      where r.id=p_clinical_record_id and r.patient_id=v_attachment.patient_id
        and r.care_episode_id=v_attachment.care_episode_id
    ) then raise exception using errcode='23503',message='clinical_record_scope_mismatch'; end if;

    perform set_config('app.clinical_attachment_reason','professional_review_accepted',true);
    update public.clinical_attachments set
      status='active',reviewed_by=v_actor,reviewed_at=now(),
      category_code=coalesce(p_category_code,category_code),
      description=coalesce(nullif(btrim(p_description),''),description),
      clinical_date=coalesce(p_clinical_date,clinical_date),
      clinical_record_id=coalesce(p_clinical_record_id,clinical_record_id)
    where id=v_attachment.id;
  end if;

  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
    'status',case when p_decision='accept' then 'active' else 'invalidated' end);
end
$$;

create function public.change_clinical_attachment_visibility(
  p_attachment_id uuid,p_visibility text,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_attachment_visibility';
  end if;
  if length(coalesce(v_reason,''))<10 then
    raise exception using errcode='22023',message='visibility_change_reason_required';
  end if;
  select * into v_attachment from public.clinical_attachments where id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_attachment.status<>'active' then
    raise exception using errcode='23514',message='only_active_attachment_can_change_visibility';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_visibility_forbidden';
  end if;
  if v_attachment.visibility=p_visibility then
    return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
      'visibility',v_attachment.visibility,'unchanged',true);
  end if;
  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set visibility=p_visibility where id=v_attachment.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,'visibility',p_visibility);
end
$$;

create function public.invalidate_clinical_attachment(p_attachment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_attachment public.clinical_attachments%rowtype;
  v_reason text:=nullif(btrim(p_reason),'');
begin
  if auth.uid() is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(coalesce(v_reason,''))<10 then
    raise exception using errcode='22023',message='attachment_invalidation_reason_required';
  end if;
  select * into v_attachment from public.clinical_attachments where id=p_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_attachment.status not in ('pending_review','active','quarantined') then
    raise exception using errcode='23514',message='attachment_cannot_be_invalidated';
  end if;
  if not private.can_manage_clinical_attachment(v_attachment.care_episode_id) then
    raise exception using errcode='42501',message='attachment_invalidation_forbidden';
  end if;
  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments
    set status='invalidated',invalidation_reason=v_reason,invalidated_at=now()
    where id=v_attachment.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,'status','invalidated');
end
$$;

create function public.create_clinical_attachment_replacement_intent(
  p_replaces_attachment_id uuid,p_original_filename text,p_mime_type text,p_size_bytes bigint
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_previous public.clinical_attachments%rowtype;
  v_id uuid:=gen_random_uuid();
  v_expires_at timestamptz:=now()+interval '15 minutes';
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then
    raise exception using errcode='22023',message='unsupported_mime_type';
  end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>15728640 then
    raise exception using errcode='22023',message='invalid_file_size';
  end if;
  if p_original_filename is null or length(btrim(p_original_filename)) not between 1 and 255
    or btrim(p_original_filename) ~ '[[:cntrl:]/\\]' then
    raise exception using errcode='22023',message='invalid_original_filename';
  end if;
  select * into v_previous from public.clinical_attachments
    where id=p_replaces_attachment_id for update;
  if not found then raise exception using errcode='P0002',message='clinical_attachment_not_found'; end if;
  if v_previous.status<>'active' then
    raise exception using errcode='23514',message='only_active_attachment_can_be_replaced';
  end if;
  if not private.can_manage_clinical_attachment(v_previous.care_episode_id) then
    raise exception using errcode='42501',message='attachment_replacement_forbidden';
  end if;

  insert into public.clinical_attachments(
    id,patient_id,care_episode_id,clinical_record_id,root_attachment_id,version,
    replaces_attachment_id,category_code,description,clinical_date,source,author_id,
    storage_bucket,storage_path,original_filename,mime_type,size_bytes,status,visibility,
    upload_expires_at
  ) values (
    v_id,v_previous.patient_id,v_previous.care_episode_id,v_previous.clinical_record_id,
    v_previous.root_attachment_id,v_previous.version+1,v_previous.id,v_previous.category_code,
    v_previous.description,v_previous.clinical_date,'nutritionist',v_actor,
    'clinical-attachments',v_id::text,btrim(p_original_filename),p_mime_type,p_size_bytes,
    'uploading',v_previous.visibility,v_expires_at
  );
  return jsonb_build_object('attachment_id',v_id,'storage_bucket','clinical-attachments',
    'storage_path',v_id::text,'status','uploading','expires_at',v_expires_at);
end
$$;

create function public.confirm_clinical_attachment_replacement(
  p_attachment_id uuid,p_sha256 text,p_size_bytes bigint,p_mime_type text,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_previous public.clinical_attachments%rowtype;
  v_metadata jsonb;
  v_owner text;
  v_reason text:=nullif(btrim(p_reason),'');
begin
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
  select metadata,owner_id into v_metadata,v_owner from storage.objects
    where bucket_id=v_attachment.storage_bucket and name=v_attachment.storage_path;
  if not found or v_owner is distinct from v_actor::text
    or (v_metadata->>'size')::bigint is distinct from v_attachment.size_bytes
    or v_metadata->>'mimetype' is distinct from v_attachment.mime_type
    or p_size_bytes is distinct from v_attachment.size_bytes
    or p_mime_type is distinct from v_attachment.mime_type then
    raise exception using errcode='22023',message='upload_metadata_mismatch';
  end if;

  perform set_config('app.clinical_attachment_reason',v_reason,true);
  update public.clinical_attachments set sha256=p_sha256,status='active',upload_confirmed_at=now()
    where id=v_attachment.id;
  update public.clinical_attachments set status='superseded' where id=v_previous.id;
  return jsonb_build_object('success',true,'attachment_id',v_attachment.id,
    'replaced_attachment_id',v_previous.id,'status','active');
end
$$;

create function private.notify_clinical_attachment_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_recipient uuid;
begin
  if old.status='uploading' and new.status='pending_review' then
    select coalesce(e.supervisor_id,e.nutritionist_id) into v_recipient
      from public.care_episodes e where e.id=new.care_episode_id;
    insert into public.notifications(user_id,type,title,message,content)
    values(v_recipient,'clinical_attachment_review_pending','Documento aguardando revisÃ£o',
      'Um paciente enviou um documento para sua anÃ¡lise.',
      jsonb_build_object('attachment_id',new.id,'care_episode_id',new.care_episode_id,'patient_id',new.patient_id));
  elsif new.source='patient' and old.status='pending_review' and new.status in ('active','invalidated') then
    insert into public.notifications(user_id,type,title,message,content)
    values(new.patient_id,'clinical_attachment_reviewed','Documento analisado',
      'O documento enviado por vocÃª foi analisado pelo profissional.',
      jsonb_build_object('attachment_id',new.id,'care_episode_id',new.care_episode_id,'status',new.status));
  elsif old.visibility is distinct from new.visibility and new.visibility='shared_with_patient' then
    insert into public.notifications(user_id,type,title,message,content)
    values(new.patient_id,'clinical_attachment_shared','Novo documento disponÃ­vel',
      'Um documento clÃ­nico foi compartilhado com vocÃª.',
      jsonb_build_object('attachment_id',new.id,'care_episode_id',new.care_episode_id));
  end if;
  return new;
end
$$;

create trigger trg_clinical_attachment_notifications
after update on public.clinical_attachments
for each row execute function private.notify_clinical_attachment_transition();

revoke all on function private.can_manage_clinical_attachment(uuid),
  private.notify_clinical_attachment_transition() from public,anon,authenticated;
revoke all on function public.review_patient_clinical_attachment(uuid,text,text,text,text,date,uuid),
  public.change_clinical_attachment_visibility(uuid,text,text),
  public.invalidate_clinical_attachment(uuid,text),
  public.create_clinical_attachment_replacement_intent(uuid,text,text,bigint),
  public.confirm_clinical_attachment_replacement(uuid,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.review_patient_clinical_attachment(uuid,text,text,text,text,date,uuid),
  public.change_clinical_attachment_visibility(uuid,text,text),
  public.invalidate_clinical_attachment(uuid,text),
  public.create_clinical_attachment_replacement_intent(uuid,text,text,bigint),
  public.confirm_clinical_attachment_replacement(uuid,text,bigint,text,text)
  to authenticated,service_role;

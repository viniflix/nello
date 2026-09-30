-- C5 etapa 4: leitura por episodio, projecao minimizada e autorizacao curta.
-- A URL assinada e gerada pelo Supabase Storage depois desta reautorizacao;
-- nenhuma URL ou caminho e persistido no dominio clinico.

create function private.can_list_clinical_attachment(p_attachment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.clinical_attachments a
    join public.care_episodes e
      on e.id=a.care_episode_id and e.patient_id=a.patient_id
    where a.id=p_attachment_id
      and (
        (
          e.patient_id=(select auth.uid())
          and a.status='active'
          and a.visibility='shared_with_patient'
          and a.upload_confirmed_at is not null
        )
        or (
          (select auth.uid())<>e.patient_id
          and (select auth.uid()) in (e.nutritionist_id,e.student_id,e.supervisor_id)
        )
      )
  )
$$;

create function private.can_open_clinical_attachment(p_attachment_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.can_list_clinical_attachment(p_attachment_id) and exists (
    select 1
    from public.clinical_attachments a
    where a.id=p_attachment_id
      and a.upload_confirmed_at is not null
      and a.status in ('pending_review','active','superseded','invalidated')
  )
$$;

create function private.can_read_clinical_attachment_object(p_bucket_id text,p_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_bucket_id='clinical-attachments' and exists (
    select 1
    from public.clinical_attachments a
    where a.storage_bucket=p_bucket_id
      and a.storage_path=p_name
      and private.can_open_clinical_attachment(a.id)
  )
$$;

drop policy if exists clinical_attachments_select_authorized on storage.objects;
create policy clinical_attachments_select_authorized
on storage.objects for select to authenticated
using (private.can_read_clinical_attachment_object(bucket_id,name));

create function public.list_clinical_attachments_by_episode(
  p_patient_id uuid,
  p_episode_id uuid,
  p_status text,
  p_cursor text
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_rows jsonb;
  v_items jsonb;
  v_next_cursor text;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_patient_id is null or p_episode_id is null then
    raise exception using errcode='22023',message='patient_and_episode_required';
  end if;
  if p_status is not null and p_status not in (
    'uploading','pending_review','active','superseded','invalidated','quarantined','upload_failed'
  ) then raise exception using errcode='22023',message='attachment_status_filter_invalid'; end if;

  if not exists(
    select 1 from public.care_episodes e
    where e.id=p_episode_id and e.patient_id=p_patient_id
      and v_actor<>e.patient_id
      and v_actor in (e.nutritionist_id,e.student_id,e.supervisor_id)
  ) then raise exception using errcode='42501',message='attachment_list_forbidden'; end if;

  if p_cursor is not null then
    begin
      v_cursor_at:=(p_cursor::jsonb->>'created_at')::timestamptz;
      v_cursor_id:=(p_cursor::jsonb->>'id')::uuid;
      if v_cursor_at is null or v_cursor_id is null then raise exception 'invalid'; end if;
    exception when others then
      raise exception using errcode='22023',message='attachment_cursor_invalid';
    end;
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]'::jsonb)
  into v_rows
  from (
    select a.created_at,a.id,jsonb_build_object(
      'id',a.id,'patient_id',a.patient_id,'care_episode_id',a.care_episode_id,
      'clinical_record_id',a.clinical_record_id,'root_attachment_id',a.root_attachment_id,
      'version',a.version,'replaces_attachment_id',a.replaces_attachment_id,
      'category_code',a.category_code,'category_label',c.label,
      'description',a.description,'clinical_date',a.clinical_date,'source',a.source,
      'author_id',a.author_id,'reviewed_by',a.reviewed_by,'reviewed_at',a.reviewed_at,
      'original_filename',a.original_filename,'mime_type',a.mime_type,
      'size_bytes',a.size_bytes,'sha256',a.sha256,'status',a.status,
      'visibility',a.visibility,'created_at',a.created_at,'updated_at',a.updated_at,
      'invalidated_at',a.invalidated_at,'invalidation_reason',a.invalidation_reason
    ) as row_data
    from public.clinical_attachments a
    join public.clinical_attachment_categories c on c.code=a.category_code
    where a.patient_id=p_patient_id and a.care_episode_id=p_episode_id
      and (p_status is null or a.status=p_status)
      and (v_cursor_at is null or (a.created_at,a.id)<(v_cursor_at,v_cursor_id))
    order by a.created_at desc,a.id desc
    limit 51
  ) page;

  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_rows) with ordinality
  where ordinality<=50;

  if jsonb_array_length(v_rows)>50 then
    v_next_cursor:=jsonb_build_object(
      'created_at',v_items->49->>'created_at','id',v_items->49->>'id'
    )::text;
  end if;

  return jsonb_build_object(
    'items',v_items,'next_cursor',v_next_cursor,'has_more',v_next_cursor is not null
  );
end
$$;

create function public.list_patient_clinical_attachments(p_care_episode_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_items jsonb;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_care_episode_id is null then
    raise exception using errcode='22023',message='episode_required';
  end if;
  if not exists(
    select 1 from public.care_episodes e
    where e.id=p_care_episode_id and e.patient_id=v_actor
  ) then raise exception using errcode='42501',message='patient_attachment_list_forbidden'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'category_code',a.category_code,'category_label',c.label,
    'description',a.description,'clinical_date',a.clinical_date,'source',a.source,
    'original_filename',a.original_filename,'mime_type',a.mime_type,
    'size_bytes',a.size_bytes,'status',a.status,'visibility',a.visibility,
    'created_at',a.created_at,'reviewed_at',a.reviewed_at
  ) order by coalesce(a.clinical_date,a.created_at::date) desc,a.created_at desc,a.id desc),'[]'::jsonb)
  into v_items
  from public.clinical_attachments a
  join public.clinical_attachment_categories c on c.code=a.category_code
  where a.care_episode_id=p_care_episode_id and a.patient_id=v_actor
    and a.status='active' and a.visibility='shared_with_patient'
    and a.upload_confirmed_at is not null;

  return jsonb_build_object('items',v_items);
end
$$;

create function public.create_clinical_attachment_signed_url(p_attachment_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_attachment public.clinical_attachments%rowtype;
  v_expires_at timestamptz:=now()+interval '5 minutes';
begin
  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if p_attachment_id is null then
    raise exception using errcode='22023',message='attachment_required';
  end if;
  if not private.can_open_clinical_attachment(p_attachment_id) then
    raise exception using errcode='42501',message='attachment_open_forbidden';
  end if;

  select a.* into v_attachment
  from public.clinical_attachments a where a.id=p_attachment_id;
  if not found then raise exception using errcode='P0002',message='attachment_not_found'; end if;

  return jsonb_build_object(
    'attachment_id',v_attachment.id,'storage_bucket',v_attachment.storage_bucket,
    'storage_path',v_attachment.storage_path,'expires_in',300,
    'authorization_expires_at',v_expires_at
  );
end
$$;

revoke all on function private.can_list_clinical_attachment(uuid),
  private.can_open_clinical_attachment(uuid),
  private.can_read_clinical_attachment_object(text,text) from public,anon,authenticated;
grant execute on function private.can_list_clinical_attachment(uuid),
  private.can_open_clinical_attachment(uuid),
  private.can_read_clinical_attachment_object(text,text) to authenticated,service_role;

revoke all on function public.list_clinical_attachments_by_episode(uuid,uuid,text,text),
  public.list_patient_clinical_attachments(uuid),
  public.create_clinical_attachment_signed_url(uuid) from public,anon,authenticated;
grant execute on function public.list_clinical_attachments_by_episode(uuid,uuid,text,text),
  public.list_patient_clinical_attachments(uuid),
  public.create_clinical_attachment_signed_url(uuid) to authenticated,service_role;

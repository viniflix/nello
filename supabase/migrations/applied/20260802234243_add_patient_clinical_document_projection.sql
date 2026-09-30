-- C5 etapa 7: contexto e projeÃ§Ã£o minimizada dos documentos do paciente.

create function public.get_my_clinical_document_context()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object('patient_id',e.patient_id,'care_episode_id',e.id,
      'can_upload',e.status='active')
    from public.care_episodes e
    where e.patient_id=auth.uid()
    order by (e.status='active') desc,e.started_at desc,e.id desc
    limit 1
  ),'{}'::jsonb)
$$;

create function public.list_my_clinical_documents(p_care_episode_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_items jsonb;
begin
  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if not exists(select 1 from public.care_episodes e
    where e.id=p_care_episode_id and e.patient_id=v_actor) then
    raise exception using errcode='42501',message='patient_attachment_list_forbidden';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'category_code',a.category_code,'category_label',c.label,
    'description',a.description,'clinical_date',a.clinical_date,'source',a.source,
    'original_filename',a.original_filename,'mime_type',a.mime_type,
    'size_bytes',a.size_bytes,'status',a.status,'visibility',a.visibility,
    'created_at',a.created_at,'reviewed_at',a.reviewed_at,
    'can_open',(a.status='active' and a.visibility='shared_with_patient')
  ) order by a.created_at desc,a.id desc),'[]'::jsonb) into v_items
  from public.clinical_attachments a
  join public.clinical_attachment_categories c on c.code=a.category_code
  where a.care_episode_id=p_care_episode_id and a.patient_id=v_actor
    and a.upload_confirmed_at is not null
    and (
      (a.status='active' and a.visibility='shared_with_patient')
      or (a.source='patient' and a.status in ('pending_review','active','invalidated'))
    );
  return jsonb_build_object('items',v_items);
end
$$;

revoke all on function public.get_my_clinical_document_context(),
  public.list_my_clinical_documents(uuid) from public,anon,authenticated;
grant execute on function public.get_my_clinical_document_context(),
  public.list_my_clinical_documents(uuid) to authenticated,service_role;

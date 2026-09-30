begin;

insert into public.clinical_attachments(
  id,patient_id,care_episode_id,category_code,description,source,author_id,
  storage_path,original_filename,mime_type,size_bytes,sha256,status,visibility,
  upload_confirmed_at
) values (
  '50000000-0000-4000-8000-000000000201','20000000-0000-0000-0000-000000000081',
  '40000000-0000-0000-0000-000000000081','patient_document','Documento enviado para revisao',
  'patient','20000000-0000-0000-0000-000000000081','50000000-0000-4000-8000-000000000201',
  'documento.pdf','application/pdf',100,repeat('a',64),'pending_review','professional_private',now()
);

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000083',true);
do $$ begin
  begin
    perform public.review_patient_clinical_attachment(
      '50000000-0000-4000-8000-000000000201','accept',null,null,null,null,null
    );
    raise exception 'student_review_was_not_blocked';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select public.review_patient_clinical_attachment(
  '50000000-0000-4000-8000-000000000201','accept',null,'report',
  'Documento revisado pelo profissional',current_date,null
);

do $$ begin
  if (select status from public.clinical_attachments
      where id='50000000-0000-4000-8000-000000000201')<>'active' then
    raise exception 'professional_review_did_not_activate_attachment';
  end if;
end $$;

select public.change_clinical_attachment_visibility(
  '50000000-0000-4000-8000-000000000201','shared_with_patient',
  'Compartilhado depois da revisao profissional'
);

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000081',true);
do $$ declare v_docs jsonb; begin
  v_docs:=public.list_my_clinical_documents('40000000-0000-0000-0000-000000000081');
  if jsonb_array_length(v_docs->'items')<>1
    or (v_docs->'items'->0->>'can_open')::boolean is not true
    or v_docs->'items'->0 ? 'storage_path' then
    raise exception 'patient_document_projection_is_not_minimized';
  end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
select public.invalidate_clinical_attachment(
  '50000000-0000-4000-8000-000000000201','Documento substituido por resultado mais recente'
);

do $$ begin
  if not exists(select 1 from public.clinical_attachment_events
    where clinical_attachment_id='50000000-0000-4000-8000-000000000201'
      and action='reviewed') then
    raise exception 'review_event_missing';
  end if;
  if not exists(select 1 from public.clinical_attachment_events
    where clinical_attachment_id='50000000-0000-4000-8000-000000000201'
      and action='visibility_changed') then
    raise exception 'visibility_event_missing';
  end if;
  if not exists(select 1 from public.clinical_attachment_events
    where clinical_attachment_id='50000000-0000-4000-8000-000000000201'
      and action='invalidated') then
    raise exception 'invalidation_event_missing';
  end if;
end $$;

rollback;

select 'C5 lifecycle, authorization, ledger and patient projection approved.' as result;

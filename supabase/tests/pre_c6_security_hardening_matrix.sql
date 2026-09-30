begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'patient-photos','patient-photos',false,5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

do $test$
declare
  v_id bigint;
begin
  if to_regprocedure('public.create_notification(uuid,text,text,text,text,jsonb)') is not null then
    raise exception 'public_create_notification_still_exposed';
  end if;
  if has_function_privilege('anon','private.create_notification(uuid,text,text,text,text,jsonb)','execute')
     or has_function_privilege('authenticated','private.create_notification(uuid,text,text,text,text,jsonb)','execute') then
    raise exception 'private_create_notification_exposed_to_clients';
  end if;

  set local role service_role;
  select private.create_notification(
    '20000000-0000-0000-0000-000000000081','qa','Teste','Contrato',null,'{}'
  ) into v_id;
  reset role;
  if v_id is null or not exists(select 1 from public.notifications where id=v_id) then
    raise exception 'service_notification_not_created';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000081',true);
  update public.notifications set is_read=true where id=v_id;
  delete from public.notifications where id=v_id;
  reset role;
  if (select count(*) from public.notification_events where notification_id=v_id) <> 2 then
    raise exception 'notification_history_not_preserved';
  end if;
end;
$test$;

-- Patient can create an episode-scoped progress photo.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000081',true);
insert into storage.objects(bucket_id,name,owner_id,metadata)
values(
  'patient-photos',
  '20000000-0000-0000-0000-000000000081/40000000-0000-0000-0000-000000000081/progress_photos/patient.jpg',
  '20000000-0000-0000-0000-000000000081','{"mimetype":"image/jpeg","size":1000}'
);
insert into public.progress_photos(
  id,patient_id,care_episode_id,photo_url,storage_path,photo_date,uploaded_by
) values(
  '60000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000081',
  '40000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000081/40000000-0000-0000-0000-000000000081/progress_photos/patient.jpg',
  '20000000-0000-0000-0000-000000000081/40000000-0000-0000-0000-000000000081/progress_photos/patient.jpg',
  current_date,
  '20000000-0000-0000-0000-000000000081'
);

do $test$
begin
  if (select count(*) from public.progress_photos where id='60000000-0000-0000-0000-000000000081') <> 1 then
    raise exception 'patient_cannot_read_own_progress_photo';
  end if;
  if (select count(*) from storage.objects where bucket_id='patient-photos') <> 1 then
    raise exception 'patient_cannot_read_own_private_object';
  end if;
end;
$test$;

-- The episode nutritionist can read it.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000081',true);
do $test$
begin
  if (select count(*) from public.progress_photos where id='60000000-0000-0000-0000-000000000081') <> 1 then
    raise exception 'episode_nutritionist_cannot_read_progress_photo';
  end if;
  if (select count(*) from storage.objects where name like '%/progress_photos/patient.jpg') <> 1 then
    raise exception 'episode_nutritionist_cannot_read_private_object';
  end if;
end;
$test$;

-- An unrelated nutritionist cannot read, upload or invalidate it.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000085',true);
do $test$
begin
  if (select count(*) from public.progress_photos where id='60000000-0000-0000-0000-000000000081') <> 0 then
    raise exception 'unrelated_nutritionist_read_progress_photo';
  end if;
  if (select count(*) from storage.objects where name like '%/progress_photos/patient.jpg') <> 0 then
    raise exception 'unrelated_nutritionist_read_private_object';
  end if;
  begin
    perform public.invalidate_progress_photo(
      '60000000-0000-0000-0000-000000000081','Tentativa alheia'
    );
    raise exception 'unrelated_nutritionist_invalidated_progress_photo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects(bucket_id,name,owner_id)
    values(
      'patient-photos',
      '20000000-0000-0000-0000-000000000081/40000000-0000-0000-0000-000000000081/progress_photos/alien.jpg',
      '10000000-0000-0000-0000-000000000085'
    );
    raise exception 'unrelated_nutritionist_uploaded_progress_photo';
  exception when insufficient_privilege then null;
  end;
end;
$test$;

-- Invalidation is auditable and never deletes the row or object.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000081',true);
select public.invalidate_progress_photo(
  '60000000-0000-0000-0000-000000000081','Remoção solicitada pelo paciente'
);
reset role;
do $test$
begin
  if not exists(
    select 1 from public.progress_photos
    where id='60000000-0000-0000-0000-000000000081' and status='invalidated'
  ) then
    raise exception 'progress_photo_not_invalidated';
  end if;
  if not exists(
    select 1 from public.progress_photo_events
    where progress_photo_id='60000000-0000-0000-0000-000000000081'
      and event_type='invalidated'
  ) then
    raise exception 'progress_photo_invalidation_not_audited';
  end if;
  if not exists(
    select 1 from storage.objects
    where name like '%/progress_photos/patient.jpg'
  ) then
    raise exception 'progress_photo_object_was_deleted';
  end if;
end;
$test$;

rollback;

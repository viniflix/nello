-- Public buckets do not need broad SELECT policies for public object URL access.
-- Keep authenticated upload/update/delete behavior used by the frontend while
-- removing list-all capability from public buckets.

drop policy if exists "Users manage own financial docs" on storage.objects;
drop policy if exists "Users can view patient photos" on storage.objects;

create policy "Authenticated users can upload financial docs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'financial-docs');

create policy "Authenticated users can update financial docs"
on storage.objects
for update
to authenticated
using (bucket_id = 'financial-docs')
with check (bucket_id = 'financial-docs');

create policy "Authenticated users can delete financial docs"
on storage.objects
for delete
to authenticated
using (bucket_id = 'financial-docs');

create policy "Authenticated users can upload patient photos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'patient-photos');

create policy "Authenticated users can update patient photos"
on storage.objects
for update
to authenticated
using (bucket_id = 'patient-photos')
with check (bucket_id = 'patient-photos');

create policy "Authenticated users can delete patient photos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'patient-photos');


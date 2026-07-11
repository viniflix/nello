-- The bucket-specific folder policies already preserve upload/update/delete access
-- without broad object listing. Remove the broader write policies created during
-- the listing hardening pass.

drop policy if exists "Authenticated users can upload financial docs" on storage.objects;
drop policy if exists "Authenticated users can update financial docs" on storage.objects;
drop policy if exists "Authenticated users can delete financial docs" on storage.objects;
drop policy if exists "Authenticated users can upload patient photos" on storage.objects;
drop policy if exists "Authenticated users can update patient photos" on storage.objects;
drop policy if exists "Authenticated users can delete patient photos" on storage.objects;

drop extension if exists "pg_net";

alter table "public"."energy_expenditure_calculations" drop constraint "valid_protocol";

alter table "public"."energy_expenditure_calculations" add constraint "valid_protocol" CHECK ((protocol = ANY (ARRAY['harris-benedict'::text, 'mifflin-st-jeor'::text, 'fao-who'::text, 'fao-oms-2001'::text, 'schofield'::text, 'owen'::text, 'cunningham'::text, 'tinsley'::text, 'katch-mcardle'::text, 'de-lorenzo'::text]))) not valid;

alter table "public"."energy_expenditure_calculations" validate constraint "valid_protocol";


  create policy "Users can create own profile"
  on "public"."user_profiles"
  as permissive
  for insert
  to authenticated
with check ((id = auth.uid()));



  create policy "Authenticated users can delete PDFs"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can update PDFs"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)))
with check (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can upload PDFs"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can view PDFs"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'lab-results-pdfs'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Authenticated users can view avatars"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Users can delete own patient photos"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'patient-photos'::text));



  create policy "Users can insert their own chat media"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can manage their own avatar"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can manage their own chat media"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'chat_media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload patient photos"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'patient-photos'::text));



  create policy "Users can view patient photos"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'patient-photos'::text));



  create policy "Users manage own financial docs"
  on "storage"."objects"
  as permissive
  for all
  to authenticated
using ((bucket_id = 'financial-docs'::text))
with check ((bucket_id = 'financial-docs'::text));


CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();



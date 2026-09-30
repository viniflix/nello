-- CI-only metadata restoration for objects omitted from migration history.
-- Observed bucket baseline; privacy hardening belongs to Wave07.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES
('anamnesis-attachments','anamnesis-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]),
('avatars','avatars',true,5242880,ARRAY['image/jpeg','image/png','image/webp']::text[]),
('brand-archive','brand-archive',false,NULL,NULL),
('chat_media','chat_media',false,104857600,ARRAY['image/jpeg','image/png','image/gif','image/webp','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/quicktime','application/pdf','video/mp4','video/webm','video/quicktime','video/mp4','video/webm','video/quicktime','audio/webm','audio/mp4','audio/mpeg','audio/ogg','video/mp4','video/webm','video/quicktime','audio/webm','audio/mp4','audio/mpeg','audio/ogg']::text[]),
('clinical-attachments','clinical-attachments',false,15728640,ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]),
('document-assets','document-assets',false,5242880,ARRAY['image/png','image/jpeg','image/webp']::text[]),
('financial-docs','financial-docs',true,NULL,NULL),
('IDV','IDV',true,NULL,NULL),
('lab-results-pdfs','lab-results-pdfs',false,10485760,ARRAY['application/pdf']::text[]),
('patient-photos','patient-photos',false,5242880,ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();
DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION private.sync_profile_email_from_auth();

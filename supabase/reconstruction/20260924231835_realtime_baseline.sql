-- CI-only publication membership set through hosted configuration, absent from history.
DO $metadata$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
  END IF;
END $metadata$;

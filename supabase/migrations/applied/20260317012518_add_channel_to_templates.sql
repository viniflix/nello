ALTER TABLE public.checkin_templates ADD COLUMN IF NOT EXISTS channel text DEFAULT 'in_app';
NOTIFY pgrst, 'reload schema';

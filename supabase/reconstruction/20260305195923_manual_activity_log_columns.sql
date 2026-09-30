-- CI-only unrecorded columns from live metadata. No user or patient rows.
ALTER TABLE "public"."activity_log" ADD COLUMN IF NOT EXISTS "event_version" integer DEFAULT 1;
ALTER TABLE "public"."activity_log" ADD COLUMN IF NOT EXISTS "source_module" text;
ALTER TABLE "public"."activity_log" ADD COLUMN IF NOT EXISTS "nutritionist_id" uuid;
ALTER TABLE "public"."activity_log" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid;

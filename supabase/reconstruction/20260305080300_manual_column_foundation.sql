-- CI-only unrecorded columns from live metadata. No user or patient rows.
ALTER TABLE "public"."appointments" ADD COLUMN IF NOT EXISTS "start_time" timestamp with time zone NOT NULL;
ALTER TABLE "public"."energy_expenditure_calculations" ADD COLUMN IF NOT EXISTS "activity_factor" numeric DEFAULT 1.55;
ALTER TABLE "public"."energy_expenditure_calculations" ADD COLUMN IF NOT EXISTS "nutritionist_id" uuid;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "supersedes_record_id" bigint;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "revision_group_id" bigint;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "revision_number" integer DEFAULT 1 NOT NULL;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "is_latest_revision" boolean DEFAULT true NOT NULL;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "change_reason" text;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "results" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "public"."growth_records" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "message" text;
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "link_url" text;
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
ALTER TABLE "public"."user_profiles" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "public"."user_profiles" ADD COLUMN IF NOT EXISTS "invite_code" text;
ALTER TABLE "public"."user_profiles" ADD COLUMN IF NOT EXISTS "patient_invite_code" text;

-- Phase 18: Anthropometry versioning + hardening
-- Safe to run multiple times (idempotent where possible)

BEGIN;

-- 1) Versioning / audit columns
DO $$
DECLARE
  id_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
  INTO id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'growth_records'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF id_type IS NULL THEN
    RAISE EXCEPTION 'Tabela public.growth_records ou coluna id não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'growth_records'
      AND column_name = 'supersedes_record_id'
  ) THEN
    EXECUTE format('ALTER TABLE public.growth_records ADD COLUMN supersedes_record_id %s', id_type);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'growth_records'
      AND column_name = 'revision_group_id'
  ) THEN
    EXECUTE format('ALTER TABLE public.growth_records ADD COLUMN revision_group_id %s', id_type);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.growth_records
  ADD COLUMN IF NOT EXISTS revision_number integer DEFAULT 1 NOT NULL;

ALTER TABLE IF EXISTS public.growth_records
  ADD COLUMN IF NOT EXISTS is_latest_revision boolean DEFAULT true NOT NULL;

ALTER TABLE IF EXISTS public.growth_records
  ADD COLUMN IF NOT EXISTS change_reason text;

ALTER TABLE IF EXISTS public.growth_records
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

-- 2) FK self-reference (safe)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.growth_records
      ADD CONSTRAINT growth_records_supersedes_record_id_fkey
      FOREIGN KEY (supersedes_record_id)
      REFERENCES public.growth_records(id)
      ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 3) Optional FK to auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    BEGIN
      ALTER TABLE public.growth_records
        ADD CONSTRAINT growth_records_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id)
        REFERENCES auth.users(id)
        ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 4) Backfill defaults for existing records
UPDATE public.growth_records
SET revision_group_id = id
WHERE revision_group_id IS NULL;

UPDATE public.growth_records
SET revision_number = 1
WHERE revision_number IS NULL;

UPDATE public.growth_records
SET is_latest_revision = true
WHERE is_latest_revision IS NULL;

-- 5) Data quality checks (partial records allowed, but positive when present)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.growth_records
      ADD CONSTRAINT growth_records_weight_positive_chk
      CHECK (weight IS NULL OR weight > 0);
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.growth_records
      ADD CONSTRAINT growth_records_height_positive_chk
      CHECK (height IS NULL OR height > 0);
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 6) Trigger to manage version chain
CREATE OR REPLACE FUNCTION public.trg_growth_records_apply_versioning()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  source_group public.growth_records.revision_group_id%TYPE;
  source_revision integer;
BEGIN
  IF NEW.supersedes_record_id IS NOT NULL THEN
    SELECT COALESCE(revision_group_id, id), COALESCE(revision_number, 1)
    INTO source_group, source_revision
    FROM public.growth_records
    WHERE id = NEW.supersedes_record_id;

    IF source_group IS NULL THEN
      source_group := COALESCE(NEW.revision_group_id, NEW.id);
      source_revision := 0;
    END IF;

    NEW.revision_group_id := COALESCE(NEW.revision_group_id, source_group);
    NEW.revision_number := GREATEST(COALESCE(NEW.revision_number, source_revision + 1), source_revision + 1);
    NEW.is_latest_revision := true;
  ELSE
    NEW.revision_group_id := COALESCE(NEW.revision_group_id, NEW.id);
    NEW.revision_number := COALESCE(NEW.revision_number, 1);
    NEW.is_latest_revision := COALESCE(NEW.is_latest_revision, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_records_apply_versioning ON public.growth_records;
CREATE TRIGGER trg_growth_records_apply_versioning
BEFORE INSERT ON public.growth_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_growth_records_apply_versioning();

-- 7) Trigger to keep single latest revision by group
CREATE OR REPLACE FUNCTION public.trg_growth_records_mark_previous_not_latest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.revision_group_id IS NOT NULL AND NEW.is_latest_revision IS TRUE THEN
    UPDATE public.growth_records
    SET is_latest_revision = false
    WHERE revision_group_id = NEW.revision_group_id
      AND id <> NEW.id
      AND is_latest_revision = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_growth_records_mark_previous_not_latest ON public.growth_records;
CREATE TRIGGER trg_growth_records_mark_previous_not_latest
AFTER INSERT ON public.growth_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_growth_records_mark_previous_not_latest();

-- 7.1) Hardening adicional para instalações prévias (evita warning de search_path mutável)
ALTER FUNCTION public.trg_growth_records_apply_versioning()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_growth_records_mark_previous_not_latest()
  SET search_path = public, pg_temp;

-- 8) Helpful indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'growth_records'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_growth_records_patient_date ON public.growth_records(patient_id, record_date DESC, created_at DESC)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_growth_records_patient_date ON public.growth_records(patient_id, record_date DESC)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_growth_records_revision_group
  ON public.growth_records(revision_group_id, revision_number DESC);

CREATE INDEX IF NOT EXISTS idx_growth_records_supersedes
  ON public.growth_records(supersedes_record_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_records_latest_unique
  ON public.growth_records(revision_group_id)
  WHERE is_latest_revision = true;

COMMIT;


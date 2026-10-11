BEGIN;

-- Additive repair: existing services, revisions, ownership and audit remain intact.
-- Historical descriptions/categories were never stored; do not invent them.
ALTER TABLE public.services ADD COLUMN description text;
ALTER TABLE public.services ADD COLUMN category text;
ALTER TABLE public.services ADD CONSTRAINT financial_service_category
  CHECK (category IS NULL OR category IN ('consulta', 'plano_mensal', 'outros'));

COMMIT;

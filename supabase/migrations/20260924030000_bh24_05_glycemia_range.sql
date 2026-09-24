-- Values outside the measuring range of common meters require verification.
-- Existing records were checked before adding this constraint (zero rows).
ALTER TABLE public.glycemia_records
  ADD CONSTRAINT glycemia_records_value_range_check
  CHECK (value BETWEEN 20 AND 600);

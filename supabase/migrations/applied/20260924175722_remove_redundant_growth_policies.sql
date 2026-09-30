-- Existing growth_records policies already enforce episode isolation.
-- Remove the extra permissive policies from the preceding migration.
drop policy if exists growth_records_read_participants on public.growth_records;
drop policy if exists growth_records_insert_professional on public.growth_records;

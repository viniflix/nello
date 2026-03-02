-- Corrige warning RLS: operational_observability_insert_authenticated com WITH CHECK (true)
-- Substitui por política restritiva: apenas dono do log ou admin pode inserir

begin;

drop policy if exists operational_observability_insert_authenticated on public.operational_observability_log;

create policy operational_observability_insert_authenticated
  on public.operational_observability_log
  for insert
  to authenticated
  with check (nutritionist_id = auth.uid() or public.is_admin());

commit;

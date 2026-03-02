-- Phase 35: Compatibilidade appointments - adiciona start_time quando só appointment_time existe
-- Resolve: "column appointments.start_time does not exist"
-- Rodar ANTES de phase-27 (noshow) e phase-28 (appointment notifications) que usam start_time

begin;

do $$
declare
  has_appointment_time boolean;
  has_start_time boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'appointment_time'
  ) into has_appointment_time;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments' and column_name = 'start_time'
  ) into has_start_time;

  -- Se temos appointment_time mas não start_time, adicionar start_time e popular
  if has_appointment_time and not has_start_time then
    alter table public.appointments add column start_time timestamptz;
    update public.appointments set start_time = coalesce(appointment_time, now());
    alter table public.appointments alter column start_time set not null;
  end if;
end;
$$;

commit;

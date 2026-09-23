-- Keep recurrence aligned with template edits; never resume an unavailable template/episode.
create or replace function public.set_checkin_schedule_active(p_schedule_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare v_schedule public.checkin_schedules%rowtype; v_template public.checkin_templates%rowtype;
begin
  select * into v_schedule from public.checkin_schedules
  where id = p_schedule_id and nutritionist_id = auth.uid() for update;
  if not found then raise exception 'CHECKIN_SCHEDULE_NOT_FOUND'; end if;
  select * into v_template from public.checkin_templates where id = v_schedule.template_id;
  if p_active and (v_template.is_active is not true
    or not exists (select 1 from public.checkin_fields where template_id = v_template.id)
    or not exists (select 1 from public.care_episodes where id = v_schedule.care_episode_id
      and status = 'active' and coalesce(is_simulation, false) = false)) then
    raise exception 'CHECKIN_SCHEDULE_UNAVAILABLE';
  end if;
  update public.checkin_schedules set is_active = p_active,
    next_send_at = case when p_active then private.next_checkin_send_at(
      v_template.frequency, v_template.send_days, v_template.send_time,
      v_schedule.time_zone, now()) else next_send_at end
  where id = p_schedule_id;
end;
$function$;

create or replace function private.sync_checkin_template_schedules()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
begin
  if new.is_active is false then
    update public.checkin_schedules set is_active = false where template_id = new.id and is_active;
  elsif new.frequency is distinct from old.frequency
    or new.send_time is distinct from old.send_time
    or new.send_days is distinct from old.send_days then
    update public.checkin_schedules s set next_send_at = private.next_checkin_send_at(
      new.frequency, new.send_days, new.send_time, s.time_zone, now())
    where s.template_id = new.id and s.is_active;
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_sync_checkin_template_schedules on public.checkin_templates;
create trigger trg_sync_checkin_template_schedules
after update of frequency, send_time, send_days, is_active on public.checkin_templates
for each row execute function private.sync_checkin_template_schedules();

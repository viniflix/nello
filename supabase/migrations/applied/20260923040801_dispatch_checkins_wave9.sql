-- Wave 9: durable, idempotent in-app check-in delivery and patient-only submission.
alter table public.checkin_schedules
  add column if not exists time_zone text not null default 'America/Fortaleza';

alter table public.checkin_sessions
  add column if not exists scheduled_for timestamptz,
  add column if not exists fields_snapshot jsonb not null default '[]'::jsonb;

create unique index if not exists checkin_sessions_schedule_occurrence_key
  on public.checkin_sessions(schedule_id, scheduled_for);

create or replace function private.next_checkin_send_at(
  p_frequency text, p_send_days integer[], p_send_time time,
  p_time_zone text, p_after timestamptz
) returns timestamptz
language plpgsql stable set search_path = pg_catalog, public
as $function$
declare
  v_day date := (p_after at time zone p_time_zone)::date;
  v_time time := coalesce(p_send_time, '09:00'::time);
  v_candidate date;
  v_days integer[] := coalesce(p_send_days, array[1]);
  i integer;
begin
  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    raise exception 'CHECKIN_INVALID_TIME_ZONE';
  end if;
  if p_frequency = 'daily' then
    v_candidate := v_day + 1;
  elsif p_frequency = 'weekly' then
    for i in 1..7 loop
      v_candidate := v_day + i;
      if extract(isodow from v_candidate)::integer = any(v_days) then
        return (v_candidate + v_time) at time zone p_time_zone;
      end if;
    end loop;
    raise exception 'CHECKIN_INVALID_SEND_DAYS';
  elsif p_frequency = 'biweekly' then
    v_candidate := v_day + 14;
  elsif p_frequency = 'monthly' then
    v_candidate := (date_trunc('month', v_day::timestamp) + interval '1 month')::date
      + greatest(0, least(27, coalesce(v_days[1], 1) - 1));
  else
    raise exception 'CHECKIN_INVALID_FREQUENCY';
  end if;
  return (v_candidate + v_time) at time zone p_time_zone;
end;
$function$;

create or replace function public.link_checkin_template(
  p_template_id uuid, p_patient_id uuid, p_channel text default 'in_app',
  p_time_zone text default 'America/Fortaleza'
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare
  v_template public.checkin_templates%rowtype;
  v_episode uuid;
  v_schedule uuid;
begin
  if auth.uid() is null then raise exception 'CHECKIN_AUTH_REQUIRED'; end if;
  if p_channel <> 'in_app' then raise exception 'CHECKIN_CHANNEL_UNAVAILABLE'; end if;
  select * into v_template from public.checkin_templates
  where id = p_template_id and nutritionist_id = auth.uid() and is_active is true;
  if not found then raise exception 'CHECKIN_TEMPLATE_UNAVAILABLE'; end if;
  if not exists (select 1 from public.checkin_fields where template_id = p_template_id) then
    raise exception 'CHECKIN_WITHOUT_FIELDS';
  end if;
  select id into v_episode from public.care_episodes
  where patient_id = p_patient_id and nutritionist_id = auth.uid()
    and status = 'active' and coalesce(is_simulation, false) = false
  order by started_at desc limit 1;
  if v_episode is null then raise exception 'CHECKIN_ACTIVE_EPISODE_REQUIRED'; end if;
  insert into public.checkin_schedules(
    template_id, patient_id, nutritionist_id, care_episode_id,
    next_send_at, time_zone, channel, is_active
  ) values (
    p_template_id, p_patient_id, auth.uid(), v_episode,
    private.next_checkin_send_at(v_template.frequency, v_template.send_days,
      v_template.send_time, p_time_zone, now()), p_time_zone, 'in_app', true
  ) on conflict (template_id, patient_id) do update set
    nutritionist_id = excluded.nutritionist_id,
    care_episode_id = excluded.care_episode_id,
    next_send_at = excluded.next_send_at,
    time_zone = excluded.time_zone,
    channel = 'in_app', is_active = true
  returning id into v_schedule;
  return v_schedule;
end;
$function$;

create or replace function public.set_checkin_schedule_active(p_schedule_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare v_schedule public.checkin_schedules%rowtype; v_template public.checkin_templates%rowtype;
begin
  select * into v_schedule from public.checkin_schedules
  where id = p_schedule_id and nutritionist_id = auth.uid() for update;
  if not found then raise exception 'CHECKIN_SCHEDULE_NOT_FOUND'; end if;
  select * into v_template from public.checkin_templates where id = v_schedule.template_id;
  update public.checkin_schedules set is_active = p_active,
    next_send_at = case when p_active then private.next_checkin_send_at(
      v_template.frequency, v_template.send_days, v_template.send_time,
      v_schedule.time_zone, now()) else next_send_at end
  where id = p_schedule_id;
end;
$function$;

create or replace function private.dispatch_due_checkins()
returns integer language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare
  v_schedule record;
  v_session_id uuid;
  v_fields jsonb;
  v_sent integer := 0;
  v_now timestamptz := now();
begin
  update public.checkin_sessions set status = 'expired'
  where status = 'pending' and expires_at <= v_now;
  for v_schedule in
    select s.*, t.name, t.frequency, t.send_days, t.send_time
    from public.checkin_schedules s
    join public.checkin_templates t on t.id = s.template_id
    join public.care_episodes ce on ce.id = s.care_episode_id
    where s.is_active is true and t.is_active is true
      and s.channel = 'in_app' and s.next_send_at <= v_now
      and ce.status = 'active' and coalesce(ce.is_simulation, false) = false
    order by s.next_send_at, s.id
    limit 100 for update of s skip locked
  loop
    select coalesce(jsonb_agg(to_jsonb(f) order by f.order_index, f.id), '[]'::jsonb)
    into v_fields from public.checkin_fields f where f.template_id = v_schedule.template_id;
    if jsonb_array_length(v_fields) = 0 then
      raise warning 'Check-in schedule % has no fields', v_schedule.id;
      continue;
    end if;
    insert into public.checkin_sessions(
      schedule_id, patient_id, nutritionist_id, template_id, care_episode_id,
      scheduled_for, sent_at, expires_at, fields_snapshot
    ) values (
      v_schedule.id, v_schedule.patient_id, v_schedule.nutritionist_id,
      v_schedule.template_id, v_schedule.care_episode_id,
      v_schedule.next_send_at, v_now, v_now + interval '48 hours', v_fields
    ) on conflict (schedule_id, scheduled_for) do nothing
    returning id into v_session_id;
    if v_session_id is not null then
      insert into public.notifications(user_id, type, title, message, link_url, content)
      values (v_schedule.patient_id, 'checkin', 'Novo check-in disponível',
        'Responda seu check-in no app Nello.', '/patient/checkin/' || v_session_id::text,
        jsonb_build_object('session_id', v_session_id));
      v_sent := v_sent + 1;
    end if;
    update public.checkin_schedules set
      last_sent_at = v_now,
      next_send_at = private.next_checkin_send_at(v_schedule.frequency,
        v_schedule.send_days, v_schedule.send_time, v_schedule.time_zone, v_now)
    where id = v_schedule.id;
    v_session_id := null;
  end loop;
  return v_sent;
end;
$function$;

create or replace function public.submit_checkin_session(p_session_id uuid, p_responses jsonb)
returns numeric language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare
  v_session public.checkin_sessions%rowtype;
  v_field jsonb;
  v_answer jsonb;
  v_key text;
  v_weight numeric;
  v_value numeric;
  v_total numeric := 0;
  v_max numeric := 0;
  v_pct numeric;
begin
  if auth.uid() is null then raise exception 'CHECKIN_AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_responses) <> 'object' then raise exception 'CHECKIN_INVALID_RESPONSES'; end if;
  select * into v_session from public.checkin_sessions
  where id = p_session_id and patient_id = auth.uid() for update;
  if not found then raise exception 'CHECKIN_NOT_FOUND'; end if;
  if v_session.status <> 'pending' then raise exception 'CHECKIN_ALREADY_COMPLETED'; end if;
  if v_session.expires_at <= now() then raise exception 'CHECKIN_EXPIRED'; end if;
  if jsonb_array_length(v_session.fields_snapshot) = 0 then raise exception 'CHECKIN_WITHOUT_FIELDS'; end if;
  for v_field in select value from jsonb_array_elements(v_session.fields_snapshot) loop
    v_key := v_field->>'id';
    v_answer := p_responses->v_key;
    if coalesce((v_field->>'is_required')::boolean, true)
      and (v_answer is null or v_answer = 'null'::jsonb
        or v_answer = '""'::jsonb or v_answer = '[]'::jsonb) then
      raise exception 'CHECKIN_REQUIRED_FIELD_MISSING';
    end if;
    v_weight := greatest(0, coalesce((v_field->>'score_weight')::numeric, 1));
    v_max := v_max + v_weight * 10;
    v_value := 0;
    if v_answer is not null and v_answer <> 'null'::jsonb then
      if v_field->>'field_type' = 'scale_1_10' then
        if jsonb_typeof(v_answer) = 'array' then v_answer := v_answer->0; end if;
        if jsonb_typeof(v_answer) <> 'number' or (v_answer #>> '{}')::numeric < 1
          or (v_answer #>> '{}')::numeric > 10 then raise exception 'CHECKIN_INVALID_SCALE'; end if;
        v_value := (v_answer #>> '{}')::numeric;
      elsif v_field->>'field_type' = 'yes_no' then
        if v_answer not in ('"yes"'::jsonb, '"no"'::jsonb) then
          raise exception 'CHECKIN_INVALID_YES_NO';
        end if;
        if v_answer = '"yes"'::jsonb then v_value := 10; end if;
      elsif v_answer <> '""'::jsonb and v_answer <> '[]'::jsonb then
        v_value := 10;
      end if;
    end if;
    v_total := v_total + v_weight * v_value;
  end loop;
  v_pct := case when v_max > 0 then v_total / v_max * 100 else null end;
  update public.checkin_sessions set responses = p_responses, score_total = v_total,
    score_max = v_max, adherence_percentage = v_pct, status = 'completed', completed_at = now()
  where id = p_session_id;
  perform private.increment_checkin_streak(v_session.patient_id, v_session.nutritionist_id);
  return v_pct;
end;
$function$;

-- The production client still writes a completion directly until the Preview is promoted.
-- Validate and score that legacy path in the database as well.
create or replace function private.guard_checkin_session_update()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare
  v_fields jsonb;
  v_field jsonb;
  v_answer jsonb;
  v_weight numeric;
  v_value numeric;
  v_total numeric := 0;
  v_max numeric := 0;
begin
  if auth.uid() is null then return new; end if;
  if old.patient_id <> auth.uid() or old.status <> 'pending'
    or old.expires_at <= now() or new.status <> 'completed' then
    raise exception 'CHECKIN_UPDATE_NOT_ALLOWED';
  end if;
  if (to_jsonb(new) - array['responses','score_total','score_max','adherence_percentage','status','completed_at'])
    <> (to_jsonb(old) - array['responses','score_total','score_max','adherence_percentage','status','completed_at']) then
    raise exception 'CHECKIN_IMMUTABLE_FIELDS';
  end if;
  if jsonb_typeof(new.responses) <> 'object' then raise exception 'CHECKIN_INVALID_RESPONSES'; end if;
  v_fields := old.fields_snapshot;
  if jsonb_array_length(v_fields) = 0 then
    select coalesce(jsonb_agg(to_jsonb(f) order by f.order_index, f.id), '[]'::jsonb)
    into v_fields from public.checkin_fields f where f.template_id = old.template_id;
  end if;
  if jsonb_array_length(v_fields) = 0 then raise exception 'CHECKIN_WITHOUT_FIELDS'; end if;
  for v_field in select value from jsonb_array_elements(v_fields) loop
    v_answer := new.responses->(v_field->>'id');
    if coalesce((v_field->>'is_required')::boolean, true)
      and (v_answer is null or v_answer in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)) then
      raise exception 'CHECKIN_REQUIRED_FIELD_MISSING';
    end if;
    v_weight := greatest(0, coalesce((v_field->>'score_weight')::numeric, 1));
    v_max := v_max + v_weight * 10;
    v_value := 0;
    if v_answer is not null and v_answer <> 'null'::jsonb then
      if v_field->>'field_type' = 'scale_1_10' then
        if jsonb_typeof(v_answer) = 'array' then v_answer := v_answer->0; end if;
        if jsonb_typeof(v_answer) <> 'number' or (v_answer #>> '{}')::numeric < 1
          or (v_answer #>> '{}')::numeric > 10 then raise exception 'CHECKIN_INVALID_SCALE'; end if;
        v_value := (v_answer #>> '{}')::numeric;
      elsif v_field->>'field_type' = 'yes_no' then
        if v_answer not in ('"yes"'::jsonb, '"no"'::jsonb) then raise exception 'CHECKIN_INVALID_YES_NO'; end if;
        if v_answer = '"yes"'::jsonb then v_value := 10; end if;
      elsif v_answer not in ('""'::jsonb, '[]'::jsonb) then
        v_value := 10;
      end if;
    end if;
    v_total := v_total + v_weight * v_value;
  end loop;
  new.score_total := v_total;
  new.score_max := v_max;
  new.adherence_percentage := case when v_max > 0 then v_total / v_max * 100 else null end;
  new.completed_at := now();
  return new;
end;
$function$;

drop trigger if exists trg_guard_checkin_session_update on public.checkin_sessions;
create trigger trg_guard_checkin_session_update before update on public.checkin_sessions
for each row execute function private.guard_checkin_session_update();

create policy checkin_sessions_no_direct_insert on public.checkin_sessions
  as restrictive for insert to authenticated with check (false);
create policy checkin_sessions_patient_completion on public.checkin_sessions
  as restrictive for update to authenticated
  using (patient_id = (select auth.uid()) and status = 'pending' and expires_at > now())
  with check (patient_id = (select auth.uid()) and status = 'completed');
create policy checkin_sessions_no_direct_delete on public.checkin_sessions
  as restrictive for delete to authenticated using (false);
create policy checkin_schedules_owner_insert on public.checkin_schedules
  as restrictive for insert to authenticated with check (
    nutritionist_id = (select auth.uid()) and exists (
      select 1 from public.checkin_templates t where t.id = template_id
      and t.nutritionist_id = (select auth.uid()) and t.is_active is true));
create policy checkin_schedules_owner_update on public.checkin_schedules
  as restrictive for update to authenticated
  using (nutritionist_id = (select auth.uid()))
  with check (nutritionist_id = (select auth.uid()) and exists (
      select 1 from public.checkin_templates t where t.id = template_id
      and t.nutritionist_id = (select auth.uid()) and t.is_active is true));

revoke all on function private.next_checkin_send_at(text,integer[],time,text,timestamptz) from public, anon, authenticated;
revoke all on function private.dispatch_due_checkins() from public, anon, authenticated;
revoke all on function public.increment_checkin_streak(uuid,uuid) from public, anon, authenticated;
revoke all on function public.link_checkin_template(uuid,uuid,text,text) from public, anon;
revoke all on function public.set_checkin_schedule_active(uuid,boolean) from public, anon;
revoke all on function public.submit_checkin_session(uuid,jsonb) from public, anon;
grant execute on function public.link_checkin_template(uuid,uuid,text,text) to authenticated;
grant execute on function public.set_checkin_schedule_active(uuid,boolean) to authenticated;
grant execute on function public.submit_checkin_session(uuid,jsonb) to authenticated;

select cron.schedule('dispatch-due-checkins', '*/5 * * * *',
  'select private.dispatch_due_checkins();');

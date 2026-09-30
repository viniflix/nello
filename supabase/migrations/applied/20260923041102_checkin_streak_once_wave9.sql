-- Count a successful completion once for both the legacy direct update and the RPC.
create or replace function private.increment_checkin_streak_after_completion()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
begin
  if old.status = 'pending' and new.status = 'completed' then
    perform private.increment_checkin_streak(new.patient_id, new.nutritionist_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_checkin_streak_after_completion on public.checkin_sessions;
create trigger trg_checkin_streak_after_completion
after update of status on public.checkin_sessions
for each row execute function private.increment_checkin_streak_after_completion();

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
  return v_pct;
end;
$function$;

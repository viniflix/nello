create or replace function private.normalize_meal_time(p_value text)
returns time without time zone
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text;
  v_match text[];
  v_hour integer;
  v_minute integer;
  v_second numeric := 0;
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  v_value := lower(regexp_replace(btrim(p_value), '\s+', '', 'g'));
  v_value := replace(v_value, 'h', ':');

  if v_value ~ '^[0-9]{3,4}$' then
    v_value := left(v_value, length(v_value) - 2) || ':' || right(v_value, 2);
  end if;

  v_match := regexp_match(v_value, '^([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}(?:\.[0-9]{1,6})?))?$');
  if v_match is null then
    return null;
  end if;

  v_hour := v_match[1]::integer;
  v_minute := v_match[2]::integer;
  if v_match[3] is not null then
    v_second := v_match[3]::numeric;
  end if;

  if v_hour not between 0 and 23
     or v_minute not between 0 and 59
     or v_second < 0
     or v_second >= 60 then
    return null;
  end if;

  return make_time(v_hour, v_minute, v_second);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

revoke all on function private.normalize_meal_time(text) from public, anon, authenticated;
grant execute on function private.normalize_meal_time(text) to service_role;

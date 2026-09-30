create or replace function private.normalize_meal_time(p_value text)
returns time without time zone
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  if btrim(p_value) !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,6})?)?$' then
    raise exception using
      errcode = '22023',
      message = 'meal_time_invalid',
      hint = 'Use HH:MM ou deixe o horÃ¡rio vazio.';
  end if;

  return btrim(p_value)::time;
end;
$$;

revoke all on function private.normalize_meal_time(text) from public, anon, authenticated;

do $$
declare
  v_original text;
  v_hardened text;
begin
  select pg_get_functiondef('private.upsert_full_meal_plan(bigint,jsonb,jsonb)'::regprocedure)
    into v_original;

  v_hardened := replace(
    v_original,
    '(v_meal->>''meal_time'')::TIME',
    'private.normalize_meal_time(v_meal->>''meal_time'')'
  );

  if v_hardened = v_original then
    raise exception 'ConversÃ£o de meal_time nÃ£o localizada em private.upsert_full_meal_plan';
  end if;

  execute v_hardened;
end;
$$;

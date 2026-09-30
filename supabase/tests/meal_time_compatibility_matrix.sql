do $$
begin
  if private.normalize_meal_time('07:30') <> '07:30'::time then
    raise exception 'canonical_meal_time_failed';
  end if;
  if private.normalize_meal_time('7:30') <> '07:30'::time then
    raise exception 'unpadded_meal_time_failed';
  end if;
  if private.normalize_meal_time('7h30') <> '07:30'::time then
    raise exception 'localized_meal_time_failed';
  end if;
  if private.normalize_meal_time('0730') <> '07:30'::time then
    raise exception 'compact_meal_time_failed';
  end if;
  if private.normalize_meal_time('valor legado inválido') is not null then
    raise exception 'invalid_meal_time_should_be_null';
  end if;
  if has_function_privilege('authenticated', 'private.normalize_meal_time(text)', 'EXECUTE') then
    raise exception 'private_meal_time_normalizer_exposed';
  end if;
end;
$$;

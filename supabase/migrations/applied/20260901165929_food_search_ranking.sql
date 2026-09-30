-- Busca de alimentos por termos, tolerante a acentos, pontuação e fonte inline.
-- Exemplos: "banana", "abacate, cru", "banana taco".

create or replace function public.normalize_food_search(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        translate(
          lower(coalesce(p_value, '')),
          'áàâãäåéèêëíìîïóòôõöúùûüçñ',
          'aaaaaaeeeeiiiiooooouuuucn'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  )
$$;

create or replace function public.search_foods(
  p_query text default null,
  p_source text default null,
  p_scope text default 'public',
  p_groups text[] default null,
  p_calories_min numeric default null,
  p_calories_max numeric default null,
  p_macro text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns setof public.foods
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_normalized_query text := public.normalize_food_search(left(coalesce(p_query, ''), 200));
  v_normalized_requested_source text := public.normalize_food_search(p_source);
  v_requested_source text;
  v_inline_source text;
  v_source_filter text;
  v_scope text := coalesce(public.normalize_food_search(p_scope), 'public');
  v_terms text[] := array[]::text[];
  v_raw_terms text[];
  v_term text;
  v_term_source text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;

  if v_scope not in ('public', 'custom', 'all') then
    raise exception using errcode = '22023', message = 'invalid_food_search_scope';
  end if;

  if p_calories_min is not null and p_calories_max is not null and p_calories_min >= p_calories_max then
    raise exception using errcode = '22023', message = 'invalid_food_search_calorie_range';
  end if;

  if v_normalized_requested_source is null or v_normalized_requested_source in ('all', 'todos') then
    v_requested_source := null;
  else
    v_requested_source := case v_normalized_requested_source
      when 'taco' then 'TACO'
      when 'tbca' then 'TBCA'
      when 'usda' then 'USDA'
      when 'tucunduva' then 'TUCUNDUVA'
      when 'nello' then 'Nello'
      when 'custom' then 'custom'
      when 'meus' then 'custom'
      when 'personalizados' then 'custom'
      else '__invalid__'
    end;
  end if;

  if v_requested_source = '__invalid__' then
    return;
  end if;

  if v_normalized_query is not null then
    v_raw_terms := regexp_split_to_array(v_normalized_query, '\s+');
    foreach v_term in array v_raw_terms loop
      if v_term = '' then
        continue;
      end if;

      v_term_source := case v_term
        when 'taco' then 'TACO'
        when 'tbca' then 'TBCA'
        when 'usda' then 'USDA'
        when 'tucunduva' then 'TUCUNDUVA'
        when 'nello' then 'Nello'
        when 'custom' then 'custom'
        when 'meus' then 'custom'
        when 'personalizados' then 'custom'
        else null
      end;

      if v_term_source is null then
        v_terms := array_append(v_terms, v_term);
      elsif v_inline_source is null then
        v_inline_source := v_term_source;
      elsif v_inline_source <> v_term_source then
        return;
      end if;
    end loop;
  end if;

  if v_requested_source is not null and v_inline_source is not null and v_requested_source <> v_inline_source then
    return;
  end if;

  v_source_filter := coalesce(v_requested_source, v_inline_source);

  if v_scope = 'public' and v_source_filter = 'custom' then
    return;
  end if;

  if v_scope = 'custom' and v_source_filter is not null and v_source_filter <> 'custom' then
    return;
  end if;

  return query
  with candidates as (
    select
      f as food,
      public.normalize_food_search(f.name) as normalized_name,
      public.normalize_food_search(concat_ws(' ', f.name, f.group, f.description)) as normalized_text
    from public.foods f
    where f.is_active = true
      and (v_scope <> 'public' or f.source <> 'custom')
      and (v_scope <> 'custom' or (f.source = 'custom' and f.nutritionist_id = auth.uid()))
      and (v_scope <> 'all' or f.source <> 'custom' or f.nutritionist_id = auth.uid())
      and (v_source_filter is null or f.source = v_source_filter)
      and (
        coalesce(array_length(p_groups, 1), 0) = 0
        or exists (
          select 1
          from unnest(p_groups) g
          where public.normalize_food_search(f.group) like '%' || public.normalize_food_search(g) || '%'
        )
      )
      and (p_calories_min is null or f.calories >= p_calories_min)
      and (p_calories_max is null or f.calories < p_calories_max)
      and (
        p_macro is null
        or (p_macro = 'protein' and coalesce(f.protein, 0) >= 15)
        or (p_macro = 'carbs' and coalesce(f.carbs, 0) >= 40)
        or (p_macro = 'fat' and coalesce(f.fat, 0) >= 15)
        or (p_macro = 'fiber' and coalesce(f.fiber, 0) >= 5)
      )
  )
  select (c.food).*
  from candidates c
  where not exists (
    select 1
    from unnest(v_terms) t(term)
    where c.normalized_text !~ ('(^| )' || t.term)
  )
  order by
    case
      when array_length(v_terms, 1) is null then 0
      when c.normalized_name = array_to_string(v_terms, ' ') then 0
      when c.normalized_name like array_to_string(v_terms, ' ') || ' %' then 1
      when c.normalized_name like v_terms[1] || '%' then 2
      when c.normalized_name like '%' || array_to_string(v_terms, ' ') || '%' then 3
      when c.normalized_name ~ ('(^| )' || v_terms[1]) then 4
      else 5
    end,
    length(c.normalized_name),
    (c.food).name
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.normalize_food_search(text) from public, anon, authenticated;
grant execute on function public.normalize_food_search(text) to authenticated, service_role;

revoke all on function public.search_foods(text, text, text, text[], numeric, numeric, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_foods(text, text, text, text[], numeric, numeric, text, integer, integer) to authenticated, service_role;

create index if not exists reference_foods_source_normalized_name_idx
  on public.reference_foods (source, public.normalize_food_search(name) text_pattern_ops);

create index if not exists nutritionist_foods_owner_normalized_name_idx
  on public.nutritionist_foods (nutritionist_id, public.normalize_food_search(name) text_pattern_ops);

-- Harden SECURITY DEFINER functions exposed through the public API schema.
--
-- Supabase's security advisor warns when SECURITY DEFINER functions are directly
-- executable from exposed schemas such as public. The app calls many RPCs by
-- their public names, so we preserve those public signatures as SECURITY
-- INVOKER wrappers and move the privileged implementations to a non-exposed
-- private schema.

create schema if not exists private;

grant usage on schema private to anon, authenticated, service_role;

do $$
declare
  r record;
  call_args text;
  wrapper_sql text;
  moved text[] := array[]::text[];
begin
  for r in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    execute format('alter function public.%I(%s) set schema private', r.proname, r.identity_args);
    moved := array_append(moved, r.proname || '(' || r.identity_args || ')');
  end loop;

  grant execute on all functions in schema private to anon, authenticated, service_role;

  for r in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      pg_get_function_arguments(p.oid) as full_args,
      pg_get_function_result(p.oid) as result_type,
      p.pronargs
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef = true
      and pg_get_function_result(p.oid) <> 'trigger'
      and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = any(moved)
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    select coalesce(string_agg('$' || gs::text, ', ' order by gs), '')
      into call_args
    from generate_series(1, r.pronargs) gs;

    wrapper_sql := format(
      'create or replace function public.%I(%s) returns %s language sql security invoker set search_path = public, private, pg_temp as $wrapper$ %s private.%I(%s); $wrapper$',
      r.proname,
      r.full_args,
      r.result_type,
      case
        when r.result_type ilike 'TABLE(%' or r.result_type ilike 'SETOF %' then 'select * from'
        else 'select'
      end,
      r.proname,
      call_args
    );

    execute wrapper_sql;
  end loop;
end $$;

-- The advisor explicitly flagged this helper as missing a fixed search_path.
alter function public.convert_custom_measure_to_grams() set search_path = public, pg_temp;


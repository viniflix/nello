begin;

do $$
begin
  if has_schema_privilege('public', 'public', 'create') then
    raise exception 's02_public_still_creates_in_public';
  end if;
  if has_schema_privilege('anon', 'public', 'create') then
    raise exception 's02_anon_still_creates_in_public';
  end if;
  if has_schema_privilege('authenticated', 'public', 'create') then
    raise exception 's02_authenticated_still_creates_in_public';
  end if;
  if not has_schema_privilege('anon', 'public', 'usage')
     or not has_schema_privilege('authenticated', 'public', 'usage') then
    raise exception 's02_public_schema_usage_was_removed';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_my_care_relationship()',
    'execute'
  ) then
    raise exception 's02_authenticated_rpc_contract_was_revoked';
  end if;
  if not has_function_privilege(
    'anon',
    'public.get_anamnesis_by_token(uuid)',
    'execute'
  ) then
    raise exception 's02_public_anamnesis_contract_was_revoked';
  end if;
end;
$$;

set local role authenticated;
do $$
begin
  begin
    execute 'create table public.s02_forbidden_authenticated(id integer)';
    raise exception 's02_authenticated_created_public_object';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    execute 'create table public.s02_forbidden_anon(id integer)';
    raise exception 's02_anon_created_public_object';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;


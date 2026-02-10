-- Fase 7: otimizar policies (auth_rls_initplan) de forma automatica
-- Objetivo: reescrever policies com auth.uid()/auth.role()/current_setting() usando subselect.
-- Mantem a logica original das policies.

begin;

do $$
declare
  r record;
  v_cmd text;
  v_roles text;
  v_roles_list text;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select
      p.polname,
      n.nspname,
      c.relname,
      p.polcmd,
      p.polroles,
      pg_get_expr(p.polqual, p.polrelid) as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        (pg_get_expr(p.polqual, p.polrelid) ilike '%auth.uid()%')
        or (pg_get_expr(p.polqual, p.polrelid) ilike '%auth.role()%')
        or (pg_get_expr(p.polqual, p.polrelid) ilike '%current_setting(%')
        or (pg_get_expr(p.polwithcheck, p.polrelid) ilike '%auth.uid()%')
        or (pg_get_expr(p.polwithcheck, p.polrelid) ilike '%auth.role()%')
        or (pg_get_expr(p.polwithcheck, p.polrelid) ilike '%current_setting(%')
      )
  loop
    v_cmd :=
      case r.polcmd
        when 'r' then 'select'
        when 'a' then 'insert'
        when 'w' then 'update'
        when 'd' then 'delete'
        else 'all'
      end;

    select string_agg(quote_ident(rolname), ', ')
      into v_roles
    from pg_roles
    where oid = any(r.polroles);

    if v_roles is null then
      v_roles_list := 'public';
    else
      v_roles_list := v_roles;
    end if;

    v_using := r.using_expr;
    v_check := r.check_expr;

    if v_using is not null then
      v_using := regexp_replace(v_using, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
      v_using := regexp_replace(v_using, 'auth\\.role\\(\\)', '(select auth.role())', 'g');
      v_using := regexp_replace(v_using, 'current_setting\\(([^\\)]*)\\)', '(select current_setting(\\1))', 'g');
    end if;

    if v_check is not null then
      v_check := regexp_replace(v_check, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g');
      v_check := regexp_replace(v_check, 'auth\\.role\\(\\)', '(select auth.role())', 'g');
      v_check := regexp_replace(v_check, 'current_setting\\(([^\\)]*)\\)', '(select current_setting(\\1))', 'g');
    end if;

    execute format('drop policy if exists %I on %I.%I', r.polname, r.nspname, r.relname);

    v_sql := format('create policy %I on %I.%I for %s to %s', r.polname, r.nspname, r.relname, v_cmd, v_roles_list);
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end $$;

commit;

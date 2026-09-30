create or replace function public.log_bug_report(
    p_error_type character varying default 'Error'::character varying,
    p_error_message text default null::text,
    p_stack_trace text default null::text,
    p_route text default null::text,
    p_user_id uuid default null::uuid,
    p_user_email text default null::text,
    p_user_name text default null::text,
    p_user_type character varying default null::character varying,
    p_user_agent text default null::text,
    p_console_log jsonb default '[]'::jsonb,
    p_metadata jsonb default '{}'::jsonb,
    p_component_stack text default null::text,
    p_source_file text default null::text,
    p_line_number integer default null::integer,
    p_column_number integer default null::integer
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
    v_id uuid;
    v_severity varchar(20);
begin
    if p_error_type in ('TypeError', 'ReferenceError', 'SyntaxError', 'RangeError') then
        v_severity := 'critical';
    elsif p_error_message ilike '%warning%' or p_error_message ilike '%deprecated%' then
        v_severity := 'warning';
    else
        v_severity := 'error';
    end if;

    insert into public.bug_reports (
        error_type,
        error_message,
        stack_trace,
        route,
        user_id,
        user_email,
        user_name,
        user_type,
        user_agent,
        console_log,
        metadata,
        component_stack,
        source_file,
        line_number,
        column_number,
        severity,
        bug_type
    ) values (
        p_error_type,
        p_error_message,
        p_stack_trace,
        p_route,
        p_user_id,
        p_user_email,
        p_user_name,
        p_user_type,
        p_user_agent,
        p_console_log,
        p_metadata,
        p_component_stack,
        p_source_file,
        p_line_number,
        p_column_number,
        v_severity,
        case
            when p_source_file like '%/api/%' or p_source_file like '%supabase%' then 'api'
            else 'frontend'
        end
    )
    returning id into v_id;

    return v_id;
end;
$function$;

create or replace function public.update_bug_reports_updated_at()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

alter policy "Users can insert bug reports" on public.bug_reports
  rename to "Users can insert bug reports (deprecated)";

create policy "Users can insert bug reports" on public.bug_reports
  for insert
  to authenticated
  with check (
    user_id is null
    or user_id = (select auth.uid())
  );

drop policy if exists "Admins can view all bug reports" on public.bug_reports;
create policy "Admins can view all bug reports" on public.bug_reports
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.is_admin = true
    )
  );

drop policy if exists "Admins can update bug reports" on public.bug_reports;
create policy "Admins can update bug reports" on public.bug_reports
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.is_admin = true
    )
  );

drop policy if exists "Admins can delete bug reports" on public.bug_reports;
create policy "Admins can delete bug reports" on public.bug_reports
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = (select auth.uid())
        and user_profiles.is_admin = true
    )
  );

-- clean up deprecated policy after new one is in place
DROP POLICY IF EXISTS "Users can insert bug reports (deprecated)" ON public.bug_reports;

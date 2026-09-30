-- Read-only RPCs and RLS policies need a STABLE predicate. Clinical writes
-- acquire the locking variant through a table trigger at the mutation point.
create or replace function private.can_write_active_care_episode(p_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.care_episodes e
    where e.id=p_episode_id
      and e.status='active'
      and (
        (e.is_simulation and e.nutritionist_id=(select auth.uid()))
        or (
          not e.is_simulation
          and e.student_id is null
          and e.supervisor_id is null
          and e.nutritionist_id=(select auth.uid())
          and exists (
            select 1 from public.professional_verifications pv
            where pv.user_id=e.nutritionist_id
              and pv.professional_role='nutritionist'
              and pv.status='approved'
              and pv.valid_until>now()
          )
        )
        or (
          not e.is_simulation
          and (select auth.uid()) in (e.student_id,e.supervisor_id)
          and exists (
            select 1
            from public.student_supervisions s
            join public.professional_verifications student_pv on student_pv.user_id=s.student_id
            join public.professional_verifications supervisor_pv on supervisor_pv.user_id=s.supervisor_id
            where s.student_id=e.student_id
              and s.supervisor_id=e.supervisor_id
              and s.status='active'
              and student_pv.professional_role='student'
              and student_pv.status='approved'
              and student_pv.valid_until>now()
              and supervisor_pv.professional_role='nutritionist'
              and supervisor_pv.status='approved'
              and supervisor_pv.valid_until>now()
          )
        )
      )
  )
$$;

create or replace function private.lock_and_can_write_active_care_episode(p_episode_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_episode public.care_episodes%rowtype;
begin
  if v_actor is null then return false; end if;

  select e.* into v_episode
  from public.care_episodes e
  where e.id=p_episode_id
  for share;
  if not found or v_episode.status<>'active' then return false; end if;

  if v_episode.is_simulation then
    return v_episode.nutritionist_id=v_actor;
  end if;

  if v_episode.student_id is null and v_episode.supervisor_id is null then
    if v_episode.nutritionist_id<>v_actor then return false; end if;
    perform 1
    from public.professional_verifications pv
    where pv.user_id=v_episode.nutritionist_id
      and pv.professional_role='nutritionist'
      and pv.status='approved'
      and pv.valid_until>now()
    for share of pv;
    return found;
  end if;

  if v_actor not in (v_episode.student_id,v_episode.supervisor_id) then return false; end if;

  perform 1
  from public.student_supervisions s
  join public.professional_verifications student_pv on student_pv.user_id=s.student_id
  join public.professional_verifications supervisor_pv on supervisor_pv.user_id=s.supervisor_id
  where s.student_id=v_episode.student_id
    and s.supervisor_id=v_episode.supervisor_id
    and s.status='active'
    and student_pv.professional_role='student'
    and student_pv.status='approved'
    and student_pv.valid_until>now()
    and supervisor_pv.professional_role='nutritionist'
    and supervisor_pv.status='approved'
    and supervisor_pv.valid_until>now()
  for share of s,student_pv,supervisor_pv;
  return found;
end
$$;

revoke all on function private.lock_and_can_write_active_care_episode(uuid) from public,anon,authenticated;

create or replace function private.enforce_clinical_record_write_lock()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is not null
    and exists (
      select 1 from public.care_episodes e
      where e.id=new.care_episode_id and e.status='active'
    )
    and not private.lock_and_can_write_active_care_episode(new.care_episode_id) then
    raise exception using errcode='42501',message='episode_write_forbidden';
  end if;
  return new;
end
$$;

revoke all on function private.enforce_clinical_record_write_lock() from public,anon,authenticated;
drop trigger if exists trg_clinical_records_write_lock on public.clinical_records;
create trigger trg_clinical_records_write_lock
before insert or update on public.clinical_records
for each row execute function private.enforce_clinical_record_write_lock();

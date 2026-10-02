-- Stable ties for range pagination; existing caller, active-actor and snapshot boundaries preserved.
begin;
-- Matches the actual owner-scoped keyset (including timestamp ties), instead
-- of sorting all read/unread/type partitions for each notification window.
create index if not exists notifications_user_created_id_idx
  on public.notifications(user_id, created_at desc, id desc);
CREATE OR REPLACE FUNCTION public.list_nutritionist_care_patients()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with caller as (
    select auth.uid() as id
  ), ranked as (
    select
      ce.*,
      row_number() over (
        partition by ce.patient_id
        order by (ce.status = 'active') desc, ce.started_at desc, ce.id desc
      ) as position,
      count(*) over (partition by ce.patient_id) as episode_count
    from public.care_episodes ce, caller c
    where ce.nutritionist_id = c.id
  )
  select jsonb_strip_nulls(
    (case when r.status = 'active'
      then private.minimal_patient_snapshot(r.patient_id)
      else coalesce(nullif(r.patient_snapshot, '{}'::jsonb), private.minimal_patient_snapshot(r.patient_id))
    end)
    || jsonb_build_object(
      'id', r.patient_id,
      'access_status', case when r.status='ended' then 'archived'
        when not exists(select 1 from auth.users au where au.id=r.patient_id) then 'offline'
        when exists(select 1 from auth.users au where au.id=r.patient_id and au.email_confirmed_at is not null) then 'ready'
        else 'awaiting_email_confirmation' end,
      'care_episode_id', r.id,
      'care_status', r.status,
      'link_status', r.status,
      'is_active', r.status = 'active',
      'arquivadoHistorico', r.status = 'ended',
      'episode_count', r.episode_count,
      'care_started_at', r.started_at,
      'care_ended_at', r.ended_at,
      'care_end_reason', r.end_reason,
      'created_at', r.started_at
    )
  )
  from ranked r
  where r.position = 1
    and r.end_reason is distinct from 'empty_profile_removed'
    and exists (
      select 1 from public.user_profiles caller_profile
      where caller_profile.id = auth.uid()
        and caller_profile.user_type = 'nutritionist' and private.wave05_active_actor()
    )
  order by (r.status = 'active') desc, r.started_at desc, r.patient_id desc;
$function$;

commit;

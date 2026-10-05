-- Forward repair: business conflicts use HTTP409, never PostgreSQL serialization retries.
create or replace function public.admin_triage_incident(p_issue_id text,p_expected_revision bigint,p_status text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; updated private.admin_incident_triage;
begin
 if not private.admin_action_allowed('triage') then raise exception using errcode='42501',message='admin_action_denied'; end if;
 if p_issue_id is null or p_issue_id !~ '^[0-9]{1,30}$' or p_status is null or p_status not in ('new','investigating','monitoring','closed')
 or p_reason is null or length(btrim(p_reason)) not between 10 and 500 or p_expected_revision is null or p_expected_revision<0
 then raise exception using errcode='22023',message='invalid_triage'; end if;
 -- Serializes first insert as well as existing transitions; a stale caller cannot overwrite.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-incident:'||p_issue_id,0));
 select revision into current_revision from private.admin_incident_triage where issue_id=p_issue_id for update;
 if coalesce(current_revision,0)<>p_expected_revision then raise exception using errcode='PT409',message='triage_revision_conflict'; end if;
 insert into private.admin_incident_triage(issue_id,status,reason,updated_by)
 values(p_issue_id,p_status,btrim(p_reason),auth.uid())
 on conflict(issue_id) do update set status=excluded.status,reason=excluded.reason,revision=private.admin_incident_triage.revision+1,updated_at=now(),updated_by=auth.uid()
 returning * into updated;
 insert into private.admin_incident_events(issue_id,status,reason,revision,actor_id)
 values(updated.issue_id,updated.status,updated.reason,updated.revision,auth.uid());
 return to_jsonb(updated)-'updated_by';
end; $$;
revoke all on function public.admin_triage_incident(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.admin_triage_incident(text,bigint,text,text) to authenticated;

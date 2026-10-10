begin;

-- Forward-only evidence: no backfill, clinical payload, credential or free text.
-- Identifiers intentionally have no FK: account/resource deletion must not erase
-- history or block an otherwise authorized lifecycle operation.
create table private.security_audit_events (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid,
 origin text not null check(origin in ('authenticated','service_role','database')),
 tenant_id uuid,
 resource_type text not null check(resource_type in ('financial_transactions','services','user_profiles','admin_operators')),
 resource_id text not null,
 action text not null check(action in ('INSERT','UPDATE','DELETE')),
 before_state jsonb,
 after_state jsonb,
 changed_fields text[] not null
);
create index security_audit_tenant_cursor on private.security_audit_events(tenant_id,id desc);
create index security_audit_resource_cursor on private.security_audit_events(resource_type,id desc);
create index security_audit_time on private.security_audit_events(occurred_at);
alter table private.security_audit_events enable row level security;
revoke all on private.security_audit_events from public,anon,authenticated,service_role;
revoke all on sequence private.security_audit_events_id_seq from public,anon,authenticated,service_role;

create function private.security_audit_snapshot(p_resource text,p_row jsonb)
returns jsonb language sql immutable set search_path='' as $function$
 select case when p_row is null then null else coalesce((select jsonb_object_agg(key,value)
 from jsonb_each(p_row) where key=any(case p_resource
 when 'financial_transactions' then array['amount','net_amount','fee_percentage','status','type','transaction_date','due_date','paid_at','refunded_at','updated_at']
 when 'services' then array['price','duration_minutes','active','updated_at']
 when 'user_profiles' then array['user_type','is_active','is_admin','nutritionist_id']
 when 'admin_operators' then array['role','granted_at','revoked_at']
 else array[]::text[] end)), '{}'::jsonb) end;
$function$;
revoke all on function private.security_audit_snapshot(text,jsonb) from public,anon,authenticated,service_role;

create function private.capture_security_audit()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
 old_row jsonb; new_row jsonb; old_state jsonb; new_state jsonb;
 actor uuid:=auth.uid(); origin_ text; fields text[]; tenant uuid; resource text;
begin
 if tg_op<>'INSERT' then old_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then new_row:=to_jsonb(new);end if;
 old_state:=private.security_audit_snapshot(tg_table_name,old_row);
 new_state:=private.security_audit_snapshot(tg_table_name,new_row);
 -- Profiles contain many clinical/contact fields. Audit only authorization changes.
 if tg_table_name='user_profiles' and old_state is not distinct from new_state then return null;end if;
 if tg_table_name='user_profiles' then
  select coalesce(array_agg(k order by k),'{}') into fields from jsonb_object_keys(coalesce(new_state,old_state)) k
  where old_state->k is distinct from new_state->k;
 else
  select coalesce(array_agg(k order by k),'{}') into fields from jsonb_object_keys(coalesce(new_row,old_row)) k
  where old_row->k is distinct from new_row->k and k not in ('created_at','updated_at');
 end if;
 if tg_op='UPDATE' and cardinality(fields)=0 then return null;end if;
 origin_:=case when coalesce(auth.role(),'')='service_role' then 'service_role'
  when actor is not null then 'authenticated' else 'database' end;
 tenant:=case when tg_table_name in ('financial_transactions','services')
  then (coalesce(new_row,old_row)->>'nutritionist_id')::uuid else null end;
 resource:=coalesce(new_row,old_row)->>case when tg_table_name='admin_operators' then 'user_id' else 'id' end;
 begin
  insert into private.security_audit_events(actor_id,origin,tenant_id,resource_type,resource_id,action,before_state,after_state,changed_fields)
  values(actor,origin_,tenant,tg_table_name,resource,tg_op,old_state,new_state,fields);
 exception when others then
  -- A ledger outage is a technical 503, never an expected authorization/business
  -- rejection. Do not return the failed row, SQL text or underlying error detail.
  raise exception using errcode='PT503',message='security_audit_unavailable';
 end;
 return null;
end;
$function$;
revoke all on function private.capture_security_audit() from public,anon,authenticated,service_role;
create trigger security_audit after insert or update or delete on public.financial_transactions for each row execute function private.capture_security_audit();
create trigger security_audit after insert or update or delete on public.services for each row execute function private.capture_security_audit();
create trigger security_audit after insert or update or delete on public.user_profiles for each row execute function private.capture_security_audit();
create trigger security_audit after insert or update or delete on private.admin_operators for each row execute function private.capture_security_audit();

create function public.financial_audit_history(p_before bigint default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 perform private.wave05_require_active_actor();
 if not private.has_current_clinical_capacity(auth.uid()) then raise exception using errcode='42501',message='professional_required';end if;
 if p_limit is null or p_limit not between 1 and 100 or (p_before is not null and p_before<1) then raise exception using errcode='22023',message='invalid_audit_page';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(e) order by id desc) from
 (select id,occurred_at,actor_id,origin,resource_type,resource_id,action,before_state,after_state,changed_fields
 from private.security_audit_events where tenant_id=auth.uid() and resource_type in ('financial_transactions','services')
 and (p_before is null or id<p_before) order by id desc limit p_limit) e),'[]'::jsonb));
end;
$function$;
revoke all on function public.financial_audit_history(bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.financial_audit_history(bigint,integer) to authenticated;

-- Internal alerts are evidence to investigate, not a claim of a failed login or
-- delivered notification. Re-evaluation is idempotent and transaction-safe.
create table private.security_alerts (
 id bigint generated always as identity primary key,
 rule text not null check(rule in ('operator_privilege_changed','operator_mfa_removed','password_change_volume','mfa_activity_volume','admin_mfa_gate_volume')),
 subject_id uuid not null,
 window_start timestamptz not null,
 severity text not null check(severity in ('warning','critical')),
 occurrences bigint not null check(occurrences>0),
 first_detected_at timestamptz not null default clock_timestamp(),
 last_detected_at timestamptz not null default clock_timestamp(),
 unique(rule,subject_id,window_start)
);
create index security_alerts_recent on private.security_alerts(last_detected_at desc,id desc);
alter table private.security_alerts enable row level security;
revoke all on private.security_alerts from public,anon,authenticated,service_role;
revoke all on sequence private.security_alerts_id_seq from public,anon,authenticated,service_role;
create table private.security_monitor_state (
 singleton boolean primary key default true check(singleton),
 started_at timestamptz not null default now(),
 last_evaluated_at timestamptz
);
alter table private.security_monitor_state enable row level security;
revoke all on private.security_monitor_state from public,anon,authenticated,service_role;
insert into private.security_monitor_state(singleton) values(true);

create function private.evaluate_security_alerts()
returns void language plpgsql security definer set search_path='' as $function$
declare since_ timestamptz; until_ timestamptz:=clock_timestamp();
begin
 -- Serialize cron and retries; no watermark can advance before the transaction commits.
 perform pg_advisory_xact_lock(hashtextextended('nello-security-alerts',0));
 select greatest(started_at,date_trunc('hour',coalesce(last_evaluated_at,started_at))-interval '1 hour') into since_ from private.security_monitor_state where singleton for update;
 with raw_auth as (
  select payload->>'action' action,case when payload->>'actor_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then (payload->>'actor_id')::uuid end subject,created_at
  from auth.audit_log_entries where created_at>=since_ and created_at<=until_
  and payload->>'action' in ('factor_unenrolled','user_updated_password','verification_attempted')
 ), auth_signals as (
  select case when action='factor_unenrolled' then 'operator_mfa_removed'
   when action='user_updated_password' then 'password_change_volume' else 'mfa_activity_volume' end rule,
   subject,date_trunc('hour',created_at) bucket,count(*) n
  from raw_auth where subject is not null and (action<>'factor_unenrolled' or exists(select 1 from private.admin_operators where user_id=subject))
  group by action,subject,date_trunc('hour',created_at)
  having count(*)>=case when action='factor_unenrolled' then 1 when action='user_updated_password' then 5 else 10 end
 ), signals as (
  select rule,subject,bucket,n from auth_signals
  union all
  select 'operator_privilege_changed',resource_id::uuid,date_trunc('hour',occurred_at),count(*)
  from private.security_audit_events where resource_type='admin_operators' and occurred_at>=since_ and occurred_at<=until_ group by 2,3
  union all
  select 'admin_mfa_gate_volume',operator_id,hour_bucket,sum(attempts)
  from private.admin_access_events where outcome='mfa_required' and hour_bucket>=date_trunc('hour',since_) and last_seen_at>=since_
  group by 2,3 having sum(attempts)>=10
 )
 insert into private.security_alerts(rule,subject_id,window_start,severity,occurrences)
 select rule,subject,bucket,case when rule in ('operator_privilege_changed','operator_mfa_removed') then 'critical' else 'warning' end,n from signals
 on conflict(rule,subject_id,window_start) do update set occurrences=greatest(private.security_alerts.occurrences,excluded.occurrences),
 last_detected_at=case when excluded.occurrences>private.security_alerts.occurrences then clock_timestamp() else private.security_alerts.last_detected_at end;
 update private.security_monitor_state set last_evaluated_at=clock_timestamp() where singleton;
end;
$function$;
revoke all on function private.evaluate_security_alerts() from public,anon,authenticated,service_role;

create function public.admin_security_activity(p_before bigint default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if not private.admin_action_allowed('read') then raise exception using errcode='42501',message='admin_mfa_required';end if;
 if p_limit is null or p_limit not between 1 and 100 or (p_before is not null and p_before<1) then raise exception using errcode='22023',message='invalid_audit_page';end if;
 return jsonb_build_object('schema_version',1,
 'monitor',(select jsonb_build_object('started_at',started_at,'last_evaluated_at',last_evaluated_at,
 'external_delivery_configured',false,'failed_login_source_available',false) from private.security_monitor_state where singleton),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by id desc) from
 (select id,occurred_at,actor_id,origin,resource_type,resource_id,action,before_state,after_state,changed_fields
 from private.security_audit_events where resource_type in ('user_profiles','admin_operators')
 and (p_before is null or id<p_before) order by id desc limit p_limit) e),'[]'::jsonb),
 'alerts',coalesce((select jsonb_agg(to_jsonb(a) order by last_detected_at desc,id desc) from
 (select id,rule,subject_id,window_start,severity,occurrences,first_detected_at,last_detected_at from private.security_alerts
 order by last_detected_at desc,id desc limit 25) a),'[]'::jsonb));
end;
$function$;
revoke all on function public.admin_security_activity(bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_security_activity(bigint,integer) to authenticated;

-- Provider scheduler exists only in its configured database. Isolated SQL clones
-- exercise evaluation directly and never schedule work in the preserved local DB.
do $schedule$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('nello-security-alerts','*/5 * * * *','select private.evaluate_security_alerts();');
 end if;
end $schedule$;
commit;

-- Additive administrative workspace. No clinical rows are mutated.
create or replace function private.admin_action_allowed(p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.is_admin() and exists(select 1 from private.admin_operators
 where user_id=auth.uid() and revoked_at is null
 and (p_action='read' or (p_action='triage' and role in ('owner','operator'))));
$$;
revoke all on function private.admin_action_allowed(text) from public,anon,authenticated;

create table private.admin_incident_triage (
 issue_id text primary key check(issue_id ~ '^[0-9]{1,30}$'),
 status text not null check(status in ('new','investigating','monitoring','closed')),
 reason text not null check(length(btrim(reason)) between 10 and 500),
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id) on delete restrict
);
create table private.admin_incident_events (
 id bigint generated always as identity primary key,
 issue_id text not null references private.admin_incident_triage(issue_id) on delete restrict,
 status text not null,
 reason text not null,
 revision bigint not null,
 actor_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(issue_id,revision)
);
alter table private.admin_incident_triage enable row level security;
alter table private.admin_incident_events enable row level security;
revoke all on private.admin_incident_triage,private.admin_incident_events from public,anon,authenticated;

create function public.admin_incident_state(p_issue_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if not private.admin_action_allowed('read') then raise exception using errcode='42501',message='admin_mfa_required'; end if;
 if p_issue_id is null or p_issue_id !~ '^[0-9]{1,30}$' then raise exception using errcode='22023',message='invalid_issue'; end if;
 return jsonb_build_object('can_triage',private.admin_action_allowed('triage'),
 'item',(select to_jsonb(t)-'updated_by' from private.admin_incident_triage t where issue_id=p_issue_id),
 'events',coalesce((select jsonb_agg(to_jsonb(e)-'actor_id' order by revision desc) from
 (select id,issue_id,status,reason,revision,created_at from private.admin_incident_events where issue_id=p_issue_id order by revision desc limit 30) e),'[]'::jsonb));
end; $$;
create function public.admin_triage_incident(p_issue_id text,p_expected_revision bigint,p_status text,p_reason text)
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
 if coalesce(current_revision,0)<>p_expected_revision then raise exception using errcode='40001',message='triage_revision_conflict'; end if;
 insert into private.admin_incident_triage(issue_id,status,reason,updated_by)
 values(p_issue_id,p_status,btrim(p_reason),auth.uid())
 on conflict(issue_id) do update set status=excluded.status,reason=excluded.reason,revision=private.admin_incident_triage.revision+1,updated_at=now(),updated_by=auth.uid()
 returning * into updated;
 insert into private.admin_incident_events(issue_id,status,reason,revision,actor_id)
 values(updated.issue_id,updated.status,updated.reason,updated.revision,auth.uid());
 return to_jsonb(updated)-'updated_by';
end; $$;

create function public.admin_operational_briefing()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if not private.admin_action_allowed('read') then raise exception using errcode='42501',message='admin_mfa_required'; end if;
 with eligible as (select id,user_type from public.user_profiles where is_simulation is not true),
 privacy as(select d.* from public.data_subject_requests d join eligible e on e.id=d.subject_id where d.status in ('submitted','triaged','in_progress')),
 verification as(select v.* from public.professional_verifications v join eligible e on e.id=v.user_id where v.status in ('pending','submitted','under_review')),
 plans as(select m.id,m.is_draft,m.prescription_status from public.meal_plans m join eligible n on n.id=m.nutritionist_id join eligible p on p.id=m.patient_id
 where m.is_template is not true and m.archived_at is null and m.created_at>=now()-interval '30 days' and m.created_at<=now())
 select jsonb_build_object('schema_version',1,'generated_at',now(),'data_through',now(),'last_success_at',now(),'source','Supabase · registros operacionais',
 'timezone','America/Fortaleza','population','Contas não marcadas como simulação; pacientes e profissionais vinculados também são filtrados.',
 'window_days',30,'can_triage',private.admin_action_allowed('triage'),
 'counts',jsonb_build_object('nutritionists',(select count(*) from eligible where user_type='nutritionist'),'patients',(select count(*) from eligible where user_type='patient'),
 'plans_draft_30d',(select count(*) from plans where is_draft is true),'plans_confirmed_30d',(select count(*) from plans where is_draft is not true and prescription_status='confirmed')),
 'queues',jsonb_build_array(
 jsonb_build_object('key','privacy','label','Solicitações de privacidade','count',(select count(*) from privacy),'overdue',(select count(*) from privacy where due_at<now()),'due_soon',(select count(*) from privacy where due_at>=now() and due_at<=now()+interval '2 days'),'oldest_at',(select min(created_at) from privacy),'route','/admin/privacy','source','data_subject_requests'),
 jsonb_build_object('key','verifications','label','Verificações profissionais','count',(select count(*) from verification),'overdue',null,'due_soon',null,'oldest_at',(select min(created_at) from verification),'route','/admin/verifications','source','professional_verifications'),
 jsonb_build_object('key','incidents','label','Incidentes em investigação','count',(select count(*) from private.admin_incident_triage where status='investigating'),'overdue',null,'due_soon',null,'oldest_at',(select min(updated_at) from private.admin_incident_triage where status='investigating'),'route','/admin/bugs','source','triagem interna · não altera o Sentry')),
 'invariants',jsonb_build_array(
 jsonb_build_object('key','invitation_delivery','state','not_instrumented','label','Entrega de convites','detail','Envio aceito não confirma entrega. Não há callback reconciliado de entrega neste agregado.'),
 jsonb_build_object('key','document_outcome','state','not_instrumented','label','Geração de documentos','detail','Sem ledger completo de tentativas/resultados, não é possível concluir que um documento falhou.')))
 into result;
 return result;
end; $$;
revoke all on function public.admin_operational_briefing(),public.admin_incident_state(text),public.admin_triage_incident(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.admin_operational_briefing(),public.admin_incident_state(text),public.admin_triage_incident(text,bigint,text,text) to authenticated;

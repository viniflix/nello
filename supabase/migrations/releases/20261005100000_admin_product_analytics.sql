-- Prospective, server-owned operational metadata; never a copy of clinical content.
-- The mutable/client-writable activity log is deliberately not a confirmation ledger.
create table private.admin_metric_definition (
 id boolean primary key default true check(id),
 version integer not null default 1 check(version=1),
 capture_started_at timestamptz not null default now()
);
insert into private.admin_metric_definition(id) values(true);
create table private.admin_work_events (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id) on delete cascade,
 episode_id uuid references public.care_episodes(id) on delete cascade,
 kind text not null check(kind in ('plan_published','patient_diary','appointment_saved','anthropometry_saved','energy_saved')),
 source_key text not null check(length(source_key) between 1 and 180),
 occurred_at timestamptz not null default now(),
 unique(kind,source_key)
);
create index admin_work_events_actor_time on private.admin_work_events(actor_id,occurred_at);
create index admin_work_events_time on private.admin_work_events(occurred_at);
alter table private.admin_metric_definition enable row level security;
alter table private.admin_work_events enable row level security;
revoke all on private.admin_metric_definition,private.admin_work_events from public,anon,authenticated;

create function private.admin_capture_publication()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_active is true and new.is_draft is not true and new.is_template is not true
 and new.prescription_status in ('finalized','signed') and new.archived_at is null
 and new.confirmed_at is not null and auth.uid()=new.nutritionist_id and new.confirmed_by=auth.uid()
 and exists(select 1 from public.care_episodes e where e.id=new.care_episode_id and e.patient_id=new.patient_id
  and e.nutritionist_id=new.nutritionist_id and e.status='active' and e.is_simulation is not true)
 then
  insert into private.admin_work_events(actor_id,episode_id,kind,source_key)
  values(new.nutritionist_id,new.care_episode_id,'plan_published',new.id::text||':'||extract(epoch from new.confirmed_at)::text)
  on conflict(kind,source_key) do nothing;
 end if;
 return new;
end; $$;
create trigger admin_publication_capture after insert or update of is_active,is_draft,prescription_status,confirmed_at
 on public.meal_plans for each row execute function private.admin_capture_publication();

create function private.admin_capture_work_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_kind text; v_episode uuid; v_patient uuid; v_id bigint;
begin
 v_kind:=case new.operation when 'clinical:appointment' then 'appointment_saved'
 when 'record:growth_records' then 'anthropometry_saved'
 when 'record:energy_expenditure_calculations' then 'energy_saved'
 when 'clinical:diary_meal' then 'patient_diary' end;
 if v_kind is null or new.actor is distinct from auth.uid() then return new; end if;
 begin v_id:=new.result_ids[1]::bigint;
 exception when invalid_text_representation or numeric_value_out_of_range then return new; end;
 if v_kind='appointment_saved' then
  select a.care_episode_id,a.patient_id into v_episode,v_patient from public.appointments a
   where a.id=v_id and a.nutritionist_id=new.actor;
  if not found then return new; end if;
 elsif v_kind='anthropometry_saved' then
  select g.care_episode_id,g.patient_id into v_episode,v_patient from public.growth_records g
   where g.id=v_id and g.created_by_user_id=new.actor and g.invalidated_at is null;
  if not found then return new; end if;
 elsif v_kind='energy_saved' then
  select g.care_episode_id,g.patient_id into v_episode,v_patient from public.energy_expenditure_calculations g
   where g.id=v_id and g.nutritionist_id=new.actor;
  if not found then return new; end if;
 elsif v_kind='patient_diary' then
  select m.care_episode_id into v_episode from public.meals m
  join public.care_episodes e on e.id=m.care_episode_id
  where m.id=v_id and m.patient_id=new.actor and m.deleted_at is null
   and e.patient_id=new.actor and e.status='active' and e.is_simulation is not true;
  if v_episode is null then return new; end if;
 else return new;
 end if;
 if v_kind<>'patient_diary' and v_patient is not null then
  if not exists(select 1 from public.care_episodes e where e.id=v_episode and e.patient_id=v_patient
   and e.nutritionist_id=new.actor and e.status='active' and e.is_simulation is not true) then return new; end if;
 end if;
 insert into private.admin_work_events(actor_id,episode_id,kind,source_key)
 values(new.actor,v_episode,v_kind,new.actor::text||':'||new.nonce::text)
 on conflict(kind,source_key) do nothing;
 return new;
end; $$;
create trigger admin_work_receipt_capture after insert on private.mutation_receipts
 for each row execute function private.admin_capture_work_receipt();

-- Operational pseudonymous metadata has a 180-day retention, distinct from clinical custody.
create function private.admin_purge_work_events()
returns void language sql security definer set search_path='' as $$
 delete from private.admin_work_events where occurred_at<now()-interval '180 days';
$$;
revoke all on function private.admin_capture_publication(),private.admin_capture_work_receipt(),private.admin_purge_work_events() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('nello-admin-operational-retention','17 3 * * *','select private.admin_purge_work_events()');
 end if;
end; $$;

create function public.admin_product_analytics(p_window_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; capture_start timestamptz;
begin
 if not private.admin_action_allowed('read') then raise exception using errcode='42501',message='admin_mfa_required'; end if;
 if p_window_days is null or p_window_days not in (30,90,180) then raise exception using errcode='22023',message='invalid_analytics_window'; end if;
 select greatest(capture_started_at,now()-interval '180 days') into capture_start from private.admin_metric_definition where id;
 with external_people as (
  select p.id,p.user_type,u.email_confirmed_at as eligible_at from public.user_profiles p join auth.users u on u.id=p.id
  where p.is_simulation is not true and not exists(select 1 from private.admin_operators o where o.user_id=p.id)
   and u.email_confirmed_at is not null and u.email_confirmed_at<=now()
 ), professionals as(select * from external_people where user_type='nutritionist'),
 cohort as(select * from professionals where eligible_at>=capture_start and eligible_at>=now()-make_interval(days=>p_window_days)),
 work as(select w.* from private.admin_work_events w join external_people p on p.id=w.actor_id
  where w.occurred_at>=capture_start and w.occurred_at<=now()
  and (w.episode_id is null or exists(select 1 from public.care_episodes e join external_people n on n.id=e.nutritionist_id
    join external_people pat on pat.id=e.patient_id where e.id=w.episode_id and e.is_simulation is not true))),
 first_value as(select c.id,c.eligible_at,min(w.occurred_at) as first_at from cohort c
  left join work w on w.actor_id=c.id and w.kind='plan_published' and w.occurred_at>=c.eligible_at
  and w.occurred_at<c.eligible_at+interval '7 days' group by c.id,c.eligible_at),
 matured as(select * from first_value where eligible_at<=now()-interval '7 days'),
 return_cohort as(select * from matured where first_at is not null and first_at<=now()-interval '14 days'),
 returned as(select r.* from return_cohort r where exists(select 1 from work w where w.actor_id=r.id
  and w.kind<>'patient_diary' and w.occurred_at>=r.first_at+interval '7 days' and w.occurred_at<r.first_at+interval '14 days')),
 consent as(select p.id,r.allowed,r.version,r.recorded_at from professionals p left join lateral
  (select allowed,version,recorded_at from private.auth_legal_receipts where user_id=p.id and purpose='analytics' order by id desc limit 1)r on true),
 modules as(select kind,count(*) as operations,count(distinct actor_id) as actors from work
  where occurred_at>=now()-make_interval(days=>p_window_days) group by kind),
 both_sides as(select episode_id from work where episode_id is not null
  and occurred_at>=now()-make_interval(days=>p_window_days) group by episode_id
  having count(*) filter(where kind='plan_published')>0 and count(*) filter(where kind='patient_diary')>0
  and count(distinct actor_id)>1),
 patient_cohort as(select e.id,e.created_at,min(w.occurred_at) as published_at from public.care_episodes e
  join external_people n on n.id=e.nutritionist_id join external_people p on p.id=e.patient_id
  left join work w on w.episode_id=e.id and w.kind='plan_published' and w.actor_id=e.nutritionist_id
   and w.occurred_at>=e.created_at and w.occurred_at<e.created_at+interval '7 days'
  where e.is_simulation is not true and e.created_at>=capture_start and e.created_at>=now()-make_interval(days=>p_window_days)
   and e.created_at<=now() group by e.id,e.created_at),
 patient_matured as(select * from patient_cohort where created_at<=now()-interval '7 days'),
 diary_cohort as(select * from patient_matured where published_at is not null and published_at<=now()-interval '7 days'),
 diary_used as(select c.id from diary_cohort c where exists(select 1 from work w where w.episode_id=c.id
  and w.kind='patient_diary' and w.occurred_at>=c.published_at and w.occurred_at<c.published_at+interval '7 days')),
 weekly as(select date_trunc('week',occurred_at at time zone 'America/Fortaleza')::date as week,
  count(*) as operations,count(distinct actor_id) as actors from work where occurred_at>=now()-make_interval(days=>p_window_days) group by 1)
 select jsonb_build_object('schema_version',1,'definition_version','activation-v1-candidate','generated_at',now(),
 'data_through',now(),'source','Supabase · confirmações persistidas no servidor','timezone','America/Fortaleza',
 'window_days',p_window_days,'capture_started_at',capture_start,'retention_days',180,
 'population','Profissionais com email confirmado, sem simulações nem operadores internos conhecidos; episódios filtram os dois atores.',
 'professional_population',(select count(*) from professionals),
 'historical_uncovered',(select count(*) from professionals where eligible_at<capture_start),
 'activation',jsonb_build_object('eligible',(select count(*) from matured),'activated',(select count(*) from matured where first_at is not null),
 'recent',(select count(*) from first_value where eligible_at>now()-interval '7 days'),
 'median_hours',(select percentile_cont(0.5) within group(order by extract(epoch from(first_at-eligible_at))/3600) from matured where first_at is not null),
 'p90_hours',(select percentile_cont(0.9) within group(order by extract(epoch from(first_at-eligible_at))/3600) from matured where first_at is not null)),
 'return',jsonb_build_object('eligible',(select count(*) from return_cohort),'returned',(select count(*) from returned),
 'incomplete',(select count(*) from matured where first_at is not null and first_at>now()-interval '14 days')),
 'consent',jsonb_build_object('allowed',(select count(*) from consent where allowed and version='2026-10-01.2' and recorded_at>now()-interval '180 days' and recorded_at<=now()),
 'not_allowed_or_unknown',(select count(*) from consent where not coalesce(allowed and version='2026-10-01.2' and recorded_at>now()-interval '180 days' and recorded_at<=now(),false))),
 'both_sides_episodes',(select count(*) from both_sides),
 'patient_journey',jsonb_build_object('eligible_episodes',(select count(*) from patient_matured),
 'published_episodes',(select count(*) from patient_matured where published_at is not null),
 'recent_episodes',(select count(*) from patient_cohort where created_at>now()-interval '7 days'),
 'diary_eligible',(select count(*) from diary_cohort),'diary_used',(select count(*) from diary_used)),
 'modules',coalesce((select jsonb_agg(to_jsonb(m) order by kind) from modules m),'[]'::jsonb),
 'weekly',coalesce((select jsonb_agg(to_jsonb(w) order by week) from weekly w),'[]'::jsonb),
 'limitations',jsonb_build_array('Ativação é hipótese de produto: primeira publicação de plano em sete dias; não é resultado clínico.',
 'Retorno: nova operação profissional confirmada entre sete e 14 dias após o primeiro valor. Janelas incompletas ficam fora do denominador.',
 'Coortes anteriores ao início da captura não possuem cobertura histórica completa. Nenhum backfill foi realizado.',
 'Recibos confirmam persistência, não tentativas, entrega, exposição de funcionalidades ou interpretação clínica.',
 'Jornada do paciente é por episódio: publicação nos sete dias após o vínculo; diário nos sete dias após a publicação. Refeições profissionais não contam como diário do paciente; etapas opcionais não são abandono.',
 'Consentimento atual e pessoas observadas no PostHog têm populações e períodos diferentes; não representam uma taxa de cobertura.')) into result;
 return result;
end; $$;
revoke all on function public.admin_product_analytics(integer) from public,anon,authenticated;
grant execute on function public.admin_product_analytics(integer) to authenticated;

-- Correct the briefing forward; preserve the original deployed migration.
-- Historical volumes are records created, not operations successfully completed.
create or replace function public.admin_workflow_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.admin_action_allowed('read') then raise exception using errcode='42501',message='admin_mfa_required';end if;
 with eligible as(select id from public.user_profiles p where is_simulation is not true
  and not exists(select 1 from private.admin_operators o where o.user_id=p.id)),
 anamneses as(select a.* from public.anamnesis_records a join eligible n on n.id=a.nutritionist_id join eligible p on p.id=a.patient_id),
 checkins as(select a.* from public.checkin_sessions a join eligible n on n.id=a.nutritionist_id join eligible p on p.id=a.patient_id),
 plans as(select a.* from public.meal_plans a join eligible n on n.id=a.nutritionist_id join eligible p on p.id=a.patient_id where a.is_template is not true),
 appointments as(select a.* from public.appointments a join eligible n on n.id=a.nutritionist_id where a.patient_id is null or exists(select 1 from eligible p where p.id=a.patient_id)),
 meals as(select a.* from public.meals a join eligible p on p.id=a.patient_id
  join public.care_episodes e on e.id=a.care_episode_id join eligible n on n.id=e.nutritionist_id where a.deleted_at is null and e.is_simulation is not true),
 growth as(select a.* from public.growth_records a join eligible p on p.id=a.patient_id
  join public.care_episodes e on e.id=a.care_episode_id join eligible n on n.id=e.nutritionist_id where e.is_simulation is not true),
 finance as(select a.* from public.financial_transactions a join eligible n on n.id=a.nutritionist_id where a.patient_id is null or exists(select 1 from eligible p where p.id=a.patient_id)),
 notifications as(select a.* from public.notifications a join eligible p on p.id=a.user_id),
 privacy as(select a.* from public.data_subject_requests a join eligible p on p.id=a.subject_id)
 select jsonb_build_object('generated_at',now(),'data_through',now(),'source','Supabase · registros criados, sem internos ou simulações','window_days',30,
 'workflows',jsonb_build_array(
 jsonb_build_object('key','anamnesis','label','Anamneses criadas','count',(select count(*) from anamneses where created_at between now()-interval '30 days' and now()),'source','anamnesis_records'),
 jsonb_build_object('key','checkins','label','Check-ins criados','count',(select count(*) from checkins where created_at between now()-interval '30 days' and now()),'source','checkin_sessions'),
 jsonb_build_object('key','plans','label','Planos criados · inclui rascunhos','count',(select count(*) from plans where created_at between now()-interval '30 days' and now()),'source','meal_plans'),
 jsonb_build_object('key','appointments','label','Consultas criadas','count',(select count(*) from appointments where created_at between now()-interval '30 days' and now()),'source','appointments'),
 jsonb_build_object('key','meals','label','Registros de diário','count',(select count(*) from meals where created_at between now()-interval '30 days' and now()),'source','meals'),
 jsonb_build_object('key','anthropometry','label','Registros de antropometria','count',(select count(*) from growth where created_at between now()-interval '30 days' and now()),'source','growth_records'),
 jsonb_build_object('key','clinic_finance','label','Lançamentos do consultório','count',(select count(*) from finance where created_at between now()-interval '30 days' and now()),'source','financial_transactions'),
 jsonb_build_object('key','notifications','label','Notificações criadas','count',(select count(*) from notifications where created_at between now()-interval '30 days' and now()),'source','notifications'),
 jsonb_build_object('key','privacy','label','Solicitações LGPD criadas','count',(select count(*) from privacy where created_at between now()-interval '30 days' and now()),'source','data_subject_requests')),
 'pending',jsonb_build_object('anamnesis_patient',(select count(*) from anamneses where status='pending_patient'),
 'checkins',(select count(*) from checkins where status='pending'),'privacy',(select count(*) from privacy where status in('submitted','triaged','in_progress')),
 'verifications',(select count(*) from public.professional_verifications v join eligible p on p.id=v.user_id where status in('pending','submitted','under_review')))) into result;
 return result;
end; $$;
create or replace function public.admin_operational_briefing()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if not private.admin_action_allowed('read') then raise exception using errcode='42501',message='admin_mfa_required'; end if;
 with eligible as (select id,user_type from public.user_profiles where is_simulation is not true and not exists(select 1 from private.admin_operators o where o.user_id=user_profiles.id)),
 privacy as(select d.* from public.data_subject_requests d join eligible e on e.id=d.subject_id where d.status in ('submitted','triaged','in_progress')),
 verification as(select v.* from public.professional_verifications v join eligible e on e.id=v.user_id where v.status in ('pending','submitted','under_review')),
 plans as(select m.id,m.is_draft,m.prescription_status from public.meal_plans m join eligible n on n.id=m.nutritionist_id join eligible p on p.id=m.patient_id
 where m.is_template is not true and m.archived_at is null and m.created_at>=now()-interval '30 days' and m.created_at<=now())
 select jsonb_build_object('schema_version',1,'generated_at',now(),'data_through',now(),'last_success_at',now(),'source','Supabase · registros operacionais',
 'timezone','America/Fortaleza','population','Contas externas, sem operadores internos ou simulações; pacientes e profissionais vinculados também são filtrados.',
 'window_days',30,'can_triage',private.admin_action_allowed('triage'),
 'counts',jsonb_build_object('nutritionists',(select count(*) from eligible where user_type='nutritionist'),'patients',(select count(*) from eligible where user_type='patient'),
 'plans_draft_30d',(select count(*) from plans where is_draft is true),'plans_confirmed_30d',(select count(*) from plans where is_draft is not true and prescription_status in ('finalized','signed'))),
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

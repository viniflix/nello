-- C8: LGPD data-subject workflow, retention decisions and immutable administrative trail.

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.user_profiles(id) on delete restrict,
  request_type text not null check (request_type in ('access','portability','correction','deletion','revocation','objection')),
  status text not null default 'submitted' check (status in ('submitted','triaged','in_progress','fulfilled','rejected','cancelled')),
  subject_note text check (subject_note is null or char_length(subject_note) <= 1000),
  assigned_to uuid references public.user_profiles(id) on delete set null,
  due_at timestamptz not null default (now() + interval '15 days'),
  resolution_summary text check (resolution_summary is null or char_length(resolution_summary) between 10 and 2000),
  legal_basis text check (legal_basis is null or char_length(legal_basis) <= 1000),
  retention_decision text check (retention_decision is null or retention_decision in ('retain_legal_obligation','anonymize','delete_non_clinical','no_deletion_applicable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  revision bigint not null default 1,
  constraint data_subject_requests_completion_check check (
    (status in ('fulfilled','rejected') and completed_at is not null and resolution_summary is not null)
    or (status not in ('fulfilled','rejected') and completed_at is null)
  ),
  constraint data_subject_requests_cancel_check check (
    (status='cancelled' and cancelled_at is not null) or (status<>'cancelled' and cancelled_at is null)
  )
);

create unique index data_subject_requests_one_active_type_idx
  on public.data_subject_requests(subject_id, request_type)
  where status in ('submitted','triaged','in_progress');
create index data_subject_requests_admin_queue_idx on public.data_subject_requests(status, due_at, created_at);
create index data_subject_requests_subject_created_idx on public.data_subject_requests(subject_id, created_at desc);
create index data_subject_requests_assigned_idx on public.data_subject_requests(assigned_to) where assigned_to is not null;

create table public.data_subject_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.data_subject_requests(id) on delete restrict,
  actor_id uuid references public.user_profiles(id) on delete set null,
  event_type text not null check (event_type in ('submitted','triaged','started','fulfilled','rejected','cancelled','assigned','note_added')),
  from_status text,
  to_status text,
  reason text not null check (char_length(reason) between 3 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index data_subject_request_events_request_created_idx on public.data_subject_request_events(request_id, created_at);
create index data_subject_request_events_actor_idx on public.data_subject_request_events(actor_id) where actor_id is not null;

create table public.data_retention_policy_catalog (
  category_code text primary key,
  description text not null,
  default_policy text not null,
  legal_review_required boolean not null default true,
  active boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.data_retention_policy_catalog(category_code,description,default_policy) values
('clinical_record','ProntuÃ¡rio e atos clÃ­nicos assinados','RetenÃ§Ã£o por obrigaÃ§Ã£o legal/profissional; nÃ£o apagar automaticamente.'),
('billing_fiscal','Documentos financeiros e fiscais','RetenÃ§Ã£o conforme obrigaÃ§Ã£o fiscal aplicÃ¡vel; validar com contabilidade.'),
('account_profile','Dados cadastrais e preferÃªncias','Minimizar, anonimizar ou excluir quando nÃ£o houver outra base legal.'),
('security_audit','Trilhas de seguranÃ§a e auditoria','Reter pelo prazo necessÃ¡rio Ã  seguranÃ§a e defesa de direitos.'),
('product_analytics','Telemetria minimizada de produto','Anonimizar ou excluir conforme polÃ­tica e consentimentos aplicÃ¡veis.');

alter table public.data_subject_requests enable row level security;
alter table public.data_subject_request_events enable row level security;
alter table public.data_retention_policy_catalog enable row level security;
revoke all on table public.data_subject_requests, public.data_subject_request_events, public.data_retention_policy_catalog from public, anon, authenticated;

create or replace function private.prevent_data_subject_event_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='23514',message='data_subject_request_events_are_immutable'; end;
$$;
create trigger trg_data_subject_request_events_immutable before update or delete on public.data_subject_request_events
for each row execute function private.prevent_data_subject_event_mutation();
revoke all on function private.prevent_data_subject_event_mutation() from public,anon,authenticated;

create function public.create_my_data_subject_request(p_request_type text, p_subject_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_note text:=nullif(btrim(p_subject_note),'');
begin
 if v_actor is null or not exists(select 1 from public.user_profiles where id=v_actor and user_type='patient') then raise exception using errcode='42501',message='patient_request_only';end if;
 if p_request_type not in('access','portability','correction','deletion','revocation','objection') then raise exception using errcode='22023',message='invalid_data_subject_request_type';end if;
 if length(coalesce(v_note,''))>1000 then raise exception using errcode='22023',message='data_subject_request_note_too_long';end if;
 begin
  insert into public.data_subject_requests(subject_id,request_type,subject_note)values(v_actor,p_request_type,v_note)returning id into v_id;
 exception when unique_violation then raise exception using errcode='23505',message='active_data_subject_request_already_exists';end;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,to_status,reason)values(v_id,v_actor,'submitted','submitted','SolicitaÃ§Ã£o criada pelo titular');
 insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('data_subject_request_submitted',now(),jsonb_build_object('request_id',v_id,'request_type',p_request_type),v_actor,'privacy',v_actor);
 return jsonb_build_object('id',v_id,'status','submitted','request_type',p_request_type);
end$$;

create function public.list_my_data_subject_requests()
returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',r.id,'request_type',r.request_type,'status',r.status,'subject_note',r.subject_note,'due_at',r.due_at,'resolution_summary',r.resolution_summary,'created_at',r.created_at,'updated_at',r.updated_at,'completed_at',r.completed_at,'cancelled_at',r.cancelled_at,'revision',r.revision))
 from public.data_subject_requests r where r.subject_id=auth.uid() order by r.created_at desc$$;

create function public.cancel_my_data_subject_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.data_subject_requests%rowtype;
begin
 select * into v_request from public.data_subject_requests where id=p_request_id and subject_id=auth.uid() for update;
 if not found then raise exception using errcode='42501',message='data_subject_request_cancel_forbidden';end if;
 if v_request.status not in('submitted','triaged') then raise exception using errcode='23514',message='data_subject_request_cannot_be_cancelled';end if;
 update public.data_subject_requests set status='cancelled',cancelled_at=now(),updated_at=now(),revision=revision+1 where id=v_request.id;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,from_status,to_status,reason)values(v_request.id,auth.uid(),'cancelled',v_request.status,'cancelled','SolicitaÃ§Ã£o cancelada pelo titular');
 return jsonb_build_object('id',v_request.id,'status','cancelled');
end$$;

create function public.list_data_subject_requests(p_status text default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception using errcode='42501',message='admin_required';end if;
 if p_status is not null and p_status not in('submitted','triaged','in_progress','fulfilled','rejected','cancelled') then raise exception using errcode='22023',message='invalid_request_status';end if;
 return query select jsonb_strip_nulls(jsonb_build_object('id',r.id,'subject_id',r.subject_id,'subject_name',p.name,'subject_email',p.email,'request_type',r.request_type,'status',r.status,'subject_note',r.subject_note,'assigned_to',r.assigned_to,'due_at',r.due_at,'resolution_summary',r.resolution_summary,'legal_basis',r.legal_basis,'retention_decision',r.retention_decision,'created_at',r.created_at,'updated_at',r.updated_at,'completed_at',r.completed_at,'revision',r.revision))
 from public.data_subject_requests r join public.user_profiles p on p.id=r.subject_id
 where p_status is null or r.status=p_status order by case when r.status in('submitted','triaged','in_progress')then 0 else 1 end,r.due_at,r.created_at;
end$$;

create function public.update_data_subject_request(
 p_request_id uuid,p_expected_revision bigint,p_status text,p_reason text,p_retention_decision text default null,p_legal_basis text default null,p_assign_to_me boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_request public.data_subject_requests%rowtype;v_reason text:=nullif(btrim(p_reason),'');v_event text;
begin
 if not private.is_admin() then raise exception using errcode='42501',message='admin_required';end if;
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='administrative_reason_required';end if;
 if p_status not in('triaged','in_progress','fulfilled','rejected') then raise exception using errcode='22023',message='invalid_administrative_transition';end if;
 select * into v_request from public.data_subject_requests where id=p_request_id for update;
 if not found then raise exception using errcode='P0002',message='data_subject_request_not_found';end if;
 if v_request.revision<>p_expected_revision then raise exception using errcode='40001',message='data_subject_request_revision_conflict';end if;
 if v_request.status in('fulfilled','rejected','cancelled') then raise exception using errcode='23514',message='closed_data_subject_request_is_immutable';end if;
 if p_status='triaged' and v_request.status<>'submitted' then raise exception using errcode='23514',message='invalid_data_subject_request_transition';end if;
 if p_status='in_progress' and v_request.status not in('submitted','triaged') then raise exception using errcode='23514',message='invalid_data_subject_request_transition';end if;
 if p_status in('fulfilled','rejected') and v_request.status not in('triaged','in_progress') then raise exception using errcode='23514',message='request_must_be_triaged_before_completion';end if;
 if p_retention_decision is not null and p_retention_decision not in('retain_legal_obligation','anonymize','delete_non_clinical','no_deletion_applicable') then raise exception using errcode='22023',message='invalid_retention_decision';end if;
 v_event:=case p_status when 'triaged'then'triaged' when'in_progress'then'started' when'fulfilled'then'fulfilled' else'rejected'end;
 update public.data_subject_requests set status=p_status,assigned_to=case when p_assign_to_me then v_actor else assigned_to end,resolution_summary=case when p_status in('fulfilled','rejected')then v_reason else resolution_summary end,legal_basis=nullif(btrim(p_legal_basis),''),retention_decision=p_retention_decision,completed_at=case when p_status in('fulfilled','rejected')then now()else null end,updated_at=now(),revision=revision+1 where id=v_request.id;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_request.id,v_actor,v_event,v_request.status,p_status,v_reason,jsonb_strip_nulls(jsonb_build_object('retention_decision',p_retention_decision)));
 insert into public.notifications(user_id,type,content,is_read,title,message)values(v_request.subject_id,'privacy_request_update',jsonb_build_object('request_id',v_request.id,'status',p_status),false,'AtualizaÃ§Ã£o da sua solicitaÃ§Ã£o',case when p_status in('fulfilled','rejected')then v_reason else 'Sua solicitaÃ§Ã£o de privacidade avanÃ§ou para uma nova etapa.'end);
 return jsonb_build_object('id',v_request.id,'status',p_status,'revision',v_request.revision+1);
end$$;

revoke all on function public.create_my_data_subject_request(text,text),public.list_my_data_subject_requests(),public.cancel_my_data_subject_request(uuid),public.list_data_subject_requests(text),public.update_data_subject_request(uuid,bigint,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_my_data_subject_request(text,text),public.list_my_data_subject_requests(),public.cancel_my_data_subject_request(uuid) to authenticated,service_role;
grant execute on function public.list_data_subject_requests(text),public.update_data_subject_request(uuid,bigint,text,text,text,text,boolean) to authenticated,service_role;

comment on table public.data_subject_requests is 'C8: operational LGPD requests; deletion requests never hard-delete clinical records automatically.';

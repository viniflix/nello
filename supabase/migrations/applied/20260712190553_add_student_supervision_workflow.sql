-- Onda B4 / Task 7: supervisão estudantil e retenção documental.

create table if not exists public.student_supervision_events (
  id uuid primary key default gen_random_uuid(),
  supervision_id uuid not null references public.student_supervisions(id) on delete restrict,
  student_id uuid not null references public.user_profiles(id) on delete restrict,
  supervisor_id uuid not null references public.user_profiles(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists student_supervision_events_supervision_idx
  on public.student_supervision_events(supervision_id,created_at desc);
create index if not exists student_supervision_events_participants_idx
  on public.student_supervision_events(student_id,supervisor_id,created_at desc);

alter table public.student_supervision_events enable row level security;
drop policy if exists student_supervision_events_select_participant_or_admin on public.student_supervision_events;
create policy student_supervision_events_select_participant_or_admin
on public.student_supervision_events for select to authenticated
using (student_id=(select auth.uid()) or supervisor_id=(select auth.uid()) or private.is_admin());

revoke all on table public.student_supervision_events from anon;
revoke insert,update,delete on table public.student_supervision_events from authenticated;
grant select on table public.student_supervision_events to authenticated;

drop trigger if exists trg_student_supervision_events_immutable on public.student_supervision_events;
create trigger trg_student_supervision_events_immutable
before update or delete on public.student_supervision_events
for each row execute function private.reject_verification_event_mutation();

create or replace function private.schedule_verification_document_deletion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','rejected','suspended') then
    update public.verification_documents
    set retention_status='scheduled_for_deletion',
        scheduled_deletion_at=now()+interval '30 days'
    where verification_id=new.id and retention_status='pending_review';
  end if;
  return new;
end;
$$;

revoke all on function private.schedule_verification_document_deletion() from public,anon,authenticated;
drop trigger if exists trg_schedule_verification_document_deletion on public.professional_verifications;
create trigger trg_schedule_verification_document_deletion
after update of status on public.professional_verifications
for each row execute function private.schedule_verification_document_deletion();

create or replace function public.request_student_supervision(p_supervisor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_student_id uuid:=auth.uid();
  v_row public.student_supervisions%rowtype;
begin
  if v_student_id is null then raise exception using errcode='42501',message='authentication_required'; end if;
  if not exists(select 1 from public.professional_verifications where user_id=v_student_id and professional_role='student' and status='approved' and valid_until>now()) then
    raise exception using errcode='42501',message='approved_student_verification_required';
  end if;
  if not exists(select 1 from public.professional_verifications where user_id=p_supervisor_id and professional_role='nutritionist' and status='approved' and valid_until>now()) then
    raise exception using errcode='42501',message='approved_supervisor_required';
  end if;
  insert into public.student_supervisions(student_id,supervisor_id,status)
  values(v_student_id,p_supervisor_id,'pending') returning * into v_row;
  insert into public.student_supervision_events(supervision_id,student_id,supervisor_id,actor_id,from_status,to_status,reason)
  values(v_row.id,v_student_id,p_supervisor_id,v_student_id,null,'pending','supervision_requested');
  insert into public.notifications(user_id,type,title,message,content)
  values(p_supervisor_id,'student_supervision_requested','Solicitação de supervisão','Um estudante solicitou sua supervisão.',jsonb_build_object('supervision_id',v_row.id,'student_id',v_student_id));
  return jsonb_build_object('success',true,'supervision_id',v_row.id,'status','pending');
end;
$$;

create or replace function public.request_student_supervision_by_email(p_supervisor_email text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_supervisor_id uuid;
begin
  select u.id into v_supervisor_id
  from auth.users u
  join public.professional_verifications pv on pv.user_id=u.id
  where lower(u.email)=lower(btrim(p_supervisor_email))
    and pv.professional_role='nutritionist' and pv.status='approved' and pv.valid_until>now();
  if v_supervisor_id is null then
    raise exception using errcode='P0002',message='verified_supervisor_not_found';
  end if;
  return public.request_student_supervision(v_supervisor_id);
end;
$$;

create or replace function public.get_my_student_supervisions()
returns table(id uuid,perspective text,status text,counterpart_name text,counterpart_email text,requested_at timestamptz,responded_at timestamptz,started_at timestamptz,ended_at timestamptz)
language sql
security definer
set search_path=''
stable
as $$
  select ss.id,
    case when ss.student_id=auth.uid() then 'student' else 'supervisor' end,
    ss.status,
    coalesce(up.name,au.email),au.email,ss.requested_at,ss.responded_at,ss.started_at,ss.ended_at
  from public.student_supervisions ss
  join public.user_profiles up on up.id=case when ss.student_id=auth.uid() then ss.supervisor_id else ss.student_id end
  join auth.users au on au.id=up.id
  where auth.uid() in (ss.student_id,ss.supervisor_id)
  order by ss.requested_at desc;
$$;

create or replace function public.respond_student_supervision(p_supervision_id uuid,p_decision text,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_row public.student_supervisions%rowtype;
begin
  if p_decision not in ('active','rejected') then raise exception using errcode='22023',message='invalid_supervision_decision'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception using errcode='22023',message='decision_reason_required'; end if;
  select * into v_row from public.student_supervisions where id=p_supervision_id for update;
  if not found then raise exception using errcode='P0002',message='supervision_not_found'; end if;
  if v_actor<>v_row.supervisor_id then raise exception using errcode='42501',message='supervisor_required'; end if;
  if v_row.status<>'pending' then raise exception using errcode='55000',message='invalid_supervision_transition'; end if;
  if p_decision='active' and not private.has_current_clinical_capacity(v_actor) then raise exception using errcode='42501',message='approved_supervisor_required'; end if;
  update public.student_supervisions set status=p_decision,responded_at=now(),started_at=case when p_decision='active' then now() else null end,response_reason=btrim(p_reason),updated_at=now() where id=p_supervision_id;
  insert into public.student_supervision_events(supervision_id,student_id,supervisor_id,actor_id,from_status,to_status,reason)
  values(v_row.id,v_row.student_id,v_row.supervisor_id,v_actor,v_row.status,p_decision,btrim(p_reason));
  insert into public.notifications(user_id,type,title,message,content)
  values(v_row.student_id,'student_supervision_'||p_decision,'Supervisão atualizada',case when p_decision='active' then 'Sua supervisão foi aceita.' else 'Sua solicitação de supervisão foi recusada.' end,jsonb_build_object('supervision_id',v_row.id));
  return jsonb_build_object('success',true,'status',p_decision);
end;
$$;

create or replace function public.end_student_supervision(p_supervision_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid(); v_row public.student_supervisions%rowtype; v_recipient uuid;
begin
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception using errcode='22023',message='decision_reason_required'; end if;
  select * into v_row from public.student_supervisions where id=p_supervision_id for update;
  if not found then raise exception using errcode='P0002',message='supervision_not_found'; end if;
  if v_actor not in (v_row.student_id,v_row.supervisor_id) then raise exception using errcode='42501',message='supervision_participant_required'; end if;
  if v_row.status<>'active' then raise exception using errcode='55000',message='invalid_supervision_transition'; end if;
  update public.student_supervisions set status='ended',ended_at=now(),end_reason=btrim(p_reason),updated_at=now() where id=p_supervision_id;
  insert into public.student_supervision_events(supervision_id,student_id,supervisor_id,actor_id,from_status,to_status,reason)
  values(v_row.id,v_row.student_id,v_row.supervisor_id,v_actor,v_row.status,'ended',btrim(p_reason));
  v_recipient:=case when v_actor=v_row.student_id then v_row.supervisor_id else v_row.student_id end;
  insert into public.notifications(user_id,type,title,message,content)
  values(v_recipient,'student_supervision_ended','Supervisão encerrada','O vínculo de supervisão foi encerrado.',jsonb_build_object('supervision_id',v_row.id));
  return jsonb_build_object('success',true,'status','ended');
end;
$$;

revoke all on function public.request_student_supervision(uuid) from public,anon;
revoke all on function public.request_student_supervision_by_email(text) from public,anon;
revoke all on function public.get_my_student_supervisions() from public,anon;
revoke all on function public.respond_student_supervision(uuid,text,text) from public,anon;
revoke all on function public.end_student_supervision(uuid,text) from public,anon;
grant execute on function public.request_student_supervision(uuid) to authenticated,service_role;
grant execute on function public.request_student_supervision_by_email(text) to authenticated,service_role;
grant execute on function public.get_my_student_supervisions() to authenticated,service_role;
grant execute on function public.respond_student_supervision(uuid,text,text) to authenticated,service_role;
grant execute on function public.end_student_supervision(uuid,text) to authenticated,service_role;

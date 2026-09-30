-- Onda B4 / Task 3: capacidade clínica real e ambientes de simulação.

alter table public.user_profiles
  add column if not exists is_simulation boolean not null default false,
  add column if not exists simulation_owner_id uuid references public.user_profiles(id) on delete restrict;

alter table public.user_profiles
  drop constraint if exists user_profiles_simulation_owner_check;
alter table public.user_profiles
  add constraint user_profiles_simulation_owner_check check (
    (is_simulation and user_type='patient' and simulation_owner_id is not null)
    or (not is_simulation and simulation_owner_id is null)
  );

create index if not exists user_profiles_simulation_owner_idx
  on public.user_profiles(simulation_owner_id)
  where is_simulation;

alter table public.care_episodes
  add column if not exists is_simulation boolean not null default false,
  add column if not exists student_id uuid references public.user_profiles(id) on delete restrict,
  add column if not exists supervisor_id uuid references public.user_profiles(id) on delete restrict;

alter table public.care_episodes
  drop constraint if exists care_episodes_supervision_shape_check;
alter table public.care_episodes
  add constraint care_episodes_supervision_shape_check check (
    (student_id is null and supervisor_id is null)
    or (
      not is_simulation
      and student_id = nutritionist_id
      and supervisor_id is not null
      and supervisor_id <> student_id
    )
  );

create index if not exists care_episodes_supervisor_idx
  on public.care_episodes(supervisor_id, started_at desc)
  where supervisor_id is not null;

create or replace function private.enforce_verified_patient_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_simulation boolean;
  v_simulation_owner_id uuid;
begin
  if new.status not in ('pending','active') then
    return new;
  end if;

  select p.is_simulation, p.simulation_owner_id
  into v_is_simulation, v_simulation_owner_id
  from public.user_profiles p
  where p.id=new.patient_id and p.user_type='patient';

  if not found then
    raise exception using errcode='P0002', message='patient_not_found';
  end if;

  if v_is_simulation then
    if v_simulation_owner_id <> new.nutritionist_id then
      raise exception using errcode='42501', message='simulation_patient_owner_mismatch';
    end if;
    return new;
  end if;

  if not private.has_current_clinical_capacity(new.nutritionist_id) then
    raise exception using errcode='42501', message='professional_verification_required';
  end if;

  return new;
end;
$$;

create or replace function private.prepare_verified_care_episode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_simulation boolean;
  v_simulation_owner_id uuid;
  v_professional_role text;
begin
  select p.is_simulation, p.simulation_owner_id
  into v_is_simulation, v_simulation_owner_id
  from public.user_profiles p
  where p.id=new.patient_id and p.user_type='patient';

  if not found then
    raise exception using errcode='P0002', message='patient_not_found';
  end if;

  if v_is_simulation then
    if v_simulation_owner_id <> new.nutritionist_id then
      raise exception using errcode='42501', message='simulation_patient_owner_mismatch';
    end if;
    new.is_simulation := true;
    new.student_id := null;
    new.supervisor_id := null;
    return new;
  end if;

  if not private.has_current_clinical_capacity(new.nutritionist_id) then
    raise exception using errcode='42501', message='professional_verification_required';
  end if;

  new.is_simulation := false;
  select v.professional_role into v_professional_role
  from public.professional_verifications v
  where v.user_id=new.nutritionist_id and v.status='approved' and v.valid_until>now();

  if v_professional_role='student' then
    select s.supervisor_id into new.supervisor_id
    from public.student_supervisions s
    join public.professional_verifications supervisor
      on supervisor.user_id=s.supervisor_id
     and supervisor.professional_role='nutritionist'
     and supervisor.status='approved'
     and supervisor.valid_until>now()
    where s.student_id=new.nutritionist_id and s.status='active'
    limit 1;
    if new.supervisor_id is null then
      raise exception using errcode='42501', message='active_supervisor_required';
    end if;
    new.student_id := new.nutritionist_id;
  else
    new.student_id := null;
    new.supervisor_id := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_verified_patient_link() from public, anon, authenticated;
revoke all on function private.prepare_verified_care_episode() from public, anon, authenticated;

drop trigger if exists trg_enforce_verified_patient_link on public.nutritionist_patients;
create trigger trg_enforce_verified_patient_link
before insert or update of nutritionist_id, patient_id, status
on public.nutritionist_patients
for each row execute function private.enforce_verified_patient_link();

drop trigger if exists trg_prepare_verified_care_episode on public.care_episodes;
create trigger trg_prepare_verified_care_episode
before insert on public.care_episodes
for each row execute function private.prepare_verified_care_episode();

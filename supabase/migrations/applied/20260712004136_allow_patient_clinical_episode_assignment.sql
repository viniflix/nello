-- Compatibilidade: registros feitos pelo paciente podem omitir nutritionist_id.
-- A origem Ã© derivada exclusivamente do episÃ³dio ativo Ãºnico.
create or replace function private.assign_clinical_care_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode public.care_episodes%rowtype;
begin
  if new.patient_id is null then
    new.care_episode_id := null;
    return new;
  end if;

  if new.care_episode_id is not null then
    select * into v_episode
    from public.care_episodes ce
    where ce.id = new.care_episode_id
      and ce.patient_id = new.patient_id;

    if not found then
      raise exception 'EpisÃ³dio incompatÃ­vel com o paciente.' using errcode = '23514';
    end if;

    if new.nutritionist_id is null then
      new.nutritionist_id := v_episode.nutritionist_id;
    elsif new.nutritionist_id <> v_episode.nutritionist_id then
      raise exception 'EpisÃ³dio incompatÃ­vel com paciente ou nutricionista.' using errcode = '23514';
    end if;
  else
    select * into v_episode
    from public.care_episodes ce
    where ce.patient_id = new.patient_id
      and (new.nutritionist_id is null or ce.nutritionist_id = new.nutritionist_id)
      and ce.status = 'active'
    limit 1;

    if not found then
      raise exception 'NÃ£o existe episÃ³dio ativo para este paciente e nutricionista.' using errcode = '23514';
    end if;

    new.care_episode_id := v_episode.id;
    new.nutritionist_id := v_episode.nutritionist_id;
  end if;

  return new;
end;
$$;

revoke all on function private.assign_clinical_care_episode() from public, anon, authenticated;

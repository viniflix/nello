-- The Auth profile must exist while foreign keys on an offline profile are
-- reassigned. Many patient tables do not cascade updates to profile IDs.
create or replace function private.redeem_invite_code(input_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_nutritionist_id uuid;
  v_target public.user_profiles%rowtype;
  v_current public.user_profiles%rowtype;
  v_fk record;
  v_has_related boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
  end if;
  if input_code is null or length(btrim(input_code)) not between 1 and 128 then
    return jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
  end if;

  select id into v_nutritionist_id
  from public.user_profiles
  where lower(invite_code) = lower(btrim(input_code)) and user_type = 'nutritionist';
  if v_nutritionist_id is not null then
    insert into public.nutritionist_patients (nutritionist_id, patient_id, status)
    values (v_nutritionist_id, v_user_id, 'pending')
    on conflict (nutritionist_id, patient_id) do update set status = 'pending'
    where public.nutritionist_patients.status is null;
    update public.user_profiles set nutritionist_id = v_nutritionist_id
    where id = v_user_id and nutritionist_id is null;
    return jsonb_build_object('success', true, 'type', 'link_pending',
      'message', 'Solicitação de vínculo enviada. Aguarde a aprovação do seu nutricionista.');
  end if;

  select * into v_target from public.user_profiles
  where lower(patient_invite_code) = lower(btrim(input_code)) and user_type = 'patient'
  for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
  end if;
  if v_target.id = v_user_id then
    return jsonb_build_object('success', false, 'message', 'Você já é o dono deste perfil');
  end if;
  -- The code may only claim a profile that has not yet been authenticated.
  if exists (select 1 from auth.users where id = v_target.id) then
    return jsonb_build_object('success', false, 'code', 'profile_already_claimed',
      'message', 'Este perfil já possui acesso. Procure suporte para recuperar a conta.');
  end if;

  select * into v_current from public.user_profiles where id = v_user_id for update;
  if not found or v_current.user_type <> 'patient' or v_current.nutritionist_id is not null then
    return jsonb_build_object('success', false, 'code', 'current_profile_not_claimable',
      'message', 'Esta conta já possui um vínculo. Procure suporte para unir os perfis.');
  end if;
  if not exists (select 1 from public.nutritionist_patients
                 where patient_id = v_target.id and nutritionist_id = v_target.nutritionist_id) then
    return jsonb_build_object('success', false, 'code', 'offline_profile_without_link',
      'message', 'O perfil do convite precisa ser conferido pelo nutricionista.');
  end if;

  -- Avoid a silent merge into an account that already contains clinical data.
  for v_fk in
    select distinct ns.nspname as schema_name, rel.relname as table_name,
      att.attname as column_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class rel on rel.oid = c.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
    join pg_catalog.pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.user_profiles'::pg_catalog.regclass
      and pg_catalog.array_length(c.conkey, 1) = 1
  loop
    execute pg_catalog.format('select exists(select 1 from %I.%I where %I = $1)',
      v_fk.schema_name, v_fk.table_name, v_fk.column_name)
      into v_has_related using v_user_id;
    if v_has_related then
      return jsonb_build_object('success', false, 'code', 'current_profile_has_data',
        'message', 'Esta conta já contém dados. Procure suporte para unir os perfis.');
    end if;
  end loop;

  begin
    -- Both profiles exist here, so NO ACTION and CASCADE FKs can be moved
    -- without a broken reference. An exception rolls back the entire merge.
    for v_fk in
      select distinct ns.nspname as schema_name, rel.relname as table_name,
        att.attname as column_name
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class rel on rel.oid = c.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
      join pg_catalog.pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
      where c.contype = 'f' and c.confrelid = 'public.user_profiles'::pg_catalog.regclass
        and pg_catalog.array_length(c.conkey, 1) = 1
    loop
      execute pg_catalog.format('update %I.%I set %I = $1 where %I = $2',
        v_fk.schema_name, v_fk.table_name, v_fk.column_name, v_fk.column_name)
        using v_user_id, v_target.id;
    end loop;

    delete from public.user_profiles where id = v_target.id;
    update public.user_profiles set
      name = v_target.name, user_type = 'patient', crn = v_target.crn,
      birth_date = v_target.birth_date, gender = v_target.gender,
      height = v_target.height, weight = v_target.weight, goal = v_target.goal,
      nutritionist_id = v_target.nutritionist_id, created_at = v_target.created_at,
      patient_category = v_target.patient_category, fiscal_data = v_target.fiscal_data,
      preferences = v_target.preferences, avatar_url = v_target.avatar_url,
      phone = v_target.phone, address = v_target.address,
      specialties = v_target.specialties, education = v_target.education,
      bio = v_target.bio, is_active = v_target.is_active, cpf = v_target.cpf,
      occupation = v_target.occupation, civil_status = v_target.civil_status,
      email = coalesce(v_current.email, v_target.email),
      observations = v_target.observations,
      clinic_settings = v_target.clinic_settings, slug = v_target.slug,
      needs_password_reset = v_target.needs_password_reset,
      ethnicity = v_target.ethnicity, clinical_flags = v_target.clinical_flags,
      is_simulation = v_target.is_simulation,
      simulation_owner_id = v_target.simulation_owner_id,
      patient_invite_code = null
    where id = v_user_id;
    update public.nutritionist_patients set status = 'active'
    where patient_id = v_user_id and nutritionist_id = v_target.nutritionist_id;
    if not found then
      raise exception using errcode = '23514', message = 'offline_link_not_preserved';
    end if;
    return jsonb_build_object('success', true, 'type', 'profile_claimed',
      'message', 'Cadastro vinculado ao perfil clínico com sucesso');
  exception when others then
    return jsonb_build_object('success', false, 'code', 'profile_claim_failed',
      'message', 'Não foi possível vincular o perfil. Procure suporte para concluir com segurança.');
  end;
end;
$function$;

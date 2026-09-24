-- Wave 2: claim the offline profile by rekeying it before touching its links.
-- The previous implementation moved nutritionist_patients to the temporary
-- Auth profile, then deleted that profile; ON DELETE CASCADE erased the link.
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

    update public.user_profiles
    set nutritionist_id = v_nutritionist_id
    where id = v_user_id and nutritionist_id is null;

    return jsonb_build_object('success', true, 'type', 'link_pending',
      'message', 'Solicitação de vínculo enviada. Aguarde a aprovação do seu nutricionista.');
  end if;

  select * into v_target
  from public.user_profiles
  where lower(patient_invite_code) = lower(btrim(input_code)) and user_type = 'patient'
  for update;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Código inválido ou não encontrado');
  end if;
  if v_target.id = v_user_id then
    return jsonb_build_object('success', false, 'message', 'Você já é o dono deste perfil');
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

  -- Refuse to delete an Auth-created profile that already owns any related
  -- records. This covers present and future FK tables, including CASCADE FKs.
  for v_fk in
    select ns.nspname as schema_name, rel.relname as table_name, att.attname as column_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class rel on rel.oid = c.conrelid
    join pg_catalog.pg_namespace ns on ns.oid = rel.relnamespace
    join pg_catalog.pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.user_profiles'::pg_catalog.regclass
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
    delete from public.user_profiles where id = v_user_id;
    -- FKs with ON UPDATE CASCADE now move the offline clinical links to the
    -- authenticated ID. No link is moved to the disposable profile first.
    update public.user_profiles
    set id = v_user_id,
        patient_invite_code = null,
        email = coalesce(v_current.email, v_target.email)
    where id = v_target.id;
    update public.nutritionist_patients
    set status = 'active'
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

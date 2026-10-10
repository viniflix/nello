-- Forward repair: clinical history remains readable, but capabilities cannot
-- mutate the record after the exact care episode has ended.
CREATE FUNCTION private.anamnesis_episode_active(p_episode uuid,p_patient uuid,p_professional uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT EXISTS(
  SELECT 1 FROM public.care_episodes e
  JOIN public.user_profiles patient ON patient.id=e.patient_id
  JOIN public.user_profiles professional ON professional.id=e.nutritionist_id
  WHERE e.id=p_episode AND e.patient_id=p_patient AND e.nutritionist_id=p_professional
   AND e.status='active' AND patient.is_active IS TRUE AND professional.is_active IS TRUE
 )
$function$;
ALTER FUNCTION private.anamnesis_episode_active(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.anamnesis_episode_active(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.require_active_anamnesis_episode(p_episode uuid,p_patient uuid,p_professional uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE episode public.care_episodes%ROWTYPE;
BEGIN
 -- Conflicts with participant revocation's FOR UPDATE, including when the
 -- revocation commits while this statement is waiting. Lock the stored episode,
 -- never a newer active episode for the same patient.
 SELECT * INTO episode FROM public.care_episodes WHERE id=p_episode FOR SHARE;
 IF NOT FOUND OR episode.patient_id IS DISTINCT FROM p_patient
  OR episode.nutritionist_id IS DISTINCT FROM p_professional OR episode.status<>'active'
  OR NOT private.anamnesis_episode_active(p_episode,p_patient,p_professional) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='anamnesis_relationship_inactive';
 END IF;
END $function$;
ALTER FUNCTION private.require_active_anamnesis_episode(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.require_active_anamnesis_episode(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.guard_anamnesis_episode_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN
 -- The original PostgREST role survives SECURITY DEFINER callers. Checking
 -- current_user here would accidentally exempt the token RPCs. Trusted owners
 -- and service operations retain their existing migration/recovery authority.
 IF current_setting('role',true) IN ('anon','authenticated') THEN
  IF TG_OP<>'INSERT' THEN
   PERFORM private.require_active_anamnesis_episode(OLD.care_episode_id,OLD.patient_id,OLD.nutritionist_id);
  END IF;
  IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND
   (NEW.care_episode_id,NEW.patient_id,NEW.nutritionist_id) IS DISTINCT FROM
   (OLD.care_episode_id,OLD.patient_id,OLD.nutritionist_id)) THEN
   PERFORM private.require_active_anamnesis_episode(NEW.care_episode_id,NEW.patient_id,NEW.nutritionist_id);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$;
ALTER FUNCTION private.guard_anamnesis_episode_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.guard_anamnesis_episode_write() FROM PUBLIC,anon,authenticated;
-- Runs after the existing assignment trigger, so ordinary inserts without an
-- explicit episode keep their current contract. Errors roll back earlier
-- attachment reservation changes, receipts and revision timestamps atomically.
CREATE TRIGGER z_security_anamnesis_episode_write
BEFORE INSERT OR UPDATE OR DELETE ON public.anamnesis_records
FOR EACH ROW EXECUTE FUNCTION private.guard_anamnesis_episode_write();

CREATE OR REPLACE FUNCTION public.get_anamnesis_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_record record;
  v_template_json jsonb;
  v_nutritionist_name text;
begin
  select * into v_record from public.anamnesis_records
  where public_access_token = p_token;
  if not found then
    return jsonb_build_object('error','TOKEN_NOT_FOUND','message','Link inválido ou já utilizado.');
  end if;
  if v_record.token_expires_at is not null and v_record.token_expires_at < now() then
    return jsonb_build_object('error','TOKEN_EXPIRED','message','Este link expirou. Solicite um novo link ao seu nutricionista.');
  end if;
  if v_record.status in ('submitted','completed','validated') then
    return jsonb_build_object('error','ALREADY_COMPLETED','message','Este questionário já foi respondido. Obrigado!');
  end if;
  if not private.anamnesis_episode_active(v_record.care_episode_id,v_record.patient_id,v_record.nutritionist_id) then
    return jsonb_build_object('error','TOKEN_NOT_FOUND','message','Link inválido ou já utilizado.');
  end if;
  if v_record.template_snapshot is not null then
    v_template_json := v_record.template_snapshot;
  else
    select jsonb_build_object('title',title,'description',description,'sections',sections)
    into v_template_json from public.anamnesis_templates where id = v_record.template_id;
  end if;
  select name into v_nutritionist_name from public.user_profiles where id = v_record.nutritionist_id;
  return jsonb_build_object(
    'id',v_record.id,'date',v_record.date,'status',v_record.status,
    'content',v_record.content,'attachments',v_record.attachments,
    'lgpd_consented',v_record.lgpd_consented,
    'nutritionist_name',v_nutritionist_name,'template',v_template_json
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_access_anamnesis_attachment_object(p_name text, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    p_name ~ '^(public|nutritionist)/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+[.](jpg|jpeg|png|webp|pdf)$'
    and split_part(p_name,'/',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(p_name,'/',3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.anamnesis_records r
      where r.id=case when split_part(p_name,'/',3) ~ '^[0-9a-f-]{36}$'
        then split_part(p_name,'/',3)::uuid else null end
      and (not p_write or private.anamnesis_episode_active(r.care_episode_id,r.patient_id,r.nutritionist_id))
      and (
        (split_part(p_name,'/',1)='public' and (
          (not p_write and auth.uid()=r.nutritionist_id)
          or (r.public_access_token=split_part(p_name,'/',2)::uuid
            and (r.token_expires_at is null or r.token_expires_at>=now())
            and r.status not in ('submitted','completed','validated')
            and private.anamnesis_episode_active(r.care_episode_id,r.patient_id,r.nutritionist_id))
        ))
        or (split_part(p_name,'/',1)='nutritionist'
          and auth.uid()=r.nutritionist_id
          and auth.uid()=split_part(p_name,'/',2)::uuid
          and (not p_write or r.status='draft'))
      )
    ),false)
$function$;

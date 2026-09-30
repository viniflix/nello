-- Forward-only repairs exposed by the isolated Wave 02 adversarial matrix.
-- Existing function signatures and execution grants are preserved.
begin;

CREATE OR REPLACE FUNCTION public.create_lab_result_record(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v_patient uuid:=(p_payload->>'patient_id')::uuid;v_episode uuid;v_id bigint;begin
 if coalesce((p_payload->>'interpretation_confirmed')::boolean,false) then raise exception using errcode='23514',message='explicit_lab_interpretation_confirmation_required';end if;
 if nullif(p_payload->>'reference_min','')::numeric > nullif(p_payload->>'reference_max','')::numeric then raise exception using errcode='22023',message='invalid_laboratory_reference_range';end if;
 v_episode:=private.resolve_active_care_episode(v_patient);insert into public.lab_results(patient_id,care_episode_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,pdf_url,pdf_filename,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at)values(v_patient,v_episode,nullif(btrim(p_payload->>'test_name'),''),nullif(p_payload->>'test_value',''),nullif(p_payload->>'test_unit',''),nullif(p_payload->>'reference_min','')::numeric,nullif(p_payload->>'reference_max','')::numeric,coalesce(nullif(p_payload->>'status',''),'pending'),(p_payload->>'test_date')::date,nullif(p_payload->>'notes',''),nullif(p_payload->>'pdf_url',''),nullif(p_payload->>'pdf_filename',''),coalesce(nullif(p_payload->>'reference_source',''),'laboratory_report'),coalesce(p_payload->'reference_snapshot','{}'::jsonb),case when(p_payload->>'interpretation_confirmed')::boolean then'confirmed'else'pending'end,case when(p_payload->>'interpretation_confirmed')::boolean then auth.uid()else null end,case when(p_payload->>'interpretation_confirmed')::boolean then now()else null end)returning id into v_id;update public.lab_results set root_result_id=id where id=v_id;return(select to_jsonb(r)from public.lab_results r where id=v_id);end$function$;

CREATE OR REPLACE FUNCTION public.revise_lab_result_record(p_result_id bigint, p_payload jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.lab_results%rowtype;v_id bigint;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='lab_revision_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or v.record_status<>'active'or not v.is_latest_revision then raise exception using errcode='42501',message='lab_revision_forbidden';end if;if coalesce(nullif(p_payload->>'reference_min','')::numeric,v.reference_min)>coalesce(nullif(p_payload->>'reference_max','')::numeric,v.reference_max) then raise exception using errcode='22023',message='invalid_laboratory_reference_range';end if;update public.lab_results set is_latest_revision=false where id=v.id;insert into public.lab_results(patient_id,care_episode_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,pdf_url,pdf_filename,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision)values(v.patient_id,v.care_episode_id,coalesce(nullif(btrim(p_payload->>'test_name'),''),v.test_name),coalesce(nullif(p_payload->>'test_value',''),v.test_value),coalesce(nullif(p_payload->>'test_unit',''),v.test_unit),coalesce(nullif(p_payload->>'reference_min','')::numeric,v.reference_min),coalesce(nullif(p_payload->>'reference_max','')::numeric,v.reference_max),coalesce(nullif(p_payload->>'status',''),v.status),coalesce((p_payload->>'test_date')::date,v.test_date),coalesce(nullif(p_payload->>'notes',''),v.notes),coalesce(nullif(p_payload->>'pdf_url',''),v.pdf_url),coalesce(nullif(p_payload->>'pdf_filename',''),v.pdf_filename),coalesce(nullif(p_payload->>'reference_source',''),v.reference_source),coalesce(p_payload->'reference_snapshot',v.reference_snapshot),'pending',null,null,coalesce(v.root_result_id,v.id),v.id,v.revision_number+1,true)returning id into v_id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.result.revised',now(),jsonb_build_object('previous_id',v.id,'new_id',v_id,'reason',v_reason),v.patient_id,'laboratory',auth.uid());return(select to_jsonb(r)from public.lab_results r where id=v_id);end$function$;

CREATE OR REPLACE FUNCTION public.invalidate_lab_result_record(p_result_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare v public.lab_results%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='invalidation_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)then raise exception using errcode='42501',message='lab_invalidation_forbidden';end if;if v.record_status='invalidated' then return jsonb_build_object('id',v.id,'status','invalidated','already_invalidated',true);end if;update public.lab_results set record_status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,is_latest_revision=false where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.result.invalidated',now(),jsonb_build_object('result_id',v.id,'reason',v_reason),v.patient_id,'laboratory',auth.uid());return jsonb_build_object('id',v.id,'status','invalidated');end$function$;

CREATE OR REPLACE FUNCTION private.freeze_prescription_food_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_food record;
  v_measure record;
BEGIN
  IF TG_OP='UPDATE' AND NEW.food_id IS NOT DISTINCT FROM OLD.food_id THEN
    NEW.food_snapshot := OLD.food_snapshot;
  ELSE
  SELECT * INTO v_food FROM public.foods WHERE id = NEW.food_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='prescription_food_not_found';
  END IF;
  IF v_food.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='prescription_food_inactive', DETAIL=NEW.food_id::text;
  END IF;
    NEW.food_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'id',v_food.id,'name',v_food.name,'source',v_food.source,'source_id',v_food.source_id,
      'portion_size',v_food.portion_size,'base_unit',v_food.base_unit,'calories',v_food.calories,
      'protein',v_food.protein,'carbs',v_food.carbs,'fat',v_food.fat,'fiber',v_food.fiber,
      'sodium',v_food.sodium,'captured_at',now()
    ));
  END IF;
  IF TG_OP='UPDATE' AND NEW.food_id IS NOT DISTINCT FROM OLD.food_id
    AND NEW.unit IS NOT DISTINCT FROM OLD.unit THEN
    NEW.measure_snapshot := OLD.measure_snapshot;
  ELSE
    SELECT fm.id,fm.label,fm.weight_in_grams,fm.version,fm.source_snapshot INTO v_measure
    FROM public.food_measures fm
    WHERE (fm.reference_food_id=NEW.food_id OR fm.nutritionist_food_id=NEW.food_id)
      AND lower(fm.label)=lower(NEW.unit)
    ORDER BY fm.version DESC,fm.created_at DESC LIMIT 1;
    NEW.measure_snapshot := CASE WHEN FOUND THEN jsonb_strip_nulls(jsonb_build_object(
      'id',v_measure.id,'label',v_measure.label,'weight_in_grams',v_measure.weight_in_grams,
      'version',v_measure.version,'source',v_measure.source_snapshot
    )) ELSE jsonb_build_object('label',NEW.unit,'kind','prescription_unit') END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_meal_plan_foods_freeze_reference ON public.meal_plan_foods;
CREATE TRIGGER trg_meal_plan_foods_freeze_reference
BEFORE INSERT OR UPDATE ON public.meal_plan_foods
FOR EACH ROW EXECUTE FUNCTION private.freeze_prescription_food_reference();

CREATE OR REPLACE FUNCTION private.capture_energy_calculation_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin if new.protocol_code is null or new.protocol_version is null or new.confirmed_by is null or new.confirmed_by<>auth.uid()then raise exception using errcode='23514',message='energy_protocol_and_professional_confirmation_required';end if;if not exists(select 1 from public.clinical_protocol_catalog where(code,version)=(new.protocol_code,new.protocol_version)and domain='energy'and validation_status in('candidate','validated','restricted'))then raise exception using errcode='23514',message='unknown_energy_protocol_version';end if;insert into public.clinical_calculation_snapshots(patient_id,care_episode_id,nutritionist_id,domain,source_entity,source_id,protocol_code,protocol_version,input_snapshot,output_snapshot,professional_decision,confirmed_by,confirmed_at)values(new.patient_id,new.care_episode_id,new.nutritionist_id,'energy','energy_expenditure_calculations',new.id::text,new.protocol_code,new.protocol_version,new.input_snapshot,new.output_snapshot,'Protocolo, fatores e resultado confirmados pelo nutricionista responsÃ¡vel.',new.confirmed_by,coalesce(new.confirmed_at,now()));return new;end$function$;

CREATE OR REPLACE FUNCTION private.upsert_full_meal_plan(p_plan_id bigint, p_plan_data jsonb, p_meals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan public.meal_plans%rowtype;v_result jsonb;v_version integer;v_reason text;
begin
  if auth.uid()is null then raise exception using errcode='28000',message='authentication_required';end if;
  if jsonb_typeof(coalesce(p_plan_data,'{}'::jsonb))<>'object'or jsonb_typeof(coalesce(p_meals,'[]'::jsonb))<>'array'then raise exception using errcode='22023',message='invalid_meal_plan_payload';end if;
  select*into v_plan from public.meal_plans where id=p_plan_id for update;
  if not found or not private.can_write_active_meal_plan(v_plan.patient_id,v_plan.nutritionist_id,v_plan.care_episode_id)or v_plan.prescription_status in('archived','invalidated')then raise exception using errcode='42501',message='meal_plan_write_forbidden';end if;
  if not coalesce((p_plan_data->>'is_draft')::boolean,false) and (jsonb_array_length(coalesce(p_meals,'[]'))=0 or exists(select 1 from jsonb_array_elements(p_meals)m where jsonb_array_length(coalesce(m->'foods','[]'))=0))then raise exception using errcode='22023',message='finalized_meal_plan_requires_foods';end if;
  v_reason:=coalesce(nullif(btrim(p_plan_data->>'change_reason'),''),'EdiÃ§Ã£o confirmada pelo nutricionista');
  if not exists(select 1 from public.meal_plan_versions where meal_plan_id=p_plan_id)then
    perform private.capture_meal_plan_version(p_plan_id,'VersÃ£o inicial antes da primeira ediÃ§Ã£o',jsonb_build_object('origin','server_baseline'));
  end if;
  v_result:=private.write_full_meal_plan_storage(p_plan_id,p_plan_data,p_meals);
  update public.meal_plans set
    active_days=case when jsonb_typeof(p_plan_data->'active_days')='array'then p_plan_data->'active_days'else active_days end,
    plan_mode=case when p_plan_data->>'plan_mode'in('quantitative','qualitative','hybrid')then p_plan_data->>'plan_mode'else plan_mode end,
    prescription_status=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then'draft'else'finalized'end,
    confirmed_by=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then null else auth.uid()end,
    confirmed_at=case when coalesce((p_plan_data->>'is_draft')::boolean,false)then null else now()end,
    source_snapshot=jsonb_build_object('protocol_code','meal_plan.cfn_record','protocol_version',1,'professional_confirmed',not coalesce((p_plan_data->>'is_draft')::boolean,false),'captured_at',now()),
    updated_at=now()
  where id=p_plan_id;
  v_version:=private.capture_meal_plan_version(p_plan_id,v_reason,jsonb_build_object('origin','upsert_full_meal_plan','atomic',true));
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('version_number',v_version);
end$function$;

CREATE OR REPLACE FUNCTION public.update_data_subject_request(p_request_id uuid, p_expected_revision bigint, p_status text, p_reason text, p_retention_decision text DEFAULT NULL::text, p_legal_basis text DEFAULT NULL::text, p_assign_to_me boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_status in('fulfilled','rejected') and nullif(btrim(p_legal_basis),'') is null then raise exception using errcode='22023',message='privacy_completion_legal_basis_required';end if;
 if v_request.request_type='deletion' and p_status='fulfilled' and p_retention_decision is null then raise exception using errcode='22023',message='deletion_retention_decision_required';end if;
 v_event:=case p_status when 'triaged'then'triaged' when'in_progress'then'started' when'fulfilled'then'fulfilled' else'rejected'end;
 update public.data_subject_requests set status=p_status,assigned_to=case when p_assign_to_me then v_actor else assigned_to end,resolution_summary=case when p_status in('fulfilled','rejected')then v_reason else resolution_summary end,legal_basis=nullif(btrim(p_legal_basis),''),retention_decision=p_retention_decision,completed_at=case when p_status in('fulfilled','rejected')then now()else null end,updated_at=now(),revision=revision+1 where id=v_request.id;
 insert into public.data_subject_request_events(request_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_request.id,v_actor,v_event,v_request.status,p_status,v_reason,jsonb_strip_nulls(jsonb_build_object('retention_decision',p_retention_decision)));
 insert into public.notifications(user_id,type,content,is_read,title,message)values(v_request.subject_id,'privacy_request_update',jsonb_build_object('request_id',v_request.id,'status',p_status),false,'AtualizaÃ§Ã£o da sua solicitaÃ§Ã£o',case when p_status in('fulfilled','rejected')then v_reason else 'Sua solicitaÃ§Ã£o de privacidade avanÃ§ou para uma nova etapa.'end);
 return jsonb_build_object('id',v_request.id,'status',p_status,'revision',v_request.revision+1);
end$function$;

CREATE OR REPLACE FUNCTION public.build_my_data_export_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile jsonb;
  v_categories jsonb;
  v_attachments jsonb;
  v_chats jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select to_jsonb(profile_row)
         - array['is_admin', 'simulation_owner_id', 'invite_code', 'patient_invite_code']::text[]
    into v_profile
    from public.user_profiles profile_row
   where profile_row.id = v_actor
     and profile_row.user_type = 'patient';

  if v_profile is null then
    raise exception using errcode = '42501', message = 'patient_export_only';
  end if;

  v_attachments := private.export_subject_rows(
    'public.clinical_attachments'::regclass,
    'patient_id',
    v_actor,
    array['storage_bucket', 'storage_path', 'upload_expires_at']
  );
  select coalesce(jsonb_agg(to_jsonb(chat_row) - 'media_url' order by chat_row.created_at), '[]'::jsonb)
    into v_chats from public.chats chat_row where chat_row.from_id=v_actor or chat_row.to_id=v_actor;

  v_categories := jsonb_build_object(
    'care_episodes', private.export_subject_rows('public.care_episodes'::regclass, 'patient_id', v_actor),
    'care_relationships', private.export_subject_rows('public.nutritionist_patients'::regclass, 'patient_id', v_actor),
    'archived_care_relationships', private.export_subject_rows('public.archived_patient_links'::regclass, 'patient_id', v_actor),
    'anamneses', private.export_subject_rows(
      'public.anamnesis_records'::regclass,
      'patient_id',
      v_actor,
      array['public_access_token', 'token_expires_at', 'lgpd_ip_address']
    ),
    'appointments', private.export_subject_rows('public.appointments'::regclass, 'patient_id', v_actor),
    'checkins', private.export_subject_rows(
      'public.checkin_sessions'::regclass,
      'patient_id',
      v_actor,
      array['token']
    ),
    'clinical_records', private.export_subject_rows('public.clinical_records'::regclass, 'patient_id', v_actor),
    'clinical_attachments', v_attachments,
    'clinical_attachment_events', private.export_subject_rows('public.clinical_attachment_events'::regclass, 'patient_id', v_actor),
    'clinical_amendments', private.export_subject_rows('public.clinical_record_amendments'::regclass, 'patient_id', v_actor),
    'official_documents', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'source_type',a.source_type,'source_key',a.source_key,'signed_at',a.signed_at,'sha256',a.canonical_sha256,'authenticity_code',a.authenticity_code,'canonical_payload',a.canonical_payload #- '{professional,logo_storage_path}' #- '{professional,signature_storage_path}' #- '{professional,stamp_storage_path}')) from public.document_artifacts a where a.patient_id=v_actor and a.visibility='shared_with_patient' and a.status in('signed','superseded','invalidated')),'[]'::jsonb),
    'privacy_requests', private.export_subject_rows('public.data_subject_requests'::regclass,'subject_id',v_actor,array['assigned_to']),
    'anthropometry', private.export_subject_rows('public.growth_records'::regclass, 'patient_id', v_actor),
    'energy_calculations', private.export_subject_rows('public.energy_expenditure_calculations'::regclass, 'patient_id', v_actor),
    'glycemia', private.export_subject_rows('public.glycemia_records'::regclass, 'patient_id', v_actor),
    'laboratory_results', private.export_subject_rows(
      'public.lab_results'::regclass,
      'patient_id',
      v_actor,
      array['pdf_url']
    ),
    'goals', private.export_subject_rows('public.patient_goals'::regclass, 'patient_id', v_actor),
    'meal_plans', private.export_subject_rows('public.meal_plans'::regclass, 'patient_id', v_actor),
    'food_diary', private.export_subject_rows(
      'public.meals'::regclass,
      'patient_id',
      v_actor,
      array['photo_url']
    ),
    'food_diary_audit', private.export_subject_rows('public.meal_audit_log'::regclass, 'patient_id', v_actor),
    'food_diary_edit_history', private.export_subject_rows('public.meal_edit_history'::regclass, 'patient_id', v_actor),
    'meal_plan_versions', private.export_subject_rows('public.meal_plan_versions'::regclass, 'patient_id', v_actor),
    'prescriptions', private.export_subject_rows('public.prescriptions'::regclass, 'patient_id', v_actor),
    'progress_photos', private.export_subject_rows(
      'public.progress_photos'::regclass,
      'patient_id',
      v_actor,
      array['photo_url', 'storage_path']
    ),
    'progress_photo_events', private.export_subject_rows('public.progress_photo_events'::regclass, 'patient_id', v_actor),
    'legal_guardians', private.export_subject_rows('public.patient_episode_legal_guardians'::regclass, 'patient_id', v_actor, array['cpf_fingerprint']),
    'reminder_preferences', private.export_subject_rows('public.patient_reminder_preferences'::regclass, 'patient_id', v_actor),
    'module_sync_flags', private.export_subject_rows('public.patient_module_sync_flags'::regclass, 'patient_id', v_actor),
    'financial_records', private.export_subject_rows('public.financial_records'::regclass, 'patient_id', v_actor, array['attachment_url']),
    'financial_transactions', private.export_subject_rows('public.financial_transactions'::regclass, 'patient_id', v_actor),
    'messages', v_chats,
    'dispatched_communications', private.export_subject_rows('public.template_dispatch_log'::regclass, 'patient_id', v_actor),
    'supplement_logs', private.export_subject_rows('public.supplement_logs'::regclass, 'patient_id', v_actor),
    'weekly_summaries', private.export_subject_rows('public.weekly_summaries'::regclass, 'patient_id', v_actor),
    'achievements', private.export_subject_rows('public.user_achievements'::regclass, 'user_id', v_actor),
    'notifications', private.export_subject_rows(
      'public.notifications'::regclass,
      'user_id',
      v_actor,
      array['link_url']
    ),
    'notification_events', private.export_subject_rows('public.notification_events'::regclass, 'user_id', v_actor),
    'activity_history', private.export_subject_rows('public.activity_log'::regclass, 'patient_id', v_actor)
  );

  insert into public.activity_log(event_name, occurred_at, payload, patient_id, source_module, actor_user_id)
  values ('patient_data_export_generated', statement_timestamp(), jsonb_build_object('schema_version', 'nello-portability-1'), v_actor, 'privacy', v_actor);

  return jsonb_build_object(
    'schema_version', 'nello-portability-1',
    'generated_at', statement_timestamp(),
    'data_controller', 'Nello',
    'subject', v_profile,
    'categories', v_categories,
    'attachment_manifest', v_attachments,
    'scope_notice', 'Copia de portabilidade gerada pelo titular. URLs temporarias, segredos, tokens e dados tecnicos de seguranca foram omitidos.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_read_document_asset_object(p_bucket_id text,p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
select auth.uid() is not null and p_bucket_id='document-assets' and exists(
 select 1 from public.professional_document_identities i
 where p_name in(i.logo_storage_path,i.signature_storage_path,i.stamp_storage_path)
 and ((i.professional_id=auth.uid() and i.status='active') or exists(
 select 1 from public.document_artifacts a where a.identity_id=i.id and a.status in('signed','superseded')
 and (a.professional_id=auth.uid() or(a.patient_id=auth.uid() and a.visibility='shared_with_patient')))))
$function$;

CREATE OR REPLACE FUNCTION private.prevent_archived_meal_child_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_plan bigint; v_status text; v_row jsonb;
begin
 -- Check both parents on moves, and lock against a concurrent archive. INSERT
 -- must be protected too: an archived prescription cannot gain new children.
 for v_row in select value from jsonb_array_elements(jsonb_build_array(
   case when TG_OP<>'INSERT' then to_jsonb(OLD) end,
   case when TG_OP<>'DELETE' then to_jsonb(NEW) end)) where value<>'null'::jsonb loop
   if TG_TABLE_NAME='meal_plan_meals' then v_plan:=(v_row->>'meal_plan_id')::bigint;
   elsif TG_TABLE_NAME='meal_plan_foods' then select meal_plan_id into v_plan from public.meal_plan_meals where id=(v_row->>'meal_plan_meal_id')::bigint;
   else select m.meal_plan_id into v_plan from public.meal_plan_foods f join public.meal_plan_meals m on m.id=f.meal_plan_meal_id where f.id=(v_row->>'meal_plan_food_id')::bigint;end if;
   select prescription_status into v_status from public.meal_plans where id=v_plan for share;
   if v_status in('archived','invalidated')then raise exception using errcode='23514',message='archived_meal_plan_is_immutable';end if;
 end loop;
 if TG_OP='DELETE' then return OLD;end if;return NEW;
end$function$;
REVOKE ALL ON FUNCTION private.prevent_archived_meal_child_mutation() FROM public,anon,authenticated;
CREATE TRIGGER wave02_archived_meals BEFORE INSERT OR UPDATE OR DELETE ON public.meal_plan_meals FOR EACH ROW EXECUTE FUNCTION private.prevent_archived_meal_child_mutation();
CREATE TRIGGER wave02_archived_foods BEFORE INSERT OR UPDATE OR DELETE ON public.meal_plan_foods FOR EACH ROW EXECUTE FUNCTION private.prevent_archived_meal_child_mutation();
CREATE TRIGGER wave02_archived_substitutions BEFORE INSERT OR UPDATE OR DELETE ON public.meal_plan_food_substitutions FOR EACH ROW EXECUTE FUNCTION private.prevent_archived_meal_child_mutation();

commit;

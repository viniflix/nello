BEGIN;

-- Preserve every legacy row; select one operational identity, preserving the
-- professional's latest explicit action before considering automatic updates.
ALTER TABLE public.feed_tasks ADD COLUMN is_current boolean NOT NULL DEFAULT true;
WITH ranked AS (
 SELECT id, row_number() OVER (
  PARTITION BY nutritionist_id,source_type,source_id
  ORDER BY (metadata->>'last_action' IN ('resolved','resolved_batch','snoozed','snoozed_batch','reopened')) DESC NULLS LAST,
   CASE WHEN pg_input_is_valid(metadata->>'last_action_at','timestamp with time zone')
     THEN (metadata->>'last_action_at')::timestamptz ELSE updated_at END DESC NULLS LAST,
   updated_at DESC NULLS LAST,id DESC
 ) AS position FROM public.feed_tasks WHERE source_id IS NOT NULL
) UPDATE public.feed_tasks f SET is_current=false FROM ranked r WHERE f.id=r.id AND r.position>1;
CREATE UNIQUE INDEX feed_tasks_current_identity ON public.feed_tasks(nutritionist_id,source_type,source_id)
 WHERE is_current AND source_id IS NOT NULL;

-- SQL numeric remains exact; reject fractions of a cent without rewriting history.
ALTER TABLE public.financial_transactions ADD CONSTRAINT wave09_amount_cents CHECK(amount=round(amount,2));
ALTER TABLE public.financial_transactions ADD CONSTRAINT wave09_net_amount_cents CHECK(net_amount=round(net_amount,2));
ALTER TABLE public.services ADD CONSTRAINT wave09_service_price_cents CHECK(price=round(price,2));
ALTER TABLE public.financial_transactions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.services ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.appointments ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION private.wave09_stamp_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN NEW.updated_at:=clock_timestamp();RETURN NEW;END $function$;
REVOKE ALL ON FUNCTION private.wave09_stamp_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave09_stamp_revision BEFORE INSERT OR UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION private.wave09_stamp_revision();
CREATE TRIGGER wave09_stamp_revision BEFORE INSERT OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION private.wave09_stamp_revision();
CREATE TRIGGER wave09_stamp_revision BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION private.wave09_stamp_revision();
CREATE TRIGGER wave09_stamp_revision BEFORE INSERT OR UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION private.wave09_stamp_revision();

-- Receipts contain identifiers and hashes only, never clinical payloads.
CREATE TABLE private.mutation_receipts (
 actor uuid NOT NULL, nonce uuid NOT NULL, operation text NOT NULL,
 fingerprint text NOT NULL, result_ids text[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor,nonce)
);
REVOKE ALL ON private.mutation_receipts FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.wave09_receipt(p_nonce uuid,p_operation text,p_fingerprint text,p_ids text[] DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_actor uuid:=auth.uid(); v_receipt private.mutation_receipts%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR p_nonce IS NULL THEN RAISE EXCEPTION USING errcode='42501',message='authentication_required'; END IF;
 PERFORM private.wave05_require_active_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||p_nonce::text,0));
 SELECT * INTO v_receipt FROM private.mutation_receipts WHERE actor=v_actor AND nonce=p_nonce;
 IF FOUND THEN
  IF v_receipt.operation<>p_operation OR v_receipt.fingerprint<>p_fingerprint THEN
   RAISE EXCEPTION USING errcode='22023',message='idempotency_key_reused';
  END IF;
  RETURN v_receipt.result_ids;
 END IF;
 IF p_ids IS NOT NULL THEN
  INSERT INTO private.mutation_receipts(actor,nonce,operation,fingerprint,result_ids)
   VALUES(v_actor,p_nonce,p_operation,p_fingerprint,p_ids);
 END IF;
 RETURN p_ids;
END $function$;
REVOKE ALL ON FUNCTION private.wave09_receipt(uuid,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.wave09_receipt(uuid,text,text,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION private.wave09_professional_actor() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $function$
 SELECT auth.uid() IS NOT NULL AND private.has_current_clinical_capacity(auth.uid())
$function$;
REVOKE ALL ON FUNCTION private.wave09_professional_actor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.wave09_professional_actor() TO authenticated;

-- Invoker rights preserve all existing RLS policies, Storage bindings and guards.
CREATE OR REPLACE FUNCTION public.mutate_record_idempotently(p_table text,p_values jsonb,p_id text,p_expected timestamptz,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_ids text[]; v_hash text; v_columns text; v_values text; v_row jsonb; v_has_revision boolean;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING errcode='42501',message='account_changed'; END IF;
 IF p_table NOT IN ('financial_transactions','services','growth_records','energy_expenditure_calculations','progress_photos','anamnesis_records','meal_plans')
  OR jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR octet_length(p_values::text)>262144
  OR p_values ?| ARRAY['id','created_at','updated_at'] THEN RAISE EXCEPTION USING errcode='22023',message='invalid_mutation'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT EXISTS(
  SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||p_table) AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
 )) THEN RAISE EXCEPTION USING errcode='22023',message='unknown_column'; END IF;
 v_hash:=md5(jsonb_build_object('table',p_table,'values',p_values,'id',p_id,'expected',p_expected)::text);
 v_ids:=private.wave09_receipt(p_nonce,'record:'||p_table,v_hash);
 IF v_ids IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id::text=$1',p_table) INTO v_row USING v_ids[1];
  IF v_row IS NULL THEN RAISE EXCEPTION USING errcode='42501',message='record_unavailable'; END IF;
  RETURN v_row;
 END IF;
 IF p_table='meal_plans' AND p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.meal_plans WHERE id::text=p_id AND is_draft AND nutritionist_id=p_actor) THEN RAISE EXCEPTION USING errcode='42501',message='draft_plan_required';END IF;
 IF p_table='anamnesis_records' AND p_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.anamnesis_records WHERE id::text=p_id
   AND patient_id=(p_values->>'patient_id')::uuid AND nutritionist_id=p_actor
   AND status IN ('draft','pending_patient')) THEN RAISE EXCEPTION USING errcode='42501',message='open_anamnesis_required';END IF;
 END IF;
 SELECT string_agg(format('%I',key),',' ORDER BY key),string_agg(format('v.%I',key),',' ORDER BY key)
  INTO v_columns,v_values FROM jsonb_object_keys(p_values) key;
 IF v_columns IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='empty_mutation'; END IF;
 IF p_id IS NULL THEN
  EXECUTE format('INSERT INTO public.%1$I AS t (%2$s) SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I,$1) v RETURNING to_jsonb(t)',p_table,v_columns,v_values)
   INTO v_row USING p_values;
 ELSE
  SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||p_table) AND attname='updated_at' AND NOT attisdropped) INTO v_has_revision;
  IF v_has_revision AND p_expected IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='revision_required'; END IF;
  EXECUTE format('UPDATE public.%1$I t SET (%2$s)=(SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I,$1) v) %5$s WHERE t.id::text=$2 %4$s RETURNING to_jsonb(t)',
   p_table,v_columns,v_values,CASE WHEN v_has_revision THEN 'AND t.updated_at=$3' ELSE '' END,CASE WHEN v_has_revision THEN ',updated_at=clock_timestamp()' ELSE '' END)
   INTO v_row USING p_values,p_id,p_expected;
  IF v_row IS NULL THEN RAISE EXCEPTION USING errcode='PT409',message='record_changed_or_unavailable'; END IF;
 END IF;
 PERFORM private.wave09_receipt(p_nonce,'record:'||p_table,v_hash,ARRAY[v_row->>'id']);
 RETURN v_row;
END $function$;
REVOKE ALL ON FUNCTION public.mutate_record_idempotently(text,jsonb,text,timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_record_idempotently(text,jsonb,text,timestamptz,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_financial_installments(p_values jsonb,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_ids text[]; v_rows jsonb:='[]'; v_value jsonb; v_row jsonb; v_index integer:=0; v_hash text;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING errcode='42501',message='account_changed'; END IF;
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'array' OR jsonb_array_length(p_values) NOT BETWEEN 2 AND 120 OR octet_length(p_values::text)>262144 THEN
  RAISE EXCEPTION USING errcode='22023',message='invalid_installments'; END IF;
 v_hash:=md5(p_values::text);
 v_ids:=private.wave09_receipt(p_nonce,'installments',v_hash);
 IF v_ids IS NOT NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY array_position(v_ids,t.id::text)),'[]') INTO v_rows FROM public.financial_transactions t WHERE t.id::text=ANY(v_ids);
  IF jsonb_array_length(v_rows)<>cardinality(v_ids) THEN RAISE EXCEPTION USING errcode='42501',message='records_unavailable'; END IF;
  RETURN v_rows;
 END IF;
 v_ids:=ARRAY[]::text[];
 FOR v_value IN SELECT value FROM jsonb_array_elements(p_values) LOOP
  v_row:=public.mutate_record_idempotently('financial_transactions',v_value,NULL,NULL,md5(p_nonce::text||':'||v_index::text)::uuid,p_actor);
  v_rows:=v_rows||jsonb_build_array(v_row);v_ids:=array_append(v_ids,v_row->>'id');v_index:=v_index+1;
 END LOOP;
 PERFORM private.wave09_receipt(p_nonce,'installments',v_hash,v_ids);
 RETURN v_rows;
END $function$;
REVOKE ALL ON FUNCTION public.save_financial_installments(jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_financial_installments(jsonb,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_feed_task(p_values jsonb,p_expected timestamptz,p_action text,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_row public.feed_tasks%ROWTYPE; v_value public.feed_tasks%ROWTYPE; v_ids text[]; v_hash text; v_history jsonb; v_at timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING errcode='42501',message='account_changed'; END IF;
 PERFORM private.wave05_require_active_actor();
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR octet_length(p_values::text)>262144 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_task'; END IF;
 v_value:=jsonb_populate_record(NULL::public.feed_tasks,p_values);
 IF v_value.nutritionist_id IS DISTINCT FROM p_actor OR v_value.source_id IS NULL OR v_value.source_type IS NULL
  OR (v_value.patient_id IS NOT NULL AND NOT private.wave05_chat_relationship(p_actor,v_value.patient_id))
  OR NOT private.wave09_professional_actor() THEN RAISE EXCEPTION USING errcode='42501',message='forbidden'; END IF;
 IF p_action IS NOT NULL AND p_action NOT IN ('resolved','snoozed','reopened','resolved_batch','snoozed_batch') THEN RAISE EXCEPTION USING errcode='22023',message='invalid_action'; END IF;
 v_hash:=md5(jsonb_build_object('values',p_values,'action',p_action,'expected',p_expected)::text);
 v_ids:=private.wave09_receipt(p_nonce,'feed',v_hash);
 IF v_ids IS NOT NULL THEN
  SELECT * INTO v_row FROM public.feed_tasks WHERE id::text=v_ids[1] AND is_current;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='task_unavailable'; END IF;
  RETURN to_jsonb(v_row);
 END IF;
 -- The unique index serializes concurrent first sightings. DO NOTHING preserves
 -- an explicit resolution recorded while another browser generated its snapshot.
 INSERT INTO public.feed_tasks(nutritionist_id,patient_id,source_type,source_id,title,description,priority_score,priority_reason,status,snooze_until,metadata,first_seen_at,last_seen_at)
 VALUES(p_actor,v_value.patient_id,v_value.source_type,v_value.source_id,v_value.title,v_value.description,coalesce(v_value.priority_score,0),v_value.priority_reason,'open',NULL,coalesce(v_value.metadata,'{}'),v_at,v_at)
 ON CONFLICT(nutritionist_id,source_type,source_id) WHERE is_current AND source_id IS NOT NULL DO NOTHING;
 SELECT * INTO v_row FROM public.feed_tasks WHERE nutritionist_id=p_actor AND source_type=v_value.source_type AND source_id=v_value.source_id AND is_current FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='task_unavailable'; END IF;
 IF p_expected IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='task_changed'; END IF;
 IF p_action IS NOT NULL THEN
  IF p_action IN ('resolved','resolved_batch') THEN v_value.status:='resolved';v_value.snooze_until:=NULL;
  ELSIF p_action='reopened' THEN v_value.status:='open';v_value.snooze_until:=NULL;
  ELSE v_value.status:='snoozed';IF v_value.snooze_until IS NULL OR v_value.snooze_until<=v_at THEN RAISE EXCEPTION USING errcode='22023',message='future_snooze_required'; END IF;END IF;
  v_history:=jsonb_build_array(jsonb_build_object('action',p_action,'at',v_at,'status',v_value.status,'snooze_until',v_value.snooze_until));
  SELECT v_history||coalesce(jsonb_agg(value),'[]') INTO v_history FROM (SELECT value FROM jsonb_array_elements(coalesce(v_row.metadata->'audit_history','[]')) LIMIT 9) old;
  UPDATE public.feed_tasks SET status=v_value.status,snooze_until=v_value.snooze_until,resolved_at=CASE WHEN v_value.status='resolved' THEN v_at ELSE NULL END,
   metadata=coalesce(v_row.metadata,'{}')||jsonb_build_object('audit_history',v_history,'last_action',p_action,'last_action_at',v_at),updated_at=v_at WHERE id=v_row.id RETURNING * INTO v_row;
 ELSE
  UPDATE public.feed_tasks SET patient_id=v_value.patient_id,title=v_value.title,description=v_value.description,priority_score=coalesce(v_value.priority_score,0),priority_reason=v_value.priority_reason,
   metadata=coalesce(v_row.metadata,'{}')||coalesce(v_value.metadata,'{}'),last_seen_at=v_at,updated_at=v_at,
   status=CASE WHEN status='snoozed' AND snooze_until<=v_at THEN 'open' ELSE status END,
   snooze_until=CASE WHEN status='snoozed' AND snooze_until<=v_at THEN NULL ELSE snooze_until END
   WHERE id=v_row.id RETURNING * INTO v_row;
 END IF;
 PERFORM private.wave09_receipt(p_nonce,'feed',v_hash,ARRAY[v_row.id::text]);
 RETURN to_jsonb(v_row);
END $function$;
REVOKE ALL ON FUNCTION public.save_feed_task(jsonb,timestamptz,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_feed_task(jsonb,timestamptz,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.wave09_delete_receipts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN DELETE FROM private.mutation_receipts WHERE actor=OLD.id; RETURN OLD; END $function$;
REVOKE ALL ON FUNCTION private.wave09_delete_receipts() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave09_delete_receipts AFTER DELETE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION private.wave09_delete_receipts();

ALTER TABLE public.nutritionist_foods ADD COLUMN external_provenance jsonb;
ALTER TABLE public.nutritionist_foods ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.nutritionist_foods ADD COLUMN reviewed_by uuid;
ALTER TABLE public.nutritionist_foods ADD COLUMN revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.nutritionist_foods ADD CONSTRAINT wave09_external_review CHECK (
 external_provenance IS NULL OR coalesce((
  reviewed_at IS NOT NULL AND reviewed_by=nutritionist_id
  AND external_provenance->>'source' IN ('openfoodfacts','fatsecret')
  AND external_provenance->>'basis'='100g'
  AND external_provenance ?& ARRAY['source','product_id','fetched_at','basis']
  AND energy_kcal IS NOT NULL AND protein_g IS NOT NULL AND carbohydrate_g IS NOT NULL AND lipid_g IS NOT NULL
  ),false));
CREATE OR REPLACE FUNCTION private.wave09_food_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN NEW.revision:=CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.revision+1 END;RETURN NEW;END $function$;
REVOKE ALL ON FUNCTION private.wave09_food_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wave09_food_revision BEFORE INSERT OR UPDATE ON public.nutritionist_foods FOR EACH ROW EXECUTE FUNCTION private.wave09_food_revision();

CREATE OR REPLACE FUNCTION public.save_reviewed_custom_food(p_food_id uuid,p_food jsonb,p_measures jsonb,p_provenance jsonb,p_reviewed boolean,p_expected bigint,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_ids text[];v_hash text;v_result jsonb;v_row public.nutritionist_foods%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor OR NOT private.has_current_clinical_capacity(p_actor) THEN
  RAISE EXCEPTION USING errcode='42501',message='forbidden';END IF;
 PERFORM private.wave05_require_active_actor();
 IF octet_length(coalesce(p_food,'{}')::text||coalesce(p_measures,'[]')::text||coalesce(p_provenance,'{}')::text)>262144
  OR p_food ?| ARRAY['id','nutritionist_id','revision','reviewed_at','reviewed_by','external_provenance'] THEN RAISE EXCEPTION USING errcode='22023',message='invalid_food_payload';END IF;
 IF p_provenance IS NOT NULL THEN
  IF p_reviewed IS DISTINCT FROM true OR jsonb_typeof(p_provenance) IS DISTINCT FROM 'object'
   OR p_provenance->>'source' IS NULL OR p_provenance->>'source' NOT IN ('openfoodfacts','fatsecret')
   OR p_provenance->>'basis' IS DISTINCT FROM '100g'
   OR length(coalesce(p_provenance->>'product_id','')) NOT BETWEEN 1 AND 120
   OR NOT coalesce(pg_input_is_valid(p_provenance->>'fetched_at','timestamp with time zone'),false)
   OR NOT (p_food ?& ARRAY['energy_kcal','protein_g','carbohydrate_g','lipid_g']) THEN
   RAISE EXCEPTION USING errcode='22023',message='external_food_review_required';END IF;
  IF (p_provenance->>'fetched_at')::timestamptz>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION USING errcode='22023',message='invalid_provenance_timestamp';END IF;
 END IF;
 v_hash:=md5(jsonb_build_object('id',p_food_id,'food',p_food,'measures',p_measures,'provenance',p_provenance,'reviewed',p_reviewed,'expected',p_expected)::text);
 v_ids:=private.wave09_receipt(p_nonce,'food',v_hash);
 IF v_ids IS NOT NULL THEN
  SELECT * INTO v_row FROM public.nutritionist_foods WHERE id::text=v_ids[1] AND nutritionist_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='food_unavailable';END IF;
  RETURN jsonb_build_object('id',v_row.id,'revision',v_row.revision);
 END IF;
 IF p_food_id IS NOT NULL THEN
  SELECT * INTO v_row FROM public.nutritionist_foods WHERE id=p_food_id AND nutritionist_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='food_not_owned';END IF;
  IF p_expected IS NULL OR v_row.revision<>p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='food_changed';END IF;
  IF v_row.external_provenance IS NOT NULL AND p_provenance IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='external_food_review_required';END IF;
 END IF;
 v_result:=public.save_custom_food_with_measures(p_food_id,p_food,p_measures);
 UPDATE public.nutritionist_foods SET external_provenance=p_provenance,
  reviewed_at=CASE WHEN p_provenance IS NOT NULL THEN clock_timestamp() ELSE NULL END,
  reviewed_by=CASE WHEN p_provenance IS NOT NULL THEN p_actor ELSE NULL END
  WHERE id=(v_result->>'id')::uuid AND nutritionist_id=p_actor RETURNING * INTO v_row;
 PERFORM private.wave09_receipt(p_nonce,'food',v_hash,ARRAY[v_row.id::text]);
 RETURN v_result||jsonb_build_object('revision',v_row.revision);
END $function$;
REVOKE ALL ON FUNCTION public.save_reviewed_custom_food(uuid,jsonb,jsonb,jsonb,boolean,bigint,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_reviewed_custom_food(uuid,jsonb,jsonb,jsonb,boolean,bigint,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.perform_clinical_operation(p_operation text,p_arguments jsonb,p_expected timestamptz,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_ids text[];v_hash text;v_result jsonb;v_table text;v_id text;v_row jsonb;v_current timestamptz;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING errcode='42501',message='account_changed';END IF;
 IF jsonb_typeof(p_arguments) IS DISTINCT FROM 'object' OR octet_length(p_arguments::text)>262144 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_arguments';END IF;
 v_table:=CASE p_operation WHEN 'appointment' THEN 'appointments' WHEN 'meal_plan' THEN 'meal_plans' WHEN 'lab_result' THEN 'lab_results' WHEN 'diary_meal' THEN 'meals' END;
 IF v_table IS NULL THEN RAISE EXCEPTION USING errcode='22023',message='invalid_operation';END IF;
 v_hash:=md5(jsonb_build_object('arguments',p_arguments,'expected',p_expected)::text);
 v_ids:=private.wave09_receipt(p_nonce,'clinical:'||p_operation,v_hash);
 IF v_ids IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text=$1',v_table) INTO v_row USING v_ids[1];
  IF v_row IS NULL THEN RAISE EXCEPTION USING errcode='42501',message='record_unavailable';END IF;
  IF p_operation='appointment' THEN
   RETURN jsonb_build_object('appointment',v_row,'transaction',(SELECT to_jsonb(t) FROM public.financial_transactions t WHERE appointment_id::text=v_ids[1]));
  ELSIF p_operation='lab_result' THEN RETURN v_row;
  ELSE RETURN to_jsonb(v_ids[1]::bigint);END IF;
 END IF;
 IF p_operation='appointment' THEN
  IF p_arguments->>'p_appointment_id' IS NOT NULL THEN
   SELECT updated_at INTO v_current FROM public.appointments WHERE id=(p_arguments->>'p_appointment_id')::bigint FOR UPDATE;
   IF NOT FOUND OR p_expected IS NULL OR v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='appointment_changed';END IF;
  END IF;
  v_result:=public.save_appointment_with_finance(p_arguments->'p_appointment',coalesce(p_arguments->'p_financial','{}'),(p_arguments->>'p_appointment_id')::bigint);
  v_id:=v_result->'appointment'->>'id';
 ELSIF p_operation='meal_plan' THEN
  v_id:=public.create_meal_plan_atomic(p_arguments->'p_plan_data')::text;v_result:=to_jsonb(v_id::bigint);
 ELSIF p_operation='lab_result' THEN
  v_result:=public.create_lab_result_record(p_arguments->'p_payload');v_id:=v_result->>'id';
 ELSE
  IF p_arguments->>'p_meal_id' IS NOT NULL THEN
   SELECT updated_at INTO v_current FROM public.meals WHERE id=(p_arguments->>'p_meal_id')::bigint FOR UPDATE;
   IF NOT FOUND OR p_expected IS NULL OR v_current IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='diary_meal_changed';END IF;
  END IF;
  v_id:=public.save_patient_diary_meal((p_arguments->>'p_meal_id')::bigint,p_arguments->'p_payload',p_arguments->'p_items')::text;v_result:=to_jsonb(v_id::bigint);
 END IF;
 IF v_id IS NULL THEN RAISE EXCEPTION USING errcode='P0001',message='unconfirmed_operation';END IF;
 PERFORM private.wave09_receipt(p_nonce,'clinical:'||p_operation,v_hash,ARRAY[v_id]);
 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.perform_clinical_operation(text,jsonb,timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.perform_clinical_operation(text,jsonb,timestamptz,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_anamnesis_draft_revision(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_result jsonb;v_updated timestamptz;
BEGIN
 v_result:=public.get_anamnesis_by_token(p_token);
 IF v_result IS NULL OR v_result ? 'error' THEN RETURN v_result;END IF;
 SELECT updated_at INTO v_updated FROM public.anamnesis_records WHERE public_access_token=p_token;
 RETURN v_result||jsonb_build_object('updated_at',v_updated);
END $function$;
REVOKE ALL ON FUNCTION public.get_anamnesis_draft_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_draft_revision(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_anamnesis_draft_revision(p_token uuid,p_content jsonb,p_lgpd_consented boolean,p_expected timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_result jsonb;v_record public.anamnesis_records%ROWTYPE;
BEGIN
 v_result:=public.get_anamnesis_by_token(p_token);
 IF v_result IS NULL OR v_result ? 'error' THEN RAISE EXCEPTION USING errcode='42501',message='invalid_anamnesis_link';END IF;
 SELECT * INTO v_record FROM public.anamnesis_records WHERE public_access_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='invalid_anamnesis_link';END IF;
 IF v_record.content IS NOT DISTINCT FROM p_content AND coalesce(v_record.lgpd_consented,false)=coalesce(p_lgpd_consented,false) THEN
  RETURN jsonb_build_object('updated_at',v_record.updated_at);
 END IF;
 IF p_expected IS NULL OR v_record.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='anamnesis_changed';END IF;
 PERFORM public.submit_anamnesis_by_token(p_token,p_content,'draft',p_lgpd_consented,NULL,NULL);
 SELECT updated_at INTO v_record.updated_at FROM public.anamnesis_records WHERE id=v_record.id;
 RETURN jsonb_build_object('updated_at',v_record.updated_at);
END $function$;
REVOKE ALL ON FUNCTION public.save_anamnesis_draft_revision(uuid,jsonb,boolean,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_anamnesis_draft_revision(uuid,jsonb,boolean,timestamptz) TO anon,authenticated;

CREATE TABLE private.anamnesis_completion_receipts (
 token_hash text NOT NULL, nonce uuid NOT NULL, fingerprint text NOT NULL,
 record_id uuid NOT NULL REFERENCES public.anamnesis_records(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(token_hash,nonce)
);
REVOKE ALL ON private.anamnesis_completion_receipts FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.complete_anamnesis_revision(p_token uuid,p_content jsonb,p_lgpd_consented boolean,p_expected timestamptz,p_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_token_hash text;v_fingerprint text;v_receipt private.anamnesis_completion_receipts%ROWTYPE;v_record public.anamnesis_records%ROWTYPE;v_result jsonb;
BEGIN
 IF p_token IS NULL OR p_nonce IS NULL OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR octet_length(p_content::text)>262144 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_anamnesis_payload';END IF;
 v_token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
 v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('content',p_content,'consent',p_lgpd_consented)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_token_hash||p_nonce::text,0));
 SELECT * INTO v_receipt FROM private.anamnesis_completion_receipts WHERE token_hash=v_token_hash AND nonce=p_nonce;
 IF FOUND THEN
  IF v_receipt.fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING errcode='22023',message='idempotency_key_reused';END IF;
  IF v_receipt.created_at<clock_timestamp()-interval '30 minutes' THEN RAISE EXCEPTION USING errcode='42501',message='completion_receipt_expired';END IF;
  RETURN jsonb_build_object('success',true,'status','submitted');
 END IF;
 v_result:=public.get_anamnesis_by_token(p_token);
 IF v_result IS NULL OR v_result ? 'error' THEN RAISE EXCEPTION USING errcode='42501',message='invalid_anamnesis_link';END IF;
 SELECT * INTO v_record FROM public.anamnesis_records WHERE public_access_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='invalid_anamnesis_link';END IF;
 IF p_expected IS NULL OR v_record.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='anamnesis_changed';END IF;
 v_result:=public.submit_anamnesis_by_token(p_token,p_content,'submitted',p_lgpd_consented,NULL,NULL);
 INSERT INTO private.anamnesis_completion_receipts(token_hash,nonce,fingerprint,record_id) VALUES(v_token_hash,p_nonce,v_fingerprint,v_record.id);
 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION public.complete_anamnesis_revision(uuid,jsonb,boolean,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_anamnesis_revision(uuid,jsonb,boolean,timestamptz,uuid) TO anon,authenticated;
-- A draft meal and its children form one operation. A lost HTTP response must
-- never require client-side deletion of a possibly committed meal.
CREATE OR REPLACE FUNCTION public.save_draft_meal(p_plan_id bigint,p_meal_id bigint,p_meal jsonb,p_expected timestamptz,p_nonce uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE v_plan public.meal_plans%ROWTYPE;v_meal public.meal_plan_meals%ROWTYPE;v_food jsonb;v_sub jsonb;v_food_id bigint;v_ids text[];v_hash text;v_index integer:=0;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING errcode='42501',message='account_changed';END IF;
 IF jsonb_typeof(p_meal) IS DISTINCT FROM 'object' OR octet_length(p_meal::text)>262144
  OR jsonb_typeof(coalesce(p_meal->'foods','[]')) IS DISTINCT FROM 'array'
  OR jsonb_array_length(coalesce(p_meal->'foods','[]'))>100 THEN RAISE EXCEPTION USING errcode='22023',message='invalid_meal';END IF;
 v_hash:=md5(jsonb_build_object('plan',p_plan_id,'meal_id',p_meal_id,'meal',p_meal,'expected',p_expected)::text);
 v_ids:=private.wave09_receipt(p_nonce,'draft_meal',v_hash);
 IF v_ids IS NOT NULL THEN
  IF v_ids[3]='deleted' THEN
   IF NOT EXISTS(SELECT 1 FROM public.meal_plans WHERE id=p_plan_id AND is_draft AND nutritionist_id=p_actor) THEN RAISE EXCEPTION USING errcode='42501',message='draft_plan_required';END IF;
   RETURN jsonb_build_object('id',v_ids[1]::bigint,'deleted',true,'plan_revision',v_ids[2]);
  END IF;
  SELECT * INTO v_meal FROM public.meal_plan_meals WHERE id::text=v_ids[1] AND meal_plan_id=p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='meal_unavailable';END IF;
  RETURN to_jsonb(v_meal)||jsonb_build_object('plan_revision',v_ids[2],'deleted',false);
 END IF;
 SELECT * INTO v_plan FROM public.meal_plans WHERE id=p_plan_id AND is_draft AND nutritionist_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='draft_plan_required';END IF;
 IF p_expected IS NULL OR v_plan.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION USING errcode='PT409',message='draft_changed';END IF;
 IF coalesce((p_meal->>'delete')::boolean,false) THEN
  DELETE FROM public.meal_plan_meals WHERE id=p_meal_id AND meal_plan_id=p_plan_id RETURNING * INTO v_meal;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='meal_unavailable';END IF;
 ELSE
 IF p_meal_id IS NULL THEN
  INSERT INTO public.meal_plan_meals(meal_plan_id,name,meal_type,meal_time,notes,order_index)
  VALUES(p_plan_id,p_meal->>'name',(p_meal->>'meal_type')::public.meal_type_enum,nullif(p_meal->>'meal_time','')::time,p_meal->>'notes',coalesce((p_meal->>'order_index')::integer,0)) RETURNING * INTO v_meal;
 ELSE
  UPDATE public.meal_plan_meals SET name=p_meal->>'name',meal_type=(p_meal->>'meal_type')::public.meal_type_enum,
   meal_time=nullif(p_meal->>'meal_time','')::time,notes=p_meal->>'notes',order_index=coalesce((p_meal->>'order_index')::integer,0)
   WHERE id=p_meal_id AND meal_plan_id=p_plan_id RETURNING * INTO v_meal;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode='42501',message='meal_unavailable';END IF;
  DELETE FROM public.meal_plan_food_substitutions WHERE meal_plan_food_id IN(SELECT id FROM public.meal_plan_foods WHERE meal_plan_meal_id=p_meal_id);
  DELETE FROM public.meal_plan_foods WHERE meal_plan_meal_id=p_meal_id;
 END IF;
 FOR v_food IN SELECT value FROM jsonb_array_elements(coalesce(p_meal->'foods','[]')) LOOP
  INSERT INTO public.meal_plan_foods(meal_plan_meal_id,food_id,quantity,unit,calories,protein,carbs,fat,notes,patient_description,order_index)
  VALUES(v_meal.id,(v_food->>'food_id')::uuid,(v_food->>'quantity')::numeric,v_food->>'unit',
   coalesce((v_food->>'calories')::numeric,0),coalesce((v_food->>'protein')::numeric,0),coalesce((v_food->>'carbs')::numeric,0),coalesce((v_food->>'fat')::numeric,0),
   v_food->>'notes',v_food->>'patient_description',coalesce((v_food->>'order_index')::integer,v_index)) RETURNING id INTO v_food_id;
  FOR v_sub IN SELECT value FROM jsonb_array_elements(coalesce(v_food->'substitutes','[]')) LOOP
   INSERT INTO public.meal_plan_food_substitutions(meal_plan_food_id,substitute_food_id,quantity,unit)
   VALUES(v_food_id,coalesce(v_sub->>'id',v_sub->>'food_id')::uuid,nullif(v_sub->>'quantity','')::numeric,v_sub->>'unit');
  END LOOP;
  v_index:=v_index+1;
 END LOOP;
 UPDATE public.meal_plan_meals SET (total_calories,total_protein,total_carbs,total_fat)=
  (SELECT coalesce(sum(calories),0),coalesce(sum(protein),0),coalesce(sum(carbs),0),coalesce(sum(fat),0) FROM public.meal_plan_foods WHERE meal_plan_meal_id=v_meal.id)
  WHERE id=v_meal.id RETURNING * INTO v_meal;
 END IF;
 UPDATE public.meal_plans SET (daily_calories,daily_protein,daily_carbs,daily_fat)=
  (SELECT coalesce(sum(total_calories),0),coalesce(sum(total_protein),0),coalesce(sum(total_carbs),0),coalesce(sum(total_fat),0) FROM public.meal_plan_meals WHERE meal_plan_id=p_plan_id),updated_at=clock_timestamp() WHERE id=p_plan_id RETURNING updated_at INTO v_plan.updated_at;
 PERFORM private.wave09_receipt(p_nonce,'draft_meal',v_hash,ARRAY[v_meal.id::text,v_plan.updated_at::text,CASE WHEN coalesce((p_meal->>'delete')::boolean,false) THEN 'deleted' ELSE 'saved' END]);
 RETURN to_jsonb(v_meal)||jsonb_build_object('plan_revision',v_plan.updated_at,'deleted',coalesce((p_meal->>'delete')::boolean,false));
END $function$;
REVOKE ALL ON FUNCTION public.save_draft_meal(bigint,bigint,jsonb,timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_draft_meal(bigint,bigint,jsonb,timestamptz,uuid,uuid) TO authenticated;



-- Forward repair: business conflicts are HTTP 409, never retryable transaction failures.
CREATE OR REPLACE FUNCTION public.finalize_clinical_record(p_record_id uuid, p_content jsonb, p_expected_revision bigint DEFAULT NULL::bigint, p_retrospective_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_hash text;
  v_filled_sections integer;
  v_template_sections jsonb;
  v_reason text;
  v_canonical jsonb;
  v_episode_status text;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status<>'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_finalized'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction' and status='draft';
  v_is_correction:=found;

  if v_is_correction then
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'finalize') then
      raise exception using errcode='42501',message='correction_finalize_forbidden';
    end if;
  else
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if v_record.student_id is not null then
      if v_actor<>v_record.supervisor_id then
        raise exception using errcode='42501',message='supervisor_required_to_finalize'; end if;
    elsif v_actor<>v_record.author_id or v_actor<>v_record.nutritionist_id then
      raise exception using errcode='42501',message='finalize_forbidden';
    end if;
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  v_filled_sections:=private.validate_clinical_record_content(p_content,v_template_sections,true);
  v_reason:=nullif(btrim(coalesce(p_retrospective_reason,v_record.retrospective_reason,'')),'');
  if v_record.encounter_at<v_record.created_at-interval '5 minutes'
    and (v_reason is null or length(v_reason) not between 10 and 500) then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;
  if v_reason is not null and length(v_reason)>500 then
    raise exception using errcode='22023',message='retrospective_reason_required'; end if;

  v_canonical:=private.clinical_record_canonical_payload(v_record,p_content,v_reason);
  v_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  update public.clinical_records set
    content=p_content,status='finalized',canonical_hash=v_hash,
    retrospective_reason=v_reason,revision=revision+1,updated_at=now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then raise exception using errcode='PT409',message='draft_revision_conflict'; end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','finalized',v_actor,jsonb_build_object(
    'canonical_hash',v_hash,'canonical_format_version',v_record.canonical_format_version,
    'filled_sections',v_filled_sections,
    'amendment_id',case when v_is_correction then v_amendment.id else null end));
  return private.project_clinical_evolution_record(v_updated);
end
$function$;
CREATE OR REPLACE FUNCTION public.sign_clinical_record(p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
  v_crn_number text;
  v_crn_region text;
  v_signed_at timestamptz:=clock_timestamp();
  v_auth_level text;
  v_jwt_claims text;
  v_episode_status text;
  v_expected_hash text;
  v_canonical jsonb;
  v_amendment_hash text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction';
  v_is_correction:=found;
  if v_is_correction and v_amendment.status<>'draft' then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;

  if v_is_correction then
    perform r.id from public.clinical_records r
    where r.id in (v_amendment.root_record_id,v_amendment.target_record_id,p_record_id)
    order by r.id for update;
    select * into v_record from public.clinical_records where id=p_record_id;
    select * into v_amendment from public.clinical_record_amendments
    where id=v_amendment.id for update;
    if v_record.status<>'finalized'
      or v_amendment.status<>'draft'
      or not exists (
        select 1 from public.clinical_records t
        where t.id=v_amendment.target_record_id and t.status='signed'
      ) then
      raise exception using errcode='PT409',message='amendment_chain_conflict';
    end if;
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'sign') then
      raise exception using errcode='42501',message='correction_sign_forbidden';
    end if;
  else
    if v_record.status<>'finalized' then
      raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if (v_record.student_id is not null and v_actor<>v_record.supervisor_id)
      or (v_record.student_id is null and v_actor<>v_record.nutritionist_id) then
      raise exception using errcode='42501',message='only_nutritionist_can_sign'; end if;
  end if;

  select pv.crn_number,pv.crn_region into v_crn_number,v_crn_region
  from public.professional_verifications pv
  where pv.user_id=v_actor and pv.professional_role='nutritionist'
    and pv.status='approved' and pv.valid_until>now()
  order by pv.reviewed_at desc nulls last limit 1;
  if v_crn_number is null then
    raise exception using errcode='42501',message='verified_professional_required'; end if;

  v_canonical:=private.clinical_record_canonical_payload(
    v_record,v_record.content,v_record.retrospective_reason
  );
  v_expected_hash:=encode(extensions.digest(convert_to(v_canonical::text,'UTF8'),'sha256'),'hex');
  if v_record.canonical_hash is distinct from v_expected_hash then
    raise exception using errcode='23514',message='finalized_record_hash_mismatch'; end if;

  v_jwt_claims:=nullif(current_setting('request.jwt.claims',true),'');
  v_auth_level:=coalesce(
    nullif(current_setting('request.jwt.claim.aal',true),''),
    nullif((v_jwt_claims::jsonb)->>'aal',''),'unknown'
  );

  if v_is_correction then
    perform set_config('nello.c4_transition_target',v_amendment.target_record_id::text,true);
    perform set_config('nello.c4_transition_status','corrected',true);
    update public.clinical_records set status='corrected',updated_at=now()
    where id=v_amendment.target_record_id and status='signed';
    if not found then raise exception using errcode='PT409',message='amendment_chain_conflict'; end if;
    perform set_config('nello.c4_transition_target','',true);
    perform set_config('nello.c4_transition_status','',true);

    update public.clinical_records set status='signed',signed_at=v_signed_at,updated_at=now()
    where id=p_record_id and status='finalized'
    returning * into v_updated;
    if not found then raise exception using errcode='PT409',message='amendment_chain_conflict'; end if;

    v_amendment_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
      'amendment_id',v_amendment.id,'amendment_type',v_amendment.amendment_type,
      'root_record_id',v_amendment.root_record_id,
      'target_record_id',v_amendment.target_record_id,
      'replacement_record_id',v_amendment.replacement_record_id,
      'reason',v_amendment.reason,'impact_hash',v_amendment.impact_hash,
      'responsible_id',v_amendment.responsible_id,'effective_at',v_signed_at,
      'replacement_canonical_hash',v_record.canonical_hash
    )::text,'UTF8'),'sha256'),'hex');

    update public.clinical_record_amendments set
      status='effective',effective_at=v_signed_at,canonical_hash=v_amendment_hash,
      authentication_evidence=jsonb_build_object(
        'signed_at',v_signed_at,'auth_level',v_auth_level,
        'crn_number',v_crn_number,'crn_region',v_crn_region
      )
    where id=v_amendment.id and status='draft';
    if not found then raise exception using errcode='PT409',message='amendment_chain_conflict'; end if;

    insert into public.clinical_record_events(
      clinical_record_id,from_status,to_status,actor_id,reason,metadata
    ) values (
      v_amendment.target_record_id,'signed','corrected',v_actor,v_amendment.reason,
      jsonb_build_object('amendment_id',v_amendment.id,
        'replacement_record_id',p_record_id)
    );

    insert into public.activity_log(
      event_name,patient_id,nutritionist_id,actor_user_id,source_module,payload
    ) values (
      'clinical_record.corrected',v_record.patient_id,v_record.nutritionist_id,
      v_actor,'clinical_records',jsonb_build_object(
        'amendment_id',v_amendment.id,'clinical_record_id',v_amendment.target_record_id,
        'replacement_record_id',p_record_id,'care_episode_id',v_record.care_episode_id
      )
    );
    if v_record.visibility='shared_with_patient' then
      insert into public.notifications(user_id,type,title,message,content)
      values (
        v_record.patient_id,'clinical_record_corrected','Registro clínico atualizado',
        'Seu nutricionista atualizou um registro compartilhado.',
        jsonb_build_object('amendment_id',v_amendment.id,
          'clinical_record_id',v_amendment.target_record_id,
          'replacement_record_id',p_record_id,'care_episode_id',v_record.care_episode_id)
      ) on conflict do nothing;
    end if;
  else
    update public.clinical_records set status='signed',signed_at=v_signed_at,updated_at=now()
    where id=p_record_id and status='finalized' returning * into v_updated;
    if not found then
      raise exception using errcode='23514',message='only_finalized_records_can_be_signed'; end if;
  end if;

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,metadata
  ) values (
    p_record_id,'finalized','signed',v_actor,jsonb_build_object(
      'canonical_hash',v_record.canonical_hash,
      'canonical_format_version',v_record.canonical_format_version,
      'crn_number',v_crn_number,'crn_region',v_crn_region,
      'signed_at',v_signed_at,'auth_level',v_auth_level,
      'amendment_id',case when v_is_correction then v_amendment.id else null end
    )
  );
  return private.project_clinical_evolution_record(v_updated);
end
$function$;
CREATE OR REPLACE FUNCTION public.abandon_clinical_record_correction(p_amendment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_amendment public.clinical_record_amendments%rowtype;
  v_updated public.clinical_record_amendments%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='abandonment_reason_length_invalid'; end if;
  select * into v_amendment from public.clinical_record_amendments where id=p_amendment_id;
  if not found then raise exception using errcode='P0002',message='amendment_not_found'; end if;
  perform r.id from public.clinical_records r
  where r.id in (v_amendment.root_record_id,v_amendment.target_record_id,v_amendment.replacement_record_id)
  order by r.id for update;
  select * into v_amendment from public.clinical_record_amendments
  where id=p_amendment_id for update;
  if v_amendment.status<>'draft'
    or not private.can_manage_clinical_record_correction(
      v_amendment.replacement_record_id,v_actor,'abandon'
    ) then
    raise exception using errcode='42501',message='correction_abandon_forbidden';
  end if;
  update public.clinical_records set status='invalidated',updated_at=now()
  where id=v_amendment.replacement_record_id and status='draft';
  if not found then raise exception using errcode='PT409',message='amendment_chain_conflict'; end if;
  update public.clinical_record_amendments set
    status='abandoned',abandoned_at=clock_timestamp(),abandonment_reason=v_reason
  where id=p_amendment_id and status='draft'
  returning * into v_updated;
  if not found then raise exception using errcode='PT409',message='amendment_chain_conflict'; end if;
  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_amendment.replacement_record_id,'draft','invalidated',v_actor,v_reason,
    jsonb_build_object('action','abandoned_correction_draft','amendment_id',p_amendment_id)
  );
  return jsonb_build_object(
    'id',v_updated.id,'status',v_updated.status,
    'target_record_id',v_updated.target_record_id,
    'replacement_record_id',v_updated.replacement_record_id,
    'abandoned_at',v_updated.abandoned_at,
    'abandonment_reason',v_updated.abandonment_reason
  );
end
$function$;
CREATE OR REPLACE FUNCTION public.create_document_asset_upload_intent(p_asset_type text, p_original_filename text, p_mime_type text, p_size_bytes bigint, p_expected_identity_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_identity public.professional_document_identities%rowtype;
  v_id uuid := gen_random_uuid();
  v_path text;
  v_limit bigint;
  v_filename text := nullif(btrim(p_original_filename), '');
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_asset_type not in ('logo', 'visual_signature', 'stamp') then
    raise exception using errcode = '22023', message = 'invalid_document_asset_type';
  end if;
  if p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception using errcode = '22023', message = 'unsupported_document_asset_mime';
  end if;
  v_limit := case when p_asset_type = 'logo' then 5242880 else 2097152 end;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > v_limit then
    raise exception using errcode = '22023', message = 'invalid_document_asset_size';
  end if;
  if v_filename is null or length(v_filename) > 255 or v_filename ~ '[[:cntrl:]/\\]' then
    raise exception using errcode = '22023', message = 'invalid_document_asset_filename';
  end if;
  if not exists (
    select 1 from public.professional_verifications v
    where v.user_id = v_actor and v.professional_role = 'nutritionist'
      and v.status = 'approved' and v.valid_until > now()
  ) then
    raise exception using errcode = '42501', message = 'document_asset_requires_verified_nutritionist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('document_asset:' || v_actor::text, 0));
  select * into v_identity
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '23514', message = 'active_document_identity_required';
  end if;
  if p_expected_identity_version is null or p_expected_identity_version <> v_identity.version then
    raise exception using errcode = 'PT409', message = 'document_identity_revision_conflict';
  end if;

  v_path := v_actor::text || '/' || p_asset_type || '/' || v_id::text;
  insert into public.document_asset_uploads(
    id, professional_id, identity_id, asset_type, storage_path,
    original_filename, mime_type, size_bytes, expires_at
  ) values (
    v_id, v_actor, v_identity.id, p_asset_type, v_path,
    v_filename, p_mime_type, p_size_bytes, v_expires_at
  );

  return jsonb_build_object(
    'upload_id', v_id,
    'storage_bucket', 'document-assets',
    'storage_path', v_path,
    'asset_type', p_asset_type,
    'expires_at', v_expires_at
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_my_document_identity(p_payload jsonb, p_expected_version integer DEFAULT NULL::integer, p_reason text DEFAULT 'profile_update'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles%rowtype;
  v_verification public.professional_verifications%rowtype;
  v_current public.professional_document_identities%rowtype;
  v_saved public.professional_document_identities%rowtype;
  v_next_version integer;
  v_unknown_key text;
  v_name text;
  v_clinic text;
  v_email text;
  v_phone text;
  v_address_line text;
  v_address_city text;
  v_address_state text;
  v_postal_code text;
  v_primary_color text;
  v_accent_color text;
  v_header text;
  v_footer text;
  v_reason text := nullif(btrim(p_reason), '');
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'document_identity_payload_must_be_object';
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(p_payload) key
  where key <> all(array[
    'professional_name', 'clinic_name', 'professional_email', 'professional_phone',
    'address_line', 'address_city', 'address_state', 'address_postal_code',
    'primary_color', 'accent_color', 'header_text', 'footer_text'
  ]::text[])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'document_identity_unknown_field:' || v_unknown_key;
  end if;

  select * into v_profile from public.user_profiles where id = v_actor;
  select * into v_verification
  from public.professional_verifications
  where user_id = v_actor
    and professional_role = 'nutritionist'
    and status = 'approved'
    and valid_until > now()
  for share;

  if not found or v_profile.user_type is distinct from 'nutritionist' then
    raise exception using errcode = '42501', message = 'document_identity_requires_verified_nutritionist';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('document_identity:' || v_actor::text, 0));
  select * into v_current
  from public.professional_document_identities
  where professional_id = v_actor and status = 'active'
  for update;

  if found then
    if p_expected_version is null or p_expected_version <> v_current.version then
      raise exception using errcode = 'PT409', message = 'document_identity_revision_conflict';
    end if;
    v_next_version := v_current.version + 1;
  else
    if p_expected_version is not null and p_expected_version <> 0 then
      raise exception using errcode = 'PT409', message = 'document_identity_revision_conflict';
    end if;
    v_next_version := 1;
  end if;

  v_name := private.merge_document_identity_text(p_payload, 'professional_name', v_current.professional_name, v_profile.name);
  v_clinic := private.merge_document_identity_text(p_payload, 'clinic_name', v_current.clinic_name, null);
  v_email := private.merge_document_identity_text(p_payload, 'professional_email', v_current.professional_email, v_profile.email);
  v_phone := private.merge_document_identity_text(p_payload, 'professional_phone', v_current.professional_phone, v_profile.phone);
  v_address_line := private.merge_document_identity_text(p_payload, 'address_line', v_current.address_line, null);
  v_address_city := private.merge_document_identity_text(p_payload, 'address_city', v_current.address_city, null);
  v_address_state := private.merge_document_identity_text(p_payload, 'address_state', v_current.address_state, null);
  v_postal_code := private.merge_document_identity_text(p_payload, 'address_postal_code', v_current.address_postal_code, null);
  v_primary_color := coalesce(private.merge_document_identity_text(p_payload, 'primary_color', v_current.primary_color, '#4F8A3C'), '#4F8A3C');
  v_accent_color := coalesce(private.merge_document_identity_text(p_payload, 'accent_color', v_current.accent_color, '#7DAF69'), '#7DAF69');
  v_header := private.merge_document_identity_text(p_payload, 'header_text', v_current.header_text, null);
  v_footer := private.merge_document_identity_text(p_payload, 'footer_text', v_current.footer_text, null);

  if v_name is null or length(v_name) > 160
     or length(coalesce(v_clinic, '')) > 160
     or length(coalesce(v_email, '')) > 254
     or length(coalesce(v_phone, '')) > 40
     or length(coalesce(v_address_line, '')) > 240
     or length(coalesce(v_address_city, '')) > 120
     or length(coalesce(v_address_state, '')) > 40
     or length(coalesce(v_postal_code, '')) > 20
     or length(coalesce(v_header, '')) > 300
     or length(coalesce(v_footer, '')) > 300
     or length(coalesce(v_reason, '')) > 240 then
    raise exception using errcode = '22023', message = 'document_identity_field_out_of_bounds';
  end if;
  if concat_ws('', v_name, v_clinic, v_email, v_phone, v_address_line, v_address_city,
      v_address_state, v_postal_code, v_header, v_footer) ~ '[<>]' then
    raise exception using errcode = '22023', message = 'document_identity_markup_not_allowed';
  end if;
  if v_primary_color !~ '^#[0-9A-Fa-f]{6}$' or v_accent_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using errcode = '22023', message = 'document_identity_invalid_color';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'document_identity_reason_required';
  end if;

  if v_current.id is not null then
    update public.professional_document_identities
    set status = 'archived', archived_at = now(), archive_reason = v_reason
    where id = v_current.id;

    insert into public.professional_document_identity_events(
      identity_id, professional_id, actor_id, event_type, reason, metadata
    ) values (
      v_current.id, v_actor, v_actor, 'superseded', v_reason,
      jsonb_build_object('version', v_current.version, 'superseded_by_version', v_next_version)
    );
  end if;

  insert into public.professional_document_identities(
    professional_id, verification_id, version, status,
    professional_name, clinic_name, professional_email, professional_phone,
    address_line, address_city, address_state, address_postal_code,
    primary_color, accent_color, header_text, footer_text,
    crn_region, crn_number, normalized_crn,
    logo_storage_path, signature_storage_path, stamp_storage_path,
    created_by
  ) values (
    v_actor, v_verification.id, v_next_version, 'active',
    v_name, v_clinic, v_email, v_phone,
    v_address_line, v_address_city, v_address_state, v_postal_code,
    upper(v_primary_color), upper(v_accent_color), v_header, v_footer,
    v_verification.crn_region, v_verification.crn_number, v_verification.normalized_crn,
    v_current.logo_storage_path, v_current.signature_storage_path, v_current.stamp_storage_path,
    v_actor
  ) returning * into v_saved;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_saved.id, v_actor, v_actor, 'created', v_reason,
    jsonb_build_object('version', v_saved.version, 'previous_version', nullif(v_saved.version - 1, 0))
  );

  return public.get_my_document_identity();
end;
$function$;
CREATE OR REPLACE FUNCTION private.version_document_identity_asset(p_professional_id uuid, p_expected_identity_id uuid, p_asset_type text, p_storage_path text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current public.professional_document_identities%rowtype;
  v_saved public.professional_document_identities%rowtype;
begin
 perform private.wave05_require_active_actor();

  select * into v_current
  from public.professional_document_identities
  where professional_id = p_professional_id and status = 'active'
  for update;

  if not found or v_current.id is distinct from p_expected_identity_id then
    raise exception using errcode = 'PT409', message = 'identity_changed_since_upload_intent';
  end if;

  update public.professional_document_identities
  set status = 'archived', archived_at = now(), archive_reason = p_reason
  where id = v_current.id;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_current.id, p_professional_id, p_professional_id, 'superseded', p_reason,
    jsonb_build_object('version', v_current.version, 'superseded_by_version', v_current.version + 1)
  );

  insert into public.professional_document_identities(
    professional_id, verification_id, version, status,
    professional_name, clinic_name, professional_email, professional_phone,
    address_line, address_city, address_state, address_postal_code,
    primary_color, accent_color, header_text, footer_text,
    crn_region, crn_number, normalized_crn,
    logo_storage_path, signature_storage_path, stamp_storage_path, created_by
  ) values (
    v_current.professional_id, v_current.verification_id, v_current.version + 1, 'active',
    v_current.professional_name, v_current.clinic_name, v_current.professional_email, v_current.professional_phone,
    v_current.address_line, v_current.address_city, v_current.address_state, v_current.address_postal_code,
    v_current.primary_color, v_current.accent_color, v_current.header_text, v_current.footer_text,
    v_current.crn_region, v_current.crn_number, v_current.normalized_crn,
    case when p_asset_type = 'logo' then p_storage_path else v_current.logo_storage_path end,
    case when p_asset_type = 'visual_signature' then p_storage_path else v_current.signature_storage_path end,
    case when p_asset_type = 'stamp' then p_storage_path else v_current.stamp_storage_path end,
    p_professional_id
  ) returning * into v_saved;

  insert into public.professional_document_identity_events(
    identity_id, professional_id, actor_id, event_type, reason, metadata
  ) values (
    v_saved.id, p_professional_id, p_professional_id, 'created', p_reason,
    jsonb_build_object(
      'version', v_saved.version,
      'previous_version', v_current.version,
      'asset_type', p_asset_type
    )
  );

  return v_saved.id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.invalidate_clinical_record(p_record_id uuid, p_reason text, p_impact_confirmation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_target public.clinical_records%rowtype;
  v_impact jsonb;
  v_impact_hash text;
  v_auth_evidence jsonb;
  v_amendment_id uuid:=gen_random_uuid();
  v_effective_at timestamptz:=clock_timestamp();
  v_amendment_hash text;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='amendment_reason_length_invalid';
  end if;
  if jsonb_typeof(p_impact_confirmation) is distinct from 'object'
    or coalesce((p_impact_confirmation->>'confirmed')::boolean,false) is not true then
    raise exception using errcode='22023',message='amendment_impact_confirmation_required';
  end if;
  v_auth_evidence:=private.current_recent_authentication_evidence();

  select * into v_target from public.clinical_records where id=p_record_id;
  if not found then
    raise exception using errcode='P0002',message='clinical_record_not_found';
  end if;
  if private.clinical_record_signed_by(v_target.id) is distinct from v_actor then
    raise exception using errcode='42501',message='clinical_record_invalidation_forbidden';
  end if;
  if v_target.status<>'signed' then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;
  perform r.id from public.clinical_records r
  where r.id in (v_target.root_record_id,v_target.id)
  order by r.id for update;
  select * into v_target from public.clinical_records where id=p_record_id;
  if private.clinical_record_signed_by(v_target.id) is distinct from v_actor then
    raise exception using errcode='42501',message='clinical_record_invalidation_forbidden';
  end if;
  if v_target.status<>'signed' then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;
  if exists (
    select 1 from public.clinical_record_amendments a
    where a.root_record_id=v_target.root_record_id
      and a.amendment_type='correction' and a.status='draft'
  ) then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;

  v_impact:=private.build_clinical_record_amendment_impact(v_target);
  v_impact_hash:=encode(
    extensions.digest(convert_to(v_impact::text,'UTF8'),'sha256'),'hex'
  );
  if p_impact_confirmation->>'impact_hash' is distinct from v_impact_hash then
    raise exception using errcode='PT409',message='amendment_impact_changed';
  end if;
  v_amendment_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'amendment_id',v_amendment_id,'amendment_type','invalidation',
    'root_record_id',v_target.root_record_id,'target_record_id',v_target.id,
    'reason',v_reason,'impact_hash',v_impact_hash,'responsible_id',v_actor,
    'effective_at',v_effective_at,'authentication_evidence',v_auth_evidence
  )::text,'UTF8'),'sha256'),'hex');

  insert into public.clinical_record_amendments(
    id,patient_id,care_episode_id,root_record_id,target_record_id,replacement_record_id,
    amendment_type,status,reason,impact_snapshot,impact_hash,actor_id,responsible_id,
    authentication_evidence,canonical_hash,effective_at
  ) values (
    v_amendment_id,v_target.patient_id,v_target.care_episode_id,v_target.root_record_id,
    v_target.id,null,'invalidation','effective',v_reason,v_impact,v_impact_hash,
    v_actor,v_actor,v_auth_evidence,v_amendment_hash,v_effective_at
  );

  perform set_config('nello.c4_transition_target',v_target.id::text,true);
  perform set_config('nello.c4_transition_status','invalidated',true);
  update public.clinical_records set status='invalidated',updated_at=now()
  where id=v_target.id and status='signed';
  if not found then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;
  perform set_config('nello.c4_transition_target','',true);
  perform set_config('nello.c4_transition_status','',true);

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_target.id,'signed','invalidated',v_actor,v_reason,
    jsonb_build_object('amendment_id',v_amendment_id)
  );
  insert into public.activity_log(
    event_name,patient_id,nutritionist_id,actor_user_id,source_module,payload
  ) values (
    'clinical_record.invalidated',v_target.patient_id,v_target.nutritionist_id,
    v_actor,'clinical_records',jsonb_build_object(
      'amendment_id',v_amendment_id,'clinical_record_id',v_target.id,
      'care_episode_id',v_target.care_episode_id
    )
  );
  if v_target.visibility='shared_with_patient' then
    insert into public.notifications(user_id,type,title,message,content)
    values (
      v_target.patient_id,'clinical_record_invalidated','Registro clínico atualizado',
      'Seu nutricionista atualizou um registro compartilhado.',
      jsonb_build_object('amendment_id',v_amendment_id,
        'clinical_record_id',v_target.id,'care_episode_id',v_target.care_episode_id)
    ) on conflict do nothing;
  end if;
  return jsonb_build_object(
    'amendment_id',v_amendment_id,'status','effective',
    'record_id',v_target.id,'record_status','invalidated','effective_at',v_effective_at
  );
exception
  when unique_violation then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
end
$function$;
CREATE OR REPLACE FUNCTION public.save_meal_template(p_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_tags text[], p_foods jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_updated_at timestamptz;
  v_food jsonb;
  v_food_id uuid;
  v_quantity numeric;
  v_index integer := 0;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 3 and 100
     or jsonb_typeof(coalesce(p_foods, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_foods, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'invalid_meal_template_payload';
  end if;
  if p_id is null then
    insert into public.meal_templates (user_id, name, description, tags)
    values (auth.uid(), btrim(p_name), nullif(btrim(p_description), ''), coalesce(p_tags, '{}'::text[]))
    returning id into v_id;
  else
    select updated_at into v_updated_at from public.meal_templates
    where id = p_id and user_id = auth.uid() for update;
    if not found then
      raise exception using errcode = '42501', message = 'meal_template_not_found_or_forbidden';
    end if;
    if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = 'PT409', message = 'meal_template_changed_elsewhere';
    end if;
    update public.meal_templates set name = btrim(p_name),
      description = nullif(btrim(p_description), ''), tags = coalesce(p_tags, '{}'::text[]),
      updated_at = clock_timestamp() where id = p_id;
    delete from public.meal_template_foods where meal_template_id = p_id;
    v_id := p_id;
  end if;
  for v_food in select value from jsonb_array_elements(coalesce(p_foods, '[]'::jsonb)) loop
    v_food_id := (v_food->>'food_id')::uuid;
    v_quantity := (v_food->>'quantity')::numeric;
    if v_quantity is null or v_quantity::text = 'NaN' or v_quantity <= 0 or v_quantity > 100000
      or length(coalesce(v_food->>'unit', '')) not between 1 and 40
      or not exists (select 1 from public.foods f where f.id = v_food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
      raise exception using errcode = '22023', message = 'invalid_meal_template_food';
    end if;
    insert into public.meal_template_foods
      (meal_template_id, food_id, quantity, unit, observation, order_index)
    values (v_id, v_food_id, v_quantity, v_food->>'unit',
      nullif(v_food->>'observation', ''), v_index);
    v_index := v_index + 1;
  end loop;
  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.save_recipe_template(p_id uuid, p_expected_updated_at timestamp with time zone, p_name text, p_description text, p_preparation_method text, p_yield_quantity numeric, p_yield_unit text, p_ingredients jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_updated_at timestamptz;
  v_ingredient jsonb;
  v_food_id uuid;
  v_quantity numeric;
begin
 perform private.wave05_require_active_actor();

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(coalesce(btrim(p_name), '')) not between 3 and 100
    or p_yield_quantity is null or p_yield_quantity::text = 'NaN'
    or p_yield_quantity <= 0 or p_yield_quantity > 100000
    or length(coalesce(btrim(p_yield_unit), '')) not between 1 and 40
    or jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_ingredients, '[]'::jsonb)) > 100 then
    raise exception using errcode = '22023', message = 'invalid_recipe_payload';
  end if;
  if p_id is null then
    insert into public.recipes
      (user_id, name, description, preparation_method, yield_quantity, yield_unit)
    values (auth.uid(), btrim(p_name), nullif(btrim(p_description), ''),
      nullif(btrim(p_preparation_method), ''), p_yield_quantity, btrim(p_yield_unit))
    returning id into v_id;
  else
    select updated_at into v_updated_at from public.recipes
    where id = p_id and user_id = auth.uid() and coalesce(is_deleted, false) = false for update;
    if not found then
      raise exception using errcode = '42501', message = 'recipe_not_found_or_forbidden';
    end if;
    if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = 'PT409', message = 'recipe_changed_elsewhere';
    end if;
    update public.recipes set name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      preparation_method = nullif(btrim(p_preparation_method), ''),
      yield_quantity = p_yield_quantity, yield_unit = btrim(p_yield_unit),
      version = version + 1, updated_at = clock_timestamp() where id = p_id;
    delete from public.recipe_ingredients where recipe_id = p_id;
    v_id := p_id;
  end if;
  for v_ingredient in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) loop
    v_food_id := (v_ingredient->>'food_id')::uuid;
    v_quantity := (v_ingredient->>'quantity')::numeric;
    if v_quantity is null or v_quantity::text = 'NaN' or v_quantity <= 0 or v_quantity > 100000
      or length(coalesce(v_ingredient->>'unit', '')) not between 1 and 40
      or not exists (select 1 from public.foods f where f.id = v_food_id and f.is_active
        and (f.nutritionist_id is null or f.nutritionist_id = auth.uid())) then
      raise exception using errcode = '22023', message = 'invalid_recipe_ingredient';
    end if;
    insert into public.recipe_ingredients (recipe_id, food_id, quantity, unit)
    values (v_id, v_food_id, v_quantity, v_ingredient->>'unit');
  end loop;
  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.start_clinical_record_correction(p_record_id uuid, p_reason text, p_impact_confirmation jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_target public.clinical_records%rowtype;
  v_signer uuid;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_impact jsonb;
  v_impact_hash text;
  v_replacement_id uuid:=gen_random_uuid();
  v_amendment_id uuid:=gen_random_uuid();
  v_replacement public.clinical_records%rowtype;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  if length(v_reason) not between 20 and 2000 then
    raise exception using errcode='22023',message='amendment_reason_length_invalid';
  end if;
  if jsonb_typeof(p_impact_confirmation) is distinct from 'object'
    or coalesce((p_impact_confirmation->>'confirmed')::boolean,false) is not true then
    raise exception using errcode='22023',message='amendment_impact_confirmation_required';
  end if;

  select * into v_target from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='clinical_record_not_found'; end if;
  if v_target.status<>'signed'
    and private.clinical_record_signed_by(v_target.id)=v_actor then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;
  if not private.can_start_clinical_record_correction(v_target.id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  perform r.id from public.clinical_records r
  where r.id in (v_target.root_record_id,v_target.id)
  order by r.id for update;
  select * into v_target from public.clinical_records where id=p_record_id;
  if v_target.status<>'signed' then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;
  if not private.can_start_clinical_record_correction(v_target.id,v_actor) then
    raise exception using errcode='42501',message='clinical_record_amendment_forbidden';
  end if;
  if exists (
    select 1 from public.clinical_record_amendments a
    where a.root_record_id=v_target.root_record_id
      and a.amendment_type='correction' and a.status='draft'
  ) then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;

  v_impact:=private.build_clinical_record_amendment_impact(v_target);
  v_impact_hash:=encode(extensions.digest(convert_to(v_impact::text,'UTF8'),'sha256'),'hex');
  if p_impact_confirmation->>'impact_hash' is distinct from v_impact_hash then
    raise exception using errcode='PT409',message='amendment_impact_changed';
  end if;
  v_signer:=private.clinical_record_signed_by(v_target.id);

  insert into public.clinical_records(
    id,patient_id,care_episode_id,nutritionist_id,author_id,student_id,supervisor_id,
    record_type,status,visibility,encounter_at,recorded_at,retrospective_reason,
    content,source_references,template_code,template_version,revision,
    root_record_id,replaces_record_id,chain_version,canonical_format_version
  ) values (
    v_replacement_id,v_target.patient_id,v_target.care_episode_id,v_target.nutritionist_id,
    v_actor,v_target.student_id,v_target.supervisor_id,v_target.record_type,'draft',
    v_target.visibility,v_target.encounter_at,now(),v_target.retrospective_reason,
    v_target.content,v_target.source_references,v_target.template_code,v_target.template_version,1,
    v_target.root_record_id,v_target.id,v_target.chain_version+1,2
  ) returning * into v_replacement;

  insert into public.clinical_record_amendments(
    id,patient_id,care_episode_id,root_record_id,target_record_id,replacement_record_id,
    amendment_type,status,reason,impact_snapshot,impact_hash,actor_id,responsible_id,
    supervisor_id
  ) values (
    v_amendment_id,v_target.patient_id,v_target.care_episode_id,v_target.root_record_id,
    v_target.id,v_replacement_id,'correction','draft',v_reason,v_impact,v_impact_hash,
    v_actor,v_signer,case when v_target.student_id is not null then v_signer else null end
  );

  insert into public.clinical_record_events(
    clinical_record_id,from_status,to_status,actor_id,reason,metadata
  ) values (
    v_replacement_id,null,'draft',v_actor,v_reason,
    jsonb_build_object('action','correction_started','amendment_id',v_amendment_id,
      'target_record_id',v_target.id,'root_record_id',v_target.root_record_id)
  );

  return private.project_clinical_evolution_record(v_replacement) || jsonb_build_object(
    'record_status',v_replacement.status,
    'replacement_record_id',v_replacement.id,
    'amendment_id',v_amendment_id,
    'amendment_status','draft'
  );
exception
  when unique_violation then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
end
$function$;
CREATE OR REPLACE FUNCTION public.update_clinical_record_draft(p_record_id uuid, p_content jsonb, p_visibility text DEFAULT NULL::text, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_record public.clinical_records%rowtype;
  v_updated public.clinical_records%rowtype;
  v_template_sections jsonb;
  v_episode_status text;
  v_amendment public.clinical_record_amendments%rowtype;
  v_is_correction boolean;
begin
 perform private.wave05_require_active_actor();

  if v_actor is null then raise exception using errcode='28000',message='authentication_required'; end if;
  if p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='expected_revision_required'; end if;
  if p_visibility is not null and p_visibility not in ('professional_private','shared_with_patient','share_later') then
    raise exception using errcode='22023',message='invalid_visibility'; end if;

  select * into v_record from public.clinical_records where id=p_record_id;
  if not found then raise exception using errcode='P0002',message='record_not_found'; end if;
  if v_record.status<>'draft' then raise exception using errcode='23514',message='only_draft_records_can_be_edited'; end if;
  select * into v_amendment from public.clinical_record_amendments
  where replacement_record_id=p_record_id and amendment_type='correction';
  v_is_correction:=found;
  if v_is_correction and v_amendment.status<>'draft' then
    raise exception using errcode='PT409',message='amendment_chain_conflict';
  end if;

  if v_is_correction then
    if p_visibility is not null and p_visibility<>v_record.visibility then
      raise exception using errcode='23514',message='correction_visibility_immutable';
    end if;
    if not private.can_manage_clinical_record_correction(p_record_id,v_actor,'edit') then
      raise exception using errcode='42501',message='correction_edit_forbidden';
    end if;
  else
    select e.status into v_episode_status from public.care_episodes e
    where e.id=v_record.care_episode_id for share;
    if v_episode_status is distinct from 'active'
      or not private.can_write_active_care_episode(v_record.care_episode_id) then
      raise exception using errcode='42501',message='episode_write_forbidden'; end if;
    if v_actor<>v_record.author_id
      and v_actor<>coalesce(v_record.supervisor_id,v_record.nutritionist_id) then
      raise exception using errcode='42501',message='draft_edit_forbidden'; end if;
  end if;

  select tv.sections_snapshot into v_template_sections
  from public.clinical_evolution_template_versions tv
  where tv.template_code=v_record.template_code and tv.version=v_record.template_version;
  perform private.validate_clinical_record_content(p_content,v_template_sections,false);

  update public.clinical_records set
    content=p_content,
    visibility=case when v_is_correction then visibility else coalesce(p_visibility,visibility) end,
    revision=revision+1,
    updated_at=now()
  where id=p_record_id and status='draft' and revision=p_expected_revision
  returning * into v_updated;
  if not found then raise exception using errcode='PT409',message='draft_revision_conflict'; end if;

  insert into public.clinical_record_events(clinical_record_id,from_status,to_status,actor_id,metadata)
  values(p_record_id,'draft','draft',v_actor,jsonb_build_object(
    'action','autosave','content_keys',
    (select coalesce(jsonb_agg(k order by k),'[]') from jsonb_object_keys(p_content) k),
    'amendment_id',case when v_is_correction then v_amendment.id else null end));
  return private.project_clinical_evolution_record(v_updated);
end
$function$;
CREATE OR REPLACE FUNCTION public.update_data_subject_request(p_request_id uuid, p_expected_revision bigint, p_status text, p_reason text, p_retention_decision text DEFAULT NULL::text, p_legal_basis text DEFAULT NULL::text, p_assign_to_me boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid();v_request public.data_subject_requests%rowtype;v_reason text:=nullif(btrim(p_reason),'');v_event text;
begin
 perform private.wave05_require_active_actor();

 if not private.is_admin() then raise exception using errcode='42501',message='admin_required';end if;
 if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='administrative_reason_required';end if;
 if p_status not in('triaged','in_progress','fulfilled','rejected') then raise exception using errcode='22023',message='invalid_administrative_transition';end if;
 select * into v_request from public.data_subject_requests where id=p_request_id for update;
 if not found then raise exception using errcode='P0002',message='data_subject_request_not_found';end if;
 if v_request.revision<>p_expected_revision then raise exception using errcode='PT409',message='data_subject_request_revision_conflict';end if;
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
CREATE OR REPLACE FUNCTION public.update_document_artifact_draft(p_artifact_id uuid, p_payload jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.document_artifacts%rowtype;v_size integer;
begin
 perform private.wave05_require_active_actor();

 if jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='document_draft_payload_must_be_object';end if;
 v_size:=octet_length(p_payload::text);if v_size>1048576 then raise exception using errcode='22023',message='document_draft_payload_too_large';end if;
 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or not private.can_manage_document_artifact(p_artifact_id) then raise exception using errcode='42501',message='document_artifact_write_forbidden';end if;
 if v_a.status<>'draft' then raise exception using errcode='23514',message='only_draft_document_can_change';end if;
 if p_expected_revision is distinct from v_a.revision then raise exception using errcode='PT409',message='document_artifact_revision_conflict';end if;
 update public.document_artifacts set draft_payload=p_payload,revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,auth.uid(),'draft_updated','draft','draft','document_draft_updated',jsonb_build_object('revision',v_a.revision+1));
 return jsonb_build_object('artifact_id',v_a.id,'status','draft','revision',v_a.revision+1);
end$function$;
CREATE OR REPLACE FUNCTION public.finalize_document_artifact(p_artifact_id uuid, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_a public.document_artifacts%rowtype;v_p public.user_profiles%rowtype;v_c jsonb;v_hash text;
begin
 perform private.wave05_require_active_actor();

 select * into v_a from public.document_artifacts where id=p_artifact_id for update;
 if not found or not private.can_manage_document_artifact(p_artifact_id) then raise exception using errcode='42501',message='document_artifact_finalize_forbidden';end if;
 if v_a.status<>'draft' then raise exception using errcode='23514',message='only_draft_document_can_finalize';end if;
 if p_expected_revision is distinct from v_a.revision then raise exception using errcode='PT409',message='document_artifact_revision_conflict';end if;
 select * into v_p from public.user_profiles where id=v_a.patient_id;
 v_c:=private.compose_document_payload(v_a.layout_code,v_a.layout_version,v_a.identity_id,
   jsonb_strip_nulls(jsonb_build_object('id',v_p.id,'name',v_p.name,'birth_date',v_p.birth_date)),
   v_a.draft_payload,jsonb_build_object('artifact_id',v_a.id,'source_type',v_a.source_type,'source_id',v_a.source_id,'visibility',v_a.visibility,'created_at',v_a.created_at));
 v_hash:=encode(extensions.digest(convert_to(v_c::text,'UTF8'),'sha256'),'hex');
 update public.document_artifacts set status='finalized',canonical_payload=v_c,canonical_sha256=v_hash,finalized_at=now(),finalized_by=auth.uid(),revision=revision+1,updated_at=now() where id=v_a.id;
 insert into public.document_artifact_events(artifact_id,actor_id,event_type,from_status,to_status,reason,metadata)values(v_a.id,auth.uid(),'finalized','draft','finalized','document_finalized',jsonb_build_object('sha256',v_hash));
 return jsonb_build_object('artifact_id',v_a.id,'status','finalized','revision',v_a.revision+1,'sha256',v_hash);
end$function$;
COMMIT;

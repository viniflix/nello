BEGIN;

-- Versioned scientific oracle: decimal NUMERIC, independent of browser arithmetic.
-- No UPDATE of historical clinical records.
CREATE FUNCTION private.wave10_energy_reference(p_method text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
 w numeric:=(p_input->>'weight_kg')::numeric;h numeric:=(p_input->>'height_cm')::numeric;
 a numeric:=(p_input->>'age_years')::numeric;lm numeric:=(p_input->>'lean_mass_kg')::numeric;
 sex text:=lower(p_input->>'sex');activity text:=p_input->>'dri_activity';
 male boolean;basal numeric;total numeric;adj numeric;factor numeric;mobility numeric;
 c numeric[];idx integer;target numeric:=(p_input->>'venta_target_weight')::numeric;days numeric:=(p_input->>'venta_timeframe_days')::numeric;
BEGIN
 IF w IS NULL OR h IS NULL OR a IS NULL OR w NOT BETWEEN 1 AND 300 OR h NOT BETWEEN 50 AND 255
  OR a<>trunc(a) OR a NOT BETWEEN 18 AND 120 OR sex IS NULL OR sex NOT IN('m','f','male','female','masculino','feminino')
  OR (lm IS NOT NULL AND (lm<=0 OR lm>w)) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='invalid_energy_biometry';END IF;
 male:=sex IN('m','male','masculino');
 IF p_method IN('eer_iom','dri_2023') THEN
  IF a<19 OR p_input->>'life_stage' IS DISTINCT FROM 'adult' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='adult_dri_required';END IF;
  idx:=array_position(ARRAY['inactive','low_active','active','very_active'],activity);
  IF idx IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='dri_activity_required';END IF;
 END IF;
 CASE p_method
 WHEN 'harris' THEN basal:=CASE WHEN male THEN 66.473+13.7516*w+5.0033*h-6.755*a ELSE 655.0955+9.5634*w+1.8496*h-4.6756*a END;
 WHEN 'mifflin' THEN basal:=10*w+6.25*h-5*a+CASE WHEN male THEN 5 ELSE -161 END;
 WHEN 'fao_1985' THEN basal:=CASE WHEN male THEN CASE WHEN a<30 THEN 15.3*w+679 WHEN a<60 THEN 11.6*w+879 ELSE 13.5*w+487 END ELSE CASE WHEN a<30 THEN 14.7*w+496 WHEN a<60 THEN 8.7*w+829 ELSE 10.5*w+596 END END;
 WHEN 'cunningham' THEN basal:=500+22*lm;
 WHEN 'tinsley' THEN basal:=284+25.9*lm;
 WHEN 'eer_iom' THEN
  factor:=CASE WHEN male THEN (ARRAY[1,1.11,1.25,1.48]::numeric[])[idx] ELSE (ARRAY[1,1.12,1.27,1.45]::numeric[])[idx] END;
  total:=CASE WHEN male THEN 662-9.53*a+factor*(15.91*w+539.6*h/100) ELSE 354-6.91*a+factor*(9.36*w+726*h/100) END;
 WHEN 'dri_2023' THEN
  c:=CASE WHEN male THEN CASE idx WHEN 1 THEN ARRAY[753.07,10.83,6.5,14.1] WHEN 2 THEN ARRAY[581.47,10.83,8.3,14.94] WHEN 3 THEN ARRAY[1004.82,10.83,6.52,15.91] ELSE ARRAY[-517.88,10.83,15.61,19.11] END
   ELSE CASE idx WHEN 1 THEN ARRAY[584.9,7.01,5.72,11.71] WHEN 2 THEN ARRAY[575.77,7.01,6.6,12.14] WHEN 3 THEN ARRAY[710.25,7.01,6.54,12.34] ELSE ARRAY[511.83,7.01,9.07,12.56] END END;
  total:=c[1]-c[2]*a+c[3]*h+c[4]*w;
 ELSE RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='unsupported_energy_equation';END CASE;
 IF p_method IN('cunningham','tinsley') AND lm IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='lean_mass_required';END IF;
 IF p_method='harris' THEN
  mobility:=CASE p_input->>'clinical_mobility' WHEN 'bedridden' THEN 1.2 WHEN 'ambulatory' THEN 1.3 WHEN 'bedridden_ventilated' THEN 1.1 WHEN 'bedridden_mobile' THEN 1.25 END;
  factor:=CASE p_input->>'injury_factor_id' WHEN 'none' THEN 1 WHEN 'postoperative_cancer' THEN 1.1 WHEN 'fractures' THEN 1.33 WHEN 'trauma_infection' THEN 1.79 WHEN 'peritonitis' THEN 1.4 WHEN 'multitrauma_rehabilitation' THEN 1.5 WHEN 'multitrauma_sepsis' THEN 1.6 WHEN 'burn_30_50' THEN 1.7 WHEN 'burn_50_70' THEN 1.8 WHEN 'burn_70_90' THEN 2 END;
  IF mobility IS NULL OR factor IS NULL OR (p_input->>'injury_factor')::numeric IS DISTINCT FROM factor OR (p_input->>'mobility_factor')::numeric IS DISTINCT FROM mobility THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='invalid_clinical_factors';END IF;
  total:=basal*mobility*factor;
 ELSIF basal IS NOT NULL THEN
  factor:=(p_input->>'activity_factor')::numeric;
  IF factor IS NULL OR factor NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='invalid_activity_factor';END IF;
  total:=basal*factor;
 END IF;
 IF target IS NOT NULL OR days IS NOT NULL THEN
  IF target IS NULL OR days IS NULL OR target NOT BETWEEN 1 AND 300 OR days<>trunc(days) OR days NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='invalid_weight_target';END IF;
  adj:=(w-target)*7700/days;
  IF adj<>0 AND p_input#>>'{venta_review,confirmed}' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='weight_target_confirmation_required';END IF;
  IF (adj>1000 OR (adj>0 AND abs(w-target)*7/days>0.91) OR (adj<>0 AND basal IS NOT NULL AND total-adj<basal))
   AND length(trim(coalesce(p_input#>>'{venta_review,clinical_reason}','')))<10 THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='clinical_weight_target_reason_required';END IF;
 END IF;
 IF total-coalesce(adj,0)<=0 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='nonpositive_energy_target';END IF;
 RETURN jsonb_build_object('tmb',basal,'get',total,'adjustment',adj,'planned',total-coalesce(adj,0));
END $$;

CREATE FUNCTION private.wave10_validate_energy_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expected jsonb;key text;actual numeric;wanted numeric;exact_value jsonb;
BEGIN
 -- Old open clients remain compatible; their immutable snapshots retain the old version.
 IF coalesce((NEW.source_snapshot->>'engine_version')::integer,0)<6 THEN RETURN NEW;END IF;
 IF NEW.source_snapshot->>'engine_version' IS DISTINCT FROM '6'
  OR NEW.source_snapshot#>>'{arithmetic_policy,arithmetic}' IS DISTINCT FROM 'exact_decimal_rational'
  OR NEW.source_snapshot#>>'{arithmetic_policy,intermediateRounding}' IS DISTINCT FROM 'none'
  THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='invalid_energy_engine_contract';END IF;
 expected:=private.wave10_energy_reference(NEW.tmb_protocol,NEW.input_snapshot);
 IF NEW.weight IS DISTINCT FROM (NEW.input_snapshot->>'weight_kg')::numeric
  OR NEW.height IS DISTINCT FROM (NEW.input_snapshot->>'height_cm')::numeric
  OR NEW.age IS DISTINCT FROM (NEW.input_snapshot->>'age_years')::numeric
  OR NEW.gender IS DISTINCT FROM NEW.input_snapshot->>'sex'
  OR NEW.activity_factor IS DISTINCT FROM (NEW.input_snapshot->>'activity_factor')::numeric
  OR NEW.injury_factor IS DISTINCT FROM (NEW.input_snapshot->>'injury_factor')::numeric
  OR NEW.venta_target_weight IS DISTINCT FROM (NEW.input_snapshot->>'venta_target_weight')::numeric
  OR NEW.venta_timeframe_days IS DISTINCT FROM (NEW.input_snapshot->>'venta_timeframe_days')::integer
  THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='energy_input_snapshot_mismatch';END IF;
 FOREACH key IN ARRAY ARRAY['tmb','get','adjustment','planned'] LOOP
  wanted:=(expected->>key)::numeric;
  actual:=CASE key WHEN 'tmb' THEN NEW.tmb_result WHEN 'get' THEN NEW.get_result WHEN 'adjustment' THEN NEW.venta_adjustment_kcal ELSE NEW.final_planned_kcal END;
  IF (actual IS NULL)<>(wanted IS NULL) OR abs(actual-wanted)>0.00000001
   OR (NEW.output_snapshot->>CASE key WHEN 'tmb' THEN 'tmb_kcal' WHEN 'get' THEN 'get_kcal' WHEN 'adjustment' THEN 'venta_adjustment_kcal' ELSE 'planned_kcal' END)::numeric IS DISTINCT FROM actual
   THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='energy_result_mismatch';END IF;
  exact_value:=NEW.output_snapshot#>ARRAY['calculation_details','exactResults',key];
  IF wanted IS NULL THEN
   IF exact_value IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='energy_exact_snapshot_mismatch';END IF;
  ELSE
   IF exact_value IS NULL OR length(exact_value->>'numerator')>256 OR length(exact_value->>'denominator')>256
    OR coalesce(exact_value->>'numerator','') !~ '^-?[0-9]+$' OR coalesce(exact_value->>'denominator','') !~ '^[0-9]+$'
    THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='energy_exact_snapshot_mismatch';END IF;
   IF (exact_value->>'denominator')::numeric<=0
    OR abs((exact_value->>'numerator')::numeric/(exact_value->>'denominator')::numeric-wanted)>0.00000001
    THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='energy_exact_snapshot_mismatch';END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_wave10_energy_validate BEFORE INSERT ON public.energy_expenditure_calculations FOR EACH ROW EXECUTE FUNCTION private.wave10_validate_energy_insert();

CREATE FUNCTION private.wave10_preserve_energy_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','updated_at','care_episode_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','care_episode_id']) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='energy_history_immutable_create_new_calculation';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_wave10_energy_history BEFORE UPDATE OR DELETE ON public.energy_expenditure_calculations FOR EACH ROW EXECUTE FUNCTION private.wave10_preserve_energy_history();
REVOKE ALL ON FUNCTION private.wave10_energy_reference(text,jsonb),private.wave10_validate_energy_insert(),private.wave10_preserve_energy_history() FROM PUBLIC,anon,authenticated;
COMMIT;

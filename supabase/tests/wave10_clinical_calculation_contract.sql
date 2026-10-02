BEGIN;
DO $$DECLARE input jsonb:='{"weight_kg":70,"height_cm":175,"age_years":30,"sex":"M","clinical_mobility":"ambulatory","mobility_factor":1.3,"injury_factor_id":"peritonitis","injury_factor":1.4,"venta_target_weight":69,"venta_timeframe_days":21,"venta_review":{"confirmed":true}}';r jsonb;BEGIN
 r:=private.wave10_energy_reference('harris',input);
 IF (r->>'tmb')::numeric<>1702.0125 OR (r->>'get')::numeric<>3097.66275
  OR abs((r->>'planned')::numeric-2730.9960833333333333)>0.00000001 THEN RAISE EXCEPTION 'hand_calculated_harris_mismatch';END IF;
 r:=private.wave10_energy_reference('dri_2023','{"weight_kg":70,"height_cm":175,"age_years":30,"sex":"F","dri_activity":"active","life_stage":"adult"}');
 IF (r->>'get')::numeric<>2508.25 OR r->>'tmb' IS NOT NULL THEN RAISE EXCEPTION 'hand_calculated_dri_mismatch';END IF;
 BEGIN PERFORM private.wave10_energy_reference('harris',input||'{"injury_factor_id":"diabetes"}');RAISE EXCEPTION 'invalid_diagnosis_was_accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM private.wave10_energy_reference('harris',input||'{"injury_factor":1.6}');RAISE EXCEPTION 'forged_factor_was_accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM private.wave10_energy_reference('dri_2023','{"weight_kg":70,"height_cm":175,"age_years":18,"sex":"F","dri_activity":"active","life_stage":"adult"}');RAISE EXCEPTION 'unsupported_age_accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 IF has_function_privilege('authenticated','private.wave10_energy_reference(text,jsonb)','EXECUTE') OR has_function_privilege('anon','private.wave10_energy_reference(text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'private_oracle_exposed';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_wave10_energy_history' AND NOT tgisinternal)
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_wave10_energy_validate' AND NOT tgisinternal) THEN RAISE EXCEPTION 'clinical_contract_trigger_missing';END IF;
END $$;
ROLLBACK;

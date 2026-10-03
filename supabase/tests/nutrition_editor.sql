-- Run only with the synthetic clinical-attachments fixture in isolated QA.
BEGIN;
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-0000-0000-000000000081' WHERE id='20000000-0000-0000-0000-000000000081';
INSERT INTO public.reference_foods(id,name,source,source_id,calories,protein,carbs,fat,portion_size,base_unit,is_active) VALUES
('91000000-0000-0000-0000-000000000001','Requeijão cremoso','TBCA','QA-REQUEIJAO',281,9.91,3.03,25.5,100,'g',true),
('91000000-0000-0000-0000-000000000002','Bolo com requeijão','TBCA','QA-BOLO',300,5,50,10,100,'g',true),
('91000000-0000-0000-0000-000000000003','Queijo, Requeijão','TBCA','QA-QUEIJO',281,9.91,3.03,25.5,100,'g',true),
('91000000-0000-0000-0000-000000000004','Pão francês','TBCA','QA-PAO',285.6,9.42,56.8,2.55,100,'g',true);
INSERT INTO public.food_measures(id,reference_food_id,label,weight_in_grams) VALUES
('92000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000004','Unidade média',50);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000081","role":"authenticated"}',true);
DO $$ DECLARE v_name text; v_id bigint; v_plan bigint; v_count integer; BEGIN
 SELECT name INTO v_name FROM public.search_foods_ranked('REQUEIJAO',null,null,50,0) LIMIT 1;
 IF v_name <> 'Requeijão cremoso' THEN RAISE EXCEPTION 'ranked_accent_search_failed: %',v_name; END IF;
 SELECT count(*) INTO v_count FROM public.search_foods_ranked('requ crem',null,null,50,0);
 IF v_count <> 1 THEN RAISE EXCEPTION 'prefix_token_search_failed'; END IF;
 INSERT INTO public.nutritionist_custom_measures(nutritionist_id,name,code,grams_equivalent)
 VALUES(auth.uid(),'Colher teste','custom_qa_spoon',30) RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'insert_returning_failed'; END IF;
 BEGIN
  INSERT INTO public.nutritionist_custom_measures(nutritionist_id,name,code,grams_equivalent)
  VALUES('10000000-0000-0000-0000-000000000085','Intrusão','custom_qa_other',30);
  RAISE EXCEPTION 'cross_owner_insert_allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.meal_plans(patient_id,nutritionist_id,name,is_draft,start_date)
 VALUES('20000000-0000-0000-0000-000000000081',auth.uid(),'QA dieta',true,current_date) RETURNING id INTO v_plan;
 PERFORM public.upsert_full_meal_plan(v_plan,jsonb_build_object('name','QA dieta','is_draft',false,'start_date',current_date),
 '[{"name":"Café","meal_type":"breakfast","order_index":0,"total_calories":142.8,"foods":[{"food_id":"91000000-0000-0000-0000-000000000004","quantity":1,"unit":"92000000-0000-0000-0000-000000000004","calories":142.8,"carbs":28.4,"substitutes":[{"id":"91000000-0000-0000-0000-000000000001","quantity":0,"unit":"custom_qa_spoon"}]}]},{"name":"Alternativa","meal_type":"breakfast","order_index":1,"include_in_totals":false,"total_calories":999,"foods":[{"food_id":"91000000-0000-0000-0000-000000000004","quantity":0,"unit":"gram","calories":0}]}]'::jsonb);
 IF (SELECT daily_calories FROM public.meal_plans WHERE id=v_plan) <> 142.8 THEN RAISE EXCEPTION 'excluded_meal_total_failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.meal_plan_foods f JOIN public.meal_plan_meals m ON m.id=f.meal_plan_meal_id WHERE m.meal_plan_id=v_plan AND f.measure_snapshot->>'label'='Unidade média' AND (f.measure_snapshot->>'weight_in_grams')::numeric=50) THEN RAISE EXCEPTION 'uuid_measure_snapshot_failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.meal_plan_food_substitutions s JOIN public.meal_plan_foods f ON f.id=s.meal_plan_food_id JOIN public.meal_plan_meals m ON m.id=f.meal_plan_meal_id WHERE m.meal_plan_id=v_plan AND s.quantity=0 AND s.measure_snapshot->>'label'='Colher teste') THEN RAISE EXCEPTION 'substitution_zero_measure_failed'; END IF;
 FOR v_count IN 2..20 LOOP
  INSERT INTO public.nutritionist_custom_measures(nutritionist_id,name,code,grams_equivalent) VALUES(auth.uid(),'Medida '||v_count,'custom_qa_'||v_count,10);
 END LOOP;
 BEGIN
  INSERT INTO public.nutritionist_custom_measures(nutritionist_id,name,code,grams_equivalent) VALUES(auth.uid(),'Excedente','custom_qa_21',10);
  RAISE EXCEPTION 'quota_21_allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;

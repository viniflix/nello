-- Synthetic SQL oracle: no production connection, no historical recalculation.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES
 ('10000000-0000-0000-0000-000000316041','authenticated','authenticated','rc03-nutri@example.invalid','{"user_type":"nutritionist"}'),
 ('20000000-0000-0000-0000-000000316042','authenticated','authenticated','rc03-patient@example.invalid','{"user_type":"patient"}');
UPDATE public.user_profiles SET nutritionist_id='10000000-0000-0000-0000-000000316041' WHERE id='20000000-0000-0000-0000-000000316042';
UPDATE public.professional_verifications SET status='approved',professional_role='nutritionist',verification_method='approved_by_migration',valid_until=now()+interval '1 year',crn_region='CRN-3',crn_number='QA-RC03',normalized_crn='QARC03' WHERE user_id='10000000-0000-0000-0000-000000316041';
INSERT INTO public.nutritionist_patients(nutritionist_id,patient_id,status) VALUES('10000000-0000-0000-0000-000000316041','20000000-0000-0000-0000-000000316042','active');
CREATE FUNCTION pg_temp.assert_anamnesis(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'checkin contract failed: %',label; END IF; END; $$;

SELECT pg_temp.assert_anamnesis(private.anamnesis_graph_error('[{"fields":[{"id":"a","conditional_logic":{"field_id":"b","operator":"equals"}},{"id":"b","conditional_logic":{"field_id":"a","operator":"equals"}}]}]')='cycle','two-node cycle');
SELECT pg_temp.assert_anamnesis(private.anamnesis_graph_error('[{"fields":[{"id":"a","conditional_logic":{"field_id":"b","operator":"equals"}},{"id":"b","conditional_logic":{"field_id":"c","operator":"equals"}},{"id":"c","conditional_logic":{"field_id":"a","operator":"equals"}}]}]')='cycle','three-node cycle');
SELECT pg_temp.assert_anamnesis(private.anamnesis_graph_error('[{"fields":[{"id":"a"}]},{"fields":[{"id":"b","conditional_logic":{"field_id":"a","operator":"equals"}}]}]') IS NULL,'valid cross-section chain');
SELECT pg_temp.assert_anamnesis(private.anamnesis_graph_error('[{"fields":[{"id":"a","conditional_logic":{"field_id":"missing","operator":"equals"}}]}]')='invalid_condition','missing dependency');
SELECT pg_temp.assert_anamnesis(NOT has_function_privilege('authenticated','private.anamnesis_graph_error(jsonb)','EXECUTE'),'private helper has no client execution');
INSERT INTO public.anamnesis_templates(id,nutritionist_id,title,sections) VALUES('40000000-0000-0000-0000-000000416001','10000000-0000-0000-0000-000000316041','Synthetic RC04','[{"id":"s","title":"Synthetic","fields":[{"id":"a","label":"Synthetic","type":"text"}]}]');
INSERT INTO public.anamnesis_records(id,patient_id,nutritionist_id,template_id,status,template_snapshot,content) SELECT '40000000-0000-0000-0000-000000416002','20000000-0000-0000-0000-000000316042','10000000-0000-0000-0000-000000316041',id,'draft',jsonb_build_object('title',title,'sections',sections),'{}' FROM public.anamnesis_templates WHERE id='40000000-0000-0000-0000-000000416001';
CREATE TEMP TABLE rc04_issued_before AS SELECT md5(template_snapshot::text) digest FROM public.anamnesis_records WHERE id='40000000-0000-0000-0000-000000416002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000316041","role":"authenticated","aal":"aal1"}',true);
DO $contracts$
DECLARE first_link jsonb; second_link jsonb;
BEGIN
 BEGIN UPDATE public.anamnesis_templates SET sections='[{"fields":[{"id":"a","conditional_logic":{"field_id":"a","operator":"equals"}}]}]' WHERE id='40000000-0000-0000-0000-000000416001';RAISE EXCEPTION 'self loop accepted';EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM<>'ANAMNESIS_INVALID_CONDITIONS' THEN RAISE;END IF;END;
 first_link:=public.generate_anamnesis_link('40000000-0000-0000-0000-000000416002','10000000-0000-0000-0000-000000316041',3);
 PERFORM pg_temp.assert_anamnesis((first_link->>'expires_at')::timestamptz=now()+interval '3 days','server expiry exact');
 second_link:=public.generate_anamnesis_link('40000000-0000-0000-0000-000000416002','10000000-0000-0000-0000-000000316041',14);
 PERFORM pg_temp.assert_anamnesis(first_link->>'token'<>second_link->>'token','resend rotates token');
 PERFORM pg_temp.assert_anamnesis(public.get_anamnesis_by_token((first_link->>'token')::uuid)->>'error'='TOKEN_NOT_FOUND','old token revoked');
 BEGIN PERFORM public.generate_anamnesis_link('40000000-0000-0000-0000-000000416002','10000000-0000-0000-0000-000000316041',NULL);RAISE EXCEPTION 'null deadline accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Prazo inválido.' THEN RAISE;END IF;END;
 UPDATE public.anamnesis_records SET status='validated' WHERE id='40000000-0000-0000-0000-000000416002';
 BEGIN PERFORM public.generate_anamnesis_link('40000000-0000-0000-0000-000000416002','10000000-0000-0000-0000-000000316041',7);RAISE EXCEPTION 'completed record reissued';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $contracts$;
RESET ROLE;
SELECT pg_temp.assert_anamnesis((SELECT md5(template_snapshot::text)=(SELECT digest FROM rc04_issued_before) FROM public.anamnesis_records WHERE id='40000000-0000-0000-0000-000000416002'),'issued snapshot unchanged');

-- Emulate a historical invalid model before the new guards existed, only inside
-- this synthetic transaction. Re-enable both guards before exercising clients.
SELECT set_config('request.jwt.claims','{}',true);
ALTER TABLE public.anamnesis_templates DISABLE TRIGGER guard_anamnesis_template_graph;
ALTER TABLE public.anamnesis_records DISABLE TRIGGER guard_anamnesis_record_graph;
INSERT INTO public.anamnesis_templates(id,nutritionist_id,title,is_active,sections) VALUES('40000000-0000-0000-0000-000000416003','10000000-0000-0000-0000-000000316041','Legacy synthetic cycle',false,'[{"fields":[{"id":"a","conditional_logic":{"field_id":"b","operator":"equals"}},{"id":"b","conditional_logic":{"field_id":"a","operator":"equals"}}]}]');
INSERT INTO public.anamnesis_records(id,patient_id,nutritionist_id,template_id,status,content,template_snapshot) SELECT '40000000-0000-0000-0000-000000416004','20000000-0000-0000-0000-000000316042','10000000-0000-0000-0000-000000316041',id,'draft','{}',jsonb_build_object('title',title,'sections',sections) FROM public.anamnesis_templates WHERE id='40000000-0000-0000-0000-000000416003';
ALTER TABLE public.anamnesis_templates ENABLE TRIGGER guard_anamnesis_template_graph;
ALTER TABLE public.anamnesis_records ENABLE TRIGGER guard_anamnesis_record_graph;
CREATE TEMP TABLE rc04_legacy_before AS SELECT md5(template_snapshot::text) digest FROM public.anamnesis_records WHERE id='40000000-0000-0000-0000-000000416004';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000316041","role":"authenticated","aal":"aal1"}',true);
DO $legacy$
BEGIN
 UPDATE public.anamnesis_records SET content='{"a":"Synthetic preserved answer"}' WHERE id='40000000-0000-0000-0000-000000416004';
 UPDATE public.anamnesis_templates SET title='Legacy metadata retained' WHERE id='40000000-0000-0000-0000-000000416003';
 BEGIN UPDATE public.anamnesis_templates SET is_active=true WHERE id='40000000-0000-0000-0000-000000416003';RAISE EXCEPTION 'legacy cyclic template activated';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN UPDATE public.anamnesis_records SET status='validated' WHERE id='40000000-0000-0000-0000-000000416004';RAISE EXCEPTION 'legacy cyclic form finalized';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.generate_anamnesis_link('40000000-0000-0000-0000-000000416004','10000000-0000-0000-0000-000000316041',7);RAISE EXCEPTION 'legacy cyclic form issued';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
END $legacy$;
RESET ROLE;
SELECT pg_temp.assert_anamnesis((SELECT status='draft' AND content->>'a'='Synthetic preserved answer' AND md5(template_snapshot::text)=(SELECT digest FROM rc04_legacy_before) FROM public.anamnesis_records WHERE id='40000000-0000-0000-0000-000000416004'),'legacy answers and snapshot preserved, no finalization or token');

ROLLBACK;

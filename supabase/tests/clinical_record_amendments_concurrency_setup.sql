insert into public.clinical_records(
  id,patient_id,care_episode_id,nutritionist_id,author_id,record_type,status,
  visibility,encounter_at,content,template_code,template_version,canonical_hash,signed_at
) select
  id,'20000000-0000-0000-0000-000000000061','40000000-0000-0000-0000-000000000061',
  '10000000-0000-0000-0000-000000000061','10000000-0000-0000-0000-000000000061',
  'clinical_evolution','signed','professional_private',now(),
  jsonb_build_object('context','concurrency fixture ' || id::text),'nello_standard',1,
  repeat(marker,64),now()-interval '1 hour'
from (values
  ('70000000-0000-0000-0000-000000000071'::uuid,'1'),
  ('70000000-0000-0000-0000-000000000072'::uuid,'2'),
  ('70000000-0000-0000-0000-000000000073'::uuid,'3'),
  ('70000000-0000-0000-0000-000000000074'::uuid,'4'),
  ('70000000-0000-0000-0000-000000000075'::uuid,'5')
) fixture(id,marker);

insert into public.clinical_record_events(
  clinical_record_id,from_status,to_status,actor_id,metadata,created_at
) select id,'finalized','signed','10000000-0000-0000-0000-000000000061',
  '{"auth_level":"aal1"}'::jsonb,now()-interval '1 hour'
from (values
  ('70000000-0000-0000-0000-000000000071'::uuid),
  ('70000000-0000-0000-0000-000000000072'::uuid),
  ('70000000-0000-0000-0000-000000000073'::uuid),
  ('70000000-0000-0000-0000-000000000074'::uuid),
  ('70000000-0000-0000-0000-000000000075'::uuid)
) fixture(id);

do $$
declare
  v_impact jsonb;
  v_started jsonb;
  v_updated jsonb;
  v_target uuid;
begin
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000061',true);
  foreach v_target in array array[
    '70000000-0000-0000-0000-000000000074'::uuid,
    '70000000-0000-0000-0000-000000000075'::uuid
  ] loop
    v_impact:=public.get_clinical_record_amendment_impact(v_target);
    v_started:=public.start_clinical_record_correction(
      v_target,'Correção preparada para testar assinatura concorrente real.',
      jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true)
    );
    v_updated:=public.update_clinical_record_draft(
      (v_started->>'replacement_record_id')::uuid,
      '{"context":"Versão corrigida pronta para assinatura concorrente.","conduct":"Conduta validada."}'::jsonb,
      'professional_private',1
    );
    perform public.finalize_clinical_record(
      (v_started->>'replacement_record_id')::uuid,
      '{"context":"Versão corrigida pronta para assinatura concorrente.","conduct":"Conduta validada."}'::jsonb,
      (v_updated->>'revision')::bigint,null
    );
  end loop;
end
$$;

create table public.c4_concurrency_barrier_control(
  barrier_key integer primary key,
  release boolean not null default false
);

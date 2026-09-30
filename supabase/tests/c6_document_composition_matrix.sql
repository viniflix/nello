begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','93000000-0000-0000-0000-000000000001','authenticated','authenticated','c6-composition@nello.test','x',now(),'{}','{}',now(),now());
insert into public.user_profiles(id,name,user_type,is_admin,is_active,email)
values('93000000-0000-0000-0000-000000000001','Composição C6','nutritionist',false,true,'c6-composition@nello.test');
update public.professional_verifications set crn_region='CRN-3',crn_number='C6-C1',normalized_crn='CRN3C6C1'
where user_id='93000000-0000-0000-0000-000000000001';
insert into public.professional_document_identities(
  professional_id,verification_id,version,status,professional_name,primary_color,accent_color,
  crn_region,crn_number,normalized_crn,created_by
)
select p.id,v.id,1,'active','Composição C6','#4F8A3C','#7DAF69',v.crn_region,v.crn_number,v.normalized_crn,p.id
from public.user_profiles p join public.professional_verifications v on v.user_id=p.id
where p.id='93000000-0000-0000-0000-000000000001';
do $$
declare v_payload jsonb;
begin
  if (select count(*) from public.document_layouts where is_active)<>6
     or (select count(*) from public.document_layout_versions)<>6 then
    raise exception 'c6_composition_seed_failed';
  end if;
  if exists(select 1 from public.document_layout_versions
    where nello_attribution<>'Gerado com Nello'
      or tokens->>'nello_brand_locked'<>'true'
      or tokens->>'arbitrary_html'<>'false'
      or tokens->>'arbitrary_css'<>'false') then
    raise exception 'c6_composition_brand_or_sandbox_failed';
  end if;
  if has_table_privilege('anon','public.document_layouts','select')
     or not has_table_privilege('authenticated','public.document_layouts','select') then
    raise exception 'c6_composition_catalog_grant_failed';
  end if;

  select private.compose_document_payload(
    'clinical_record',1,
    (select id from public.professional_document_identities order by created_at desc limit 1),
    '{"name":"Paciente Composição"}',
    '{"sections":[{"title":"Evolução","text":"Conteúdo confirmado"}]}',
    '{"title":"EVOLUÇÃO CLÍNICA"}'
  ) into v_payload;
  if v_payload->'branding'->>'product'<>'Nello'
     or v_payload->'branding'->>'attribution'<>'Gerado com Nello'
     or (v_payload->'branding'->>'removable')::boolean is not false
     or v_payload->'professional'->>'identity_id' is null then
    raise exception 'c6_composition_payload_failed:%',v_payload;
  end if;

  begin
    update public.document_layout_versions set tokens='{}' where layout_code='clinical_record';
    raise exception 'c6_composition_version_mutation_accepted';
  exception when raise_exception then
    if sqlerrm<>'document_layout_versions_are_immutable' then raise; end if;
  end;
end;
$$;
rollback;

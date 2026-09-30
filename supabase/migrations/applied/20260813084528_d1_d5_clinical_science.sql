-- D1-D5: versioned scientific catalog, professional acceptance and immutable clinical provenance.

create table public.scientific_sources (
  code text not null,
  version integer not null,
  title text not null,
  publisher text not null,
  publication_year integer,
  source_url text not null,
  citation text not null,
  jurisdiction text,
  retrieved_at date not null,
  status text not null default 'active' check(status in('active','superseded','retired')),
  created_at timestamptz not null default now(),
  primary key(code,version)
);

create table public.clinical_protocol_catalog (
  code text not null,
  version integer not null,
  domain text not null check(domain in('anthropometry','energy','laboratory','food_composition','meal_plan')),
  name text not null,
  description text not null,
  implementation_key text,
  source_code text not null,
  source_version integer not null,
  population jsonb not null default '{}'::jsonb,
  required_inputs jsonb not null default '[]'::jsonb,
  limitations text not null,
  validation_status text not null default 'candidate' check(validation_status in('candidate','validated','restricted','retired')),
  effective_from date not null,
  effective_until date,
  created_at timestamptz not null default now(),
  primary key(code,version),
  foreign key(source_code,source_version) references public.scientific_sources(code,version) on delete restrict
);

create table public.clinical_protocol_acceptances (
  id uuid primary key default gen_random_uuid(),
  protocol_code text not null,
  protocol_version integer not null,
  nutritionist_id uuid not null references public.user_profiles(id) on delete restrict,
  decision text not null check(decision in('accepted','rejected','restricted')),
  reason text not null check(char_length(reason) between 10 and 1000),
  accepted_at timestamptz not null default now(),
  superseded_at timestamptz,
  foreign key(protocol_code,protocol_version) references public.clinical_protocol_catalog(code,version) on delete restrict
);
create index clinical_protocol_acceptances_nutritionist_idx on public.clinical_protocol_acceptances(nutritionist_id,accepted_at desc);
create unique index clinical_protocol_acceptances_current_idx on public.clinical_protocol_acceptances(protocol_code,protocol_version,nutritionist_id) where superseded_at is null;

create table public.clinical_calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.user_profiles(id) on delete restrict,
  care_episode_id uuid not null references public.care_episodes(id) on delete restrict,
  nutritionist_id uuid not null references public.user_profiles(id) on delete restrict,
  domain text not null check(domain in('anthropometry','energy','laboratory','meal_plan')),
  source_entity text not null,
  source_id text not null,
  protocol_code text not null,
  protocol_version integer not null,
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
  professional_decision text not null check(char_length(professional_decision) between 3 and 1000),
  confirmed_by uuid not null references public.user_profiles(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key(protocol_code,protocol_version) references public.clinical_protocol_catalog(code,version) on delete restrict
);
create index clinical_calculation_snapshots_patient_episode_idx on public.clinical_calculation_snapshots(patient_id,care_episode_id,created_at desc);
create index clinical_calculation_snapshots_protocol_idx on public.clinical_calculation_snapshots(protocol_code,protocol_version);

insert into public.scientific_sources(code,version,title,publisher,publication_year,source_url,citation,jurisdiction,retrieved_at) values
('TBCA',73,'Tabela Brasileira de ComposiÃ§Ã£o de Alimentos â€” versÃ£o 7.3','USP / BRASILFOODS / FoRC',2026,'https://www.tbca.net.br/','TBCA. Tabela Brasileira de ComposiÃ§Ã£o de Alimentos, versÃ£o 7.3.','Brasil','2026-08-13'),
('CFN594',1,'ResoluÃ§Ã£o CFN nÂº 594/2017 â€” registro em prontuÃ¡rio','Conselho Federal de Nutricionistas',2017,'https://www.cfn.org.br/wp-content/uploads/resolucoes/DOU_593.pdf','CFN. ResoluÃ§Ã£o nÂº 594, de 17 de dezembro de 2017.','Brasil','2026-08-13'),
('HARRIS1984',1,'A biometric study of basal metabolism in man â€” revised equations','Roza & Shizgal',1984,'https://pubmed.ncbi.nlm.nih.gov/6741850/','Roza AM, Shizgal HM. The Harris Benedict equation reevaluated. Am J Clin Nutr. 1984.','Internacional','2026-08-13'),
('MIFFLIN1990',1,'A new predictive equation for resting energy expenditure','Mifflin et al.',1990,'https://pubmed.ncbi.nlm.nih.gov/2305711/','Mifflin MD et al. Am J Clin Nutr. 1990;51:241-247.','Internacional','2026-08-13'),
('WHO1985',1,'Energy and protein requirements','WHO/FAO/UNU',1985,'https://iris.who.int/handle/10665/39527','WHO Technical Report Series 724. Energy and protein requirements. 1985.','Internacional','2026-08-13'),
('IOM2005',1,'Dietary Reference Intakes for Energy','Institute of Medicine',2005,'https://nap.nationalacademies.org/catalog/10490/','IOM. Dietary Reference Intakes for Energy. 2005.','Internacional','2026-08-13'),
('ANVISA429',1,'RDC nÂº 429/2020 e IN nÂº 75/2020 â€” rotulagem nutricional','ANVISA',2020,'https://www.gov.br/anvisa/pt-br/assuntos/alimentos/rotulagem/rotulagem-nutricional','ANVISA. RDC 429/2020 e IN 75/2020.','Brasil','2026-08-13'),
('CUNNINGHAM1980',1,'A reanalysis of the factors influencing basal metabolic rate in normal adults','Cunningham',1980,'https://doi.org/10.1093/ajcn/33.11.2372','Cunningham JJ. Am J Clin Nutr. 1980;33:2372-2374.','Internacional','2026-08-13'),
('TINSLEY2018',1,'Resting metabolic rate in muscular physique athletes','Tinsley et al.',2018,'https://pubmed.ncbi.nlm.nih.gov/30240568/','Tinsley GM et al. Am J Clin Nutr. 2019;110:135-145.','Internacional','2026-08-13'),
('MS_SISVAN',1,'OrientaÃ§Ãµes para coleta e anÃ¡lise de dados antropomÃ©tricos','MinistÃ©rio da SaÃºde / SISVAN',2011,'https://bvsms.saude.gov.br/bvs/publicacoes/orientacoes_basicas_sisvan.pdf','Brasil. MinistÃ©rio da SaÃºde. OrientaÃ§Ãµes para coleta e anÃ¡lise de dados antropomÃ©tricos em serviÃ§os de saÃºde.','Brasil','2026-08-13'),
('WHO_GROWTH',1,'WHO Child Growth Standards and Growth Reference 5â€“19 years','World Health Organization',2007,'https://www.who.int/tools/growth-reference-data-for-5to19-years','WHO. Child Growth Standards; Growth Reference 5â€“19 years.','Internacional','2026-08-13');

insert into public.clinical_protocol_catalog(code,version,domain,name,description,implementation_key,source_code,source_version,population,required_inputs,limitations,effective_from) values
('energy.harris_benedict_revised',1,'energy','Harris-Benedict revisada','Estimativa de gasto energÃ©tico basal por peso, altura, idade e sexo.','harris','HARRIS1984',1,'{"adults":true}','["weight_kg","height_cm","age_years","sex"]','Estimativa populacional; o nutricionista deve avaliar aplicabilidade individual.','2026-08-13'),
('energy.mifflin_st_jeor',1,'energy','Mifflin-St Jeor','Estimativa de gasto energÃ©tico de repouso em adultos.','mifflin','MIFFLIN1990',1,'{"adults":true}','["weight_kg","height_cm","age_years","sex"]','NÃ£o substitui calorimetria indireta nem julgamento clÃ­nico.','2026-08-13'),
('energy.fao_who_1985',1,'energy','FAO/OMS 1985','EquaÃ§Ãµes por faixa etÃ¡ria e sexo.','fao_1985','WHO1985',1,'{"adults":true}','["weight_kg","age_years","sex"]','Confirmar faixa etÃ¡ria e contexto clÃ­nico.','2026-08-13'),
('energy.eer_iom_2005',1,'energy','EER/IOM 2005','Estimativa de necessidade energÃ©tica com coeficiente de atividade.','eer_iom','IOM2005',1,'{"adults":true}','["weight_kg","height_cm","age_years","sex","physical_activity"]','Coeficiente de atividade precisa de avaliaÃ§Ã£o profissional.','2026-08-13'),
('anthropometry.bmi_adult',1,'anthropometry','IMC adulto','CÃ¡lculo de IMC como indicador complementar.','bmi','MS_SISVAN',1,'{"adults_20_to_59":true}','["weight_kg","height_m"]','NÃ£o usar isoladamente para diagnÃ³stico nutricional ou definiÃ§Ã£o de meta.','2026-08-13'),
('anthropometry.bmi_elderly_sisvan',1,'anthropometry','IMC da pessoa idosa â€” SISVAN','Faixas brasileiras para pessoas com 60 anos ou mais.','bmi_elderly','MS_SISVAN',1,'{"age_min_years":60}','["weight_kg","height_m","age_years"]','Exige avaliaÃ§Ã£o multidimensional, composiÃ§Ã£o corporal, funcionalidade e contexto clÃ­nico.','2026-08-13'),
('anthropometry.pediatric_who_lms',1,'anthropometry','Curvas OMS pediÃ¡tricas','IMC-por-idade/sexo e escore-z usando tabelas LMS completas.','pediatric_who_lms','WHO_GROWTH',1,'{"age_months_min":0,"age_months_max":228}','["weight_kg","height_m","age_months","sex"]','Motor automÃ¡tico ainda restrito: nÃ£o usar aproximaÃ§Ãµes anuais; avaliaÃ§Ã£o profissional pelas curvas completas.', '2026-08-13'),
('laboratory.manual_reference',1,'laboratory','ReferÃªncia informada pelo laudo','InterpretaÃ§Ã£o assistida usando intervalo e unidade do laboratÃ³rio de origem.','manual_lab_reference','CFN594',1,'{}','["marker","value","unit","reference_range"]','Intervalos variam por mÃ©todo, laboratÃ³rio, idade, sexo e condiÃ§Ã£o clÃ­nica; exige confirmaÃ§Ã£o profissional.','2026-08-13'),
('food.tbca_7_3',1,'food_composition','TBCA 7.3','ComposiÃ§Ã£o de alimentos brasileiros com fonte preservada.','tbca','TBCA',73,'{"brazil":true}','["food_code","portion"]','Valores dependem da descriÃ§Ã£o, preparaÃ§Ã£o e qualidade do dado de origem.','2026-08-13'),
('meal_plan.cfn_record',1,'meal_plan','Registro de prescriÃ§Ã£o dietÃ©tica','Campos mÃ­nimos e rastreabilidade profissional do plano.','meal_plan_record','CFN594',1,'{}','["date","energy","diet_characteristics","fractionation","professional"]','A prescriÃ§Ã£o e a decisÃ£o final sÃ£o privativas do nutricionista responsÃ¡vel.','2026-08-13'),
('energy.cunningham_1980',1,'energy','Cunningham 1980','Estimativa baseada em massa livre de gordura.','cunningham','CUNNINGHAM1980',1,'{"adults":true,"requires_lean_mass":true}','["lean_mass_kg"]','A massa livre de gordura precisa ter origem e mÃ©todo avaliados; equaÃ§Ã£o populacional nÃ£o substitui calorimetria.','2026-08-13'),
('energy.tinsley_2018',1,'energy','Tinsley 2018 (MLG)','EquaÃ§Ã£o derivada em atletas de fÃ­sico muscular.','tinsley','TINSLEY2018',1,'{"muscular_physique_athletes":true,"requires_lean_mass":true}','["lean_mass_kg"]','PopulaÃ§Ã£o especÃ­fica; nÃ£o extrapolar sem julgamento clÃ­nico.','2026-08-13');

update public.clinical_protocol_catalog set validation_status='restricted'where code='anthropometry.pediatric_who_lms';

alter table public.growth_records add column if not exists protocol_code text,add column if not exists protocol_version integer,add column if not exists source_snapshot jsonb not null default '{}'::jsonb,add column if not exists confirmed_by uuid references public.user_profiles(id) on delete restrict,add column if not exists confirmed_at timestamptz,add column if not exists status text not null default 'active' check(status in('active','invalidated')),add column if not exists invalidated_at timestamptz,add column if not exists invalidated_by uuid references public.user_profiles(id) on delete restrict,add column if not exists invalidation_reason text;
alter table public.energy_expenditure_calculations add column if not exists protocol_code text,add column if not exists protocol_version integer,add column if not exists source_snapshot jsonb not null default '{}'::jsonb,add column if not exists input_snapshot jsonb not null default '{}'::jsonb,add column if not exists output_snapshot jsonb not null default '{}'::jsonb,add column if not exists confirmed_by uuid references public.user_profiles(id) on delete restrict,add column if not exists confirmed_at timestamptz;
alter table public.lab_results add column if not exists reference_source text not null default 'laboratory_report',add column if not exists reference_snapshot jsonb not null default '{}'::jsonb,add column if not exists interpretation_status text not null default 'pending' check(interpretation_status in('pending','confirmed')),add column if not exists confirmed_by uuid references public.user_profiles(id) on delete restrict,add column if not exists confirmed_at timestamptz,add column if not exists root_result_id bigint references public.lab_results(id) on delete restrict,add column if not exists supersedes_result_id bigint references public.lab_results(id) on delete restrict,add column if not exists revision_number integer not null default 1,add column if not exists is_latest_revision boolean not null default true,add column if not exists record_status text not null default 'active' check(record_status in('active','invalidated')),add column if not exists invalidated_at timestamptz,add column if not exists invalidated_by uuid references public.user_profiles(id) on delete restrict,add column if not exists invalidation_reason text;
create unique index if not exists lab_results_one_latest_revision_idx on public.lab_results(root_result_id) where is_latest_revision;
create index if not exists lab_results_patient_latest_idx on public.lab_results(patient_id,test_date desc) where is_latest_revision and record_status='active';

alter table public.scientific_sources enable row level security;alter table public.clinical_protocol_catalog enable row level security;alter table public.clinical_protocol_acceptances enable row level security;alter table public.clinical_calculation_snapshots enable row level security;
revoke all on table public.scientific_sources,public.clinical_protocol_catalog,public.clinical_protocol_acceptances,public.clinical_calculation_snapshots from public,anon,authenticated;

create function public.list_clinical_protocol_catalog(p_domain text default null)returns setof jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'code',p.code,'version',p.version,'domain',p.domain,'name',p.name,
  'description',p.description,'implementation_key',p.implementation_key,
  'population',p.population,'required_inputs',p.required_inputs,
  'limitations',p.limitations,'validation_status',p.validation_status,
  'source',jsonb_build_object('code',s.code,'version',s.version,'title',s.title,'publisher',s.publisher,'citation',s.citation,'url',s.source_url),
  'professional_decision',case when a.id is null then null else jsonb_build_object('decision',a.decision,'reason',a.reason,'accepted_at',a.accepted_at)end
)
from public.clinical_protocol_catalog p
join public.scientific_sources s on(s.code,s.version)=(p.source_code,p.source_version)
left join lateral(
  select x.id,x.decision,x.reason,x.accepted_at
  from public.clinical_protocol_acceptances x
  where(x.protocol_code,x.protocol_version,x.nutritionist_id)=(p.code,p.version,auth.uid())and x.superseded_at is null
  order by x.accepted_at desc limit 1
)a on true
where auth.uid()is not null and(p_domain is null or p.domain=p_domain)and p.validation_status<>'retired'
order by p.domain,p.name,p.version desc$$;

create function public.accept_clinical_protocol(p_code text,p_version integer,p_decision text,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v_actor uuid:=auth.uid();v_reason text:=nullif(btrim(p_reason),'');begin if not exists(select 1 from public.professional_verifications where user_id=v_actor and professional_role='nutritionist'and status='approved'and valid_until>now())then raise exception using errcode='42501',message='verified_nutritionist_required';end if;if p_decision not in('accepted','rejected','restricted')or length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='protocol_decision_and_reason_required';end if;if not exists(select 1 from public.clinical_protocol_catalog where code=p_code and version=p_version)then raise exception using errcode='P0002',message='clinical_protocol_not_found';end if;update public.clinical_protocol_acceptances set superseded_at=now()where(protocol_code,protocol_version,nutritionist_id)=(p_code,p_version,v_actor)and superseded_at is null;insert into public.clinical_protocol_acceptances(protocol_code,protocol_version,nutritionist_id,decision,reason)values(p_code,p_version,v_actor,p_decision,v_reason);return jsonb_build_object('code',p_code,'version',p_version,'decision',p_decision);end$$;

create function public.invalidate_anthropometry_record(p_record_id bigint,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v public.growth_records%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='invalidation_reason_required';end if;select*into v from public.growth_records where id=p_record_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)then raise exception using errcode='42501',message='anthropometry_invalidation_forbidden';end if;if v.status='invalidated'then return jsonb_build_object('id',v.id,'status','invalidated','already_invalidated',true);end if;update public.growth_records set status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,is_latest_revision=false where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('anthropometry.record.invalidated',now(),jsonb_build_object('record_id',v.id,'reason',v_reason),v.patient_id,'anthropometry',auth.uid());return jsonb_build_object('id',v.id,'status','invalidated');end$$;

create function public.revise_anthropometry_record(p_record_id bigint,p_payload jsonb,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v public.growth_records%rowtype;v_id bigint;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='anthropometry_revision_reason_required';end if;select*into v from public.growth_records where id=p_record_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or v.status<>'active'or not v.is_latest_revision then raise exception using errcode='42501',message='anthropometry_revision_forbidden';end if;insert into public.growth_records(patient_id,care_episode_id,record_date,weight,height,notes,circumferences,skinfolds,bone_diameters,bioimpedance,photos,results,supersedes_record_id,change_reason,created_by_user_id,protocol_code,protocol_version,source_snapshot,confirmed_by,confirmed_at)values(v.patient_id,v.care_episode_id,coalesce((p_payload->>'record_date')::date,v.record_date),coalesce(nullif(p_payload->>'weight','')::numeric,v.weight),coalesce(nullif(p_payload->>'height','')::numeric,v.height),coalesce(p_payload->>'notes',v.notes),coalesce(p_payload->'circumferences',v.circumferences),coalesce(p_payload->'skinfolds',v.skinfolds),coalesce(p_payload->'bone_diameters',v.bone_diameters),coalesce(p_payload->'bioimpedance',v.bioimpedance),case when p_payload?'photos'then array(select jsonb_array_elements_text(p_payload->'photos'))else v.photos end,coalesce(p_payload->'results',v.results),v.id,v_reason,auth.uid(),coalesce(nullif(p_payload->>'protocol_code',''),v.protocol_code),coalesce((p_payload->>'protocol_version')::integer,v.protocol_version),coalesce(p_payload->'source_snapshot',v.source_snapshot),auth.uid(),now())returning id into v_id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('anthropometry.record.revised',now(),jsonb_build_object('previous_id',v.id,'new_id',v_id,'reason',v_reason),v.patient_id,'anthropometry',auth.uid());return(select to_jsonb(r)from public.growth_records r where id=v_id);end$$;

create function public.create_lab_result_record(p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_patient uuid:=(p_payload->>'patient_id')::uuid;v_episode uuid;v_id bigint;begin v_episode:=private.resolve_active_care_episode(v_patient);insert into public.lab_results(patient_id,care_episode_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,pdf_url,pdf_filename,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at)values(v_patient,v_episode,nullif(btrim(p_payload->>'test_name'),''),nullif(p_payload->>'test_value',''),nullif(p_payload->>'test_unit',''),nullif(p_payload->>'reference_min','')::numeric,nullif(p_payload->>'reference_max','')::numeric,coalesce(nullif(p_payload->>'status',''),'pending'),(p_payload->>'test_date')::date,nullif(p_payload->>'notes',''),nullif(p_payload->>'pdf_url',''),nullif(p_payload->>'pdf_filename',''),coalesce(nullif(p_payload->>'reference_source',''),'laboratory_report'),coalesce(p_payload->'reference_snapshot','{}'::jsonb),case when(p_payload->>'interpretation_confirmed')::boolean then'confirmed'else'pending'end,case when(p_payload->>'interpretation_confirmed')::boolean then auth.uid()else null end,case when(p_payload->>'interpretation_confirmed')::boolean then now()else null end)returning id into v_id;update public.lab_results set root_result_id=id where id=v_id;return(select to_jsonb(r)from public.lab_results r where id=v_id);end$$;

create function public.revise_lab_result_record(p_result_id bigint,p_payload jsonb,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v public.lab_results%rowtype;v_id bigint;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='lab_revision_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)then raise exception using errcode='42501',message='lab_revision_forbidden';end if;update public.lab_results set is_latest_revision=false where id=v.id;insert into public.lab_results(patient_id,care_episode_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,pdf_url,pdf_filename,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision)values(v.patient_id,v.care_episode_id,coalesce(nullif(btrim(p_payload->>'test_name'),''),v.test_name),coalesce(nullif(p_payload->>'test_value',''),v.test_value),coalesce(nullif(p_payload->>'test_unit',''),v.test_unit),coalesce(nullif(p_payload->>'reference_min','')::numeric,v.reference_min),coalesce(nullif(p_payload->>'reference_max','')::numeric,v.reference_max),coalesce(nullif(p_payload->>'status',''),v.status),coalesce((p_payload->>'test_date')::date,v.test_date),coalesce(nullif(p_payload->>'notes',''),v.notes),coalesce(nullif(p_payload->>'pdf_url',''),v.pdf_url),coalesce(nullif(p_payload->>'pdf_filename',''),v.pdf_filename),coalesce(nullif(p_payload->>'reference_source',''),v.reference_source),coalesce(p_payload->'reference_snapshot',v.reference_snapshot),'pending',null,null,coalesce(v.root_result_id,v.id),v.id,v.revision_number+1,true)returning id into v_id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.result.revised',now(),jsonb_build_object('previous_id',v.id,'new_id',v_id,'reason',v_reason),v.patient_id,'laboratory',auth.uid());return(select to_jsonb(r)from public.lab_results r where id=v_id);end$$;

create function public.invalidate_lab_result_record(p_result_id bigint,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v public.lab_results%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='invalidation_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)then raise exception using errcode='42501',message='lab_invalidation_forbidden';end if;update public.lab_results set record_status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=v_reason,is_latest_revision=false where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.result.invalidated',now(),jsonb_build_object('result_id',v.id,'reason',v_reason),v.patient_id,'laboratory',auth.uid());return jsonb_build_object('id',v.id,'status','invalidated');end$$;

create function public.confirm_lab_result_interpretation(p_result_id bigint,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$declare v public.lab_results%rowtype;v_reason text:=nullif(btrim(p_reason),'');begin if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='interpretation_confirmation_reason_required';end if;select*into v from public.lab_results where id=p_result_id for update;if not found or not private.can_write_active_care_episode(v.care_episode_id)or not v.is_latest_revision or v.record_status<>'active'then raise exception using errcode='42501',message='lab_interpretation_confirmation_forbidden';end if;update public.lab_results set interpretation_status='confirmed',confirmed_by=auth.uid(),confirmed_at=now()where id=v.id;insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.interpretation.confirmed',now(),jsonb_build_object('result_id',v.id,'reason',v_reason,'assisted_status',v.status),v.patient_id,'laboratory',auth.uid());return jsonb_build_object('id',v.id,'interpretation_status','confirmed','confirmed_at',now());end$$;

create function private.prevent_clinical_measurement_delete()returns trigger language plpgsql security definer set search_path='' as $$begin raise exception using errcode='23514',message='clinical_measurement_hard_delete_forbidden';end$$;
create trigger trg_growth_records_no_delete before delete on public.growth_records for each row execute function private.prevent_clinical_measurement_delete();
create trigger trg_lab_results_no_delete before delete on public.lab_results for each row execute function private.prevent_clinical_measurement_delete();
create trigger trg_energy_calculations_immutable before update or delete on public.energy_expenditure_calculations for each row execute function private.prevent_clinical_measurement_delete();

create function private.prevent_clinical_snapshot_mutation()returns trigger language plpgsql security definer set search_path='' as $$begin raise exception using errcode='23514',message='clinical_snapshot_immutable';end$$;
create trigger trg_clinical_calculation_snapshots_immutable before update or delete on public.clinical_calculation_snapshots for each row execute function private.prevent_clinical_snapshot_mutation();

create function private.capture_energy_calculation_snapshot()returns trigger language plpgsql security definer set search_path='' as $$begin if new.protocol_code is null or new.protocol_version is null or new.confirmed_by is null or new.confirmed_by<>auth.uid()then raise exception using errcode='23514',message='energy_protocol_and_professional_confirmation_required';end if;if not exists(select 1 from public.clinical_protocol_catalog where(code,version)=(new.protocol_code,new.protocol_version)and validation_status in('candidate','validated','restricted'))then raise exception using errcode='23514',message='unknown_energy_protocol_version';end if;insert into public.clinical_calculation_snapshots(patient_id,care_episode_id,nutritionist_id,domain,source_entity,source_id,protocol_code,protocol_version,input_snapshot,output_snapshot,professional_decision,confirmed_by,confirmed_at)values(new.patient_id,new.care_episode_id,new.nutritionist_id,'energy','energy_expenditure_calculations',new.id::text,new.protocol_code,new.protocol_version,new.input_snapshot,new.output_snapshot,'Protocolo, fatores e resultado confirmados pelo nutricionista responsÃ¡vel.',new.confirmed_by,coalesce(new.confirmed_at,now()));return new;end$$;
create trigger trg_energy_capture_clinical_snapshot after insert on public.energy_expenditure_calculations for each row execute function private.capture_energy_calculation_snapshot();

create function private.capture_anthropometry_calculation_snapshot()returns trigger language plpgsql security definer set search_path='' as $$
declare v_nutritionist uuid;
begin
  if new.protocol_code is null then return new;end if;
  if new.protocol_version is null or new.confirmed_by is null or new.confirmed_by<>auth.uid()then raise exception using errcode='23514',message='anthropometry_protocol_and_professional_confirmation_required';end if;
  if not exists(select 1 from public.clinical_protocol_catalog where(code,version)=(new.protocol_code,new.protocol_version)and domain='anthropometry'and validation_status in('candidate','validated','restricted'))then raise exception using errcode='23514',message='unknown_anthropometry_protocol_version';end if;
  select nutritionist_id into v_nutritionist from public.care_episodes where id=new.care_episode_id;
  insert into public.clinical_calculation_snapshots(patient_id,care_episode_id,nutritionist_id,domain,source_entity,source_id,protocol_code,protocol_version,input_snapshot,output_snapshot,professional_decision,confirmed_by,confirmed_at)
  values(new.patient_id,new.care_episode_id,v_nutritionist,'anthropometry','growth_records',new.id::text,new.protocol_code,new.protocol_version,
    jsonb_strip_nulls(jsonb_build_object('record_date',new.record_date,'weight_kg',new.weight,'height_cm',new.height,'source',new.source_snapshot)),
    coalesce(new.results,'{}'::jsonb),'MediÃ§Ãµes e avaliaÃ§Ã£o antropomÃ©trica confirmadas pelo profissional responsÃ¡vel.',new.confirmed_by,coalesce(new.confirmed_at,now()));
  return new;
end$$;
create trigger trg_anthropometry_capture_clinical_snapshot after insert on public.growth_records for each row execute function private.capture_anthropometry_calculation_snapshot();

create or replace function public.confirm_lab_result_interpretation(p_result_id bigint,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.lab_results%rowtype;v_reason text:=nullif(btrim(p_reason),'');v_nutritionist uuid;
begin
  if length(coalesce(v_reason,''))<10 then raise exception using errcode='22023',message='interpretation_confirmation_reason_required';end if;
  select*into v from public.lab_results where id=p_result_id for update;
  if not found or not private.can_write_active_care_episode(v.care_episode_id)or not v.is_latest_revision or v.record_status<>'active'then raise exception using errcode='42501',message='lab_interpretation_confirmation_forbidden';end if;
  if v.interpretation_status='confirmed'then return jsonb_build_object('id',v.id,'interpretation_status','confirmed','already_confirmed',true,'confirmed_at',v.confirmed_at);end if;
  select nutritionist_id into v_nutritionist from public.care_episodes where id=v.care_episode_id;
  update public.lab_results set interpretation_status='confirmed',confirmed_by=auth.uid(),confirmed_at=now()where id=v.id;
  insert into public.clinical_calculation_snapshots(patient_id,care_episode_id,nutritionist_id,domain,source_entity,source_id,protocol_code,protocol_version,input_snapshot,output_snapshot,professional_decision,confirmed_by,confirmed_at)
  values(v.patient_id,v.care_episode_id,v_nutritionist,'laboratory','lab_results',v.id::text,'laboratory.manual_reference',1,
    jsonb_strip_nulls(jsonb_build_object('test_name',v.test_name,'value',v.test_value,'unit',v.test_unit,'reference_min',v.reference_min,'reference_max',v.reference_max,'reference_source',v.reference_source,'reference_snapshot',v.reference_snapshot)),
    jsonb_build_object('assisted_status',v.status,'interpretation_status','confirmed'),v_reason,auth.uid(),now());
  insert into public.activity_log(event_name,occurred_at,payload,patient_id,source_module,actor_user_id)values('laboratory.interpretation.confirmed',now(),jsonb_build_object('result_id',v.id,'reason',v_reason,'assisted_status',v.status),v.patient_id,'laboratory',auth.uid());
  return jsonb_build_object('id',v.id,'interpretation_status','confirmed','confirmed_at',now());
end$$;

revoke all on function public.list_clinical_protocol_catalog(text),public.accept_clinical_protocol(text,integer,text,text),public.invalidate_anthropometry_record(bigint,text),public.revise_anthropometry_record(bigint,jsonb,text),public.create_lab_result_record(jsonb),public.revise_lab_result_record(bigint,jsonb,text),public.invalidate_lab_result_record(bigint,text),public.confirm_lab_result_interpretation(bigint,text)from public,anon,authenticated;
grant execute on function public.list_clinical_protocol_catalog(text),public.accept_clinical_protocol(text,integer,text,text),public.invalidate_anthropometry_record(bigint,text),public.revise_anthropometry_record(bigint,jsonb,text),public.create_lab_result_record(jsonb),public.revise_lab_result_record(bigint,jsonb,text),public.invalidate_lab_result_record(bigint,text),public.confirm_lab_result_interpretation(bigint,text)to authenticated,service_role;
revoke all on function private.prevent_clinical_measurement_delete(),private.prevent_clinical_snapshot_mutation(),private.capture_energy_calculation_snapshot(),private.capture_anthropometry_calculation_snapshot()from public,anon,authenticated;

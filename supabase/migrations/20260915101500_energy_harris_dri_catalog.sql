-- Additive release: preserve historical protocols and immutable calculations.
insert into public.scientific_sources
  (code,version,title,publisher,publication_year,source_url,citation,jurisdiction,retrieved_at)
values
  ('HARRIS1919',1,'A Biometric Study of Human Basal Metabolism','Harris & Benedict',1919,
   'https://pubmed.ncbi.nlm.nih.gov/16576330/',
   'Harris JA, Benedict FG. PNAS 1918;4:370-373; Carnegie monograph 1919. Clinical mobility factors: Long et al. adaptation; 1.2 bedridden / 1.3 ambulatory.',
   'Internacional','2026-09-15'),
  ('NASEM2023',1,'Dietary Reference Intakes for Energy','National Academies of Sciences, Engineering, and Medicine',2023,
   'https://www.nationalacademies.org/read/26818/chapter/7',
   'NASEM. Dietary Reference Intakes for Energy. Washington DC: National Academies Press, 2023. doi:10.17226/26818.',
   'Estados Unidos / Canadá','2026-09-15')
on conflict (code,version) do nothing;

insert into public.clinical_protocol_catalog
  (code,version,domain,name,description,implementation_key,source_code,source_version,population,required_inputs,limitations,effective_from)
values
  ('energy.harris_benedict_1919_clinical',1,'energy','Harris-Benedict (1919) — clínico',
   'GET = TMB original × mobilidade clínica (1.2 acamado / 1.3 ambulante) × injúria. Sem fator geral de exercícios.',
   'harris','HARRIS1919',1,'{"adults":true,"clinical_mobility":["bedridden","ambulatory"]}',
   '["weight_kg","height_cm","age_years","sex","clinical_mobility","injury_factor"]',
   'Adaptação clínica restrita a acamados e ambulantes. Fatores de estresse são aproximações e exigem avaliação individual; não substitui calorimetria indireta.','2026-09-15'),
  ('energy.dri_eer_2023',1,'energy','DRIs / EER (2023) — adultos',
   'GET direto por equações de sexo e categoria de atividade; não reaplicar FA, METs ou ETA.',
   'dri_2023','NASEM2023',1,'{"age_min_years":19,"pregnancy":false,"lactation":false}',
   '["weight_kg","height_cm","age_years","sex","dri_activity","life_stage"]',
   'Implementação para adultos ≥19 anos, fora de gestação e lactação. Categoria PAL requer avaliação profissional.','2026-09-15')
on conflict (code,version) do nothing;

alter table public.energy_expenditure_calculations drop constraint valid_protocol;
alter table public.energy_expenditure_calculations add constraint valid_protocol check (
  protocol is null or protocol in ('harris-benedict','mifflin-st-jeor','fao-who','fao-oms-2001',
    'schofield','owen','cunningham','tinsley','katch-mcardle','de-lorenzo','mifflin','harris',
    'fao','fao_1985','fao_2001','eer_iom','dri_2023')
);

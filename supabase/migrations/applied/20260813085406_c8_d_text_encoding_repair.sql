-- Repair UTF-8 text that was decoded as Windows-1252 by an external migration runner.
-- Structural data and identifiers are unchanged.
update public.data_retention_policy_catalog p set description=v.description,default_policy=v.default_policy,updated_at=now()
from(values
 ('clinical_record','Prontuário e atos clínicos assinados','Retenção por obrigação legal/profissional; não apagar automaticamente.'),
 ('billing_fiscal','Documentos financeiros e fiscais','Retenção conforme obrigação fiscal aplicável; validar com contabilidade.'),
 ('account_profile','Dados cadastrais e preferências','Minimizar, anonimizar ou excluir quando não houver outra base legal.'),
 ('security_audit','Trilhas de segurança e auditoria','Reter pelo prazo necessário à segurança e defesa de direitos.'),
 ('product_analytics','Telemetria minimizada de produto','Anonimizar ou excluir conforme política e consentimentos aplicáveis.')
)v(category_code,description,default_policy)where p.category_code=v.category_code;

update public.scientific_sources s set title=v.title,publisher=v.publisher,citation=v.citation
from(values
 ('TBCA',73,'Tabela Brasileira de Composição de Alimentos — versão 7.3','USP / BRASILFOODS / FoRC','TBCA. Tabela Brasileira de Composição de Alimentos, versão 7.3.'),
 ('CFN594',1,'Resolução CFN nº 594/2017 — registro em prontuário','Conselho Federal de Nutricionistas','CFN. Resolução nº 594, de 17 de dezembro de 2017.'),
 ('HARRIS1984',1,'A biometric study of basal metabolism in man — revised equations','Roza & Shizgal','Roza AM, Shizgal HM. The Harris Benedict equation reevaluated. Am J Clin Nutr. 1984.'),
 ('MIFFLIN1990',1,'A new predictive equation for resting energy expenditure','Mifflin et al.','Mifflin MD et al. Am J Clin Nutr. 1990;51:241-247.'),
 ('WHO1985',1,'Energy and protein requirements','WHO/FAO/UNU','WHO Technical Report Series 724. Energy and protein requirements. 1985.'),
 ('IOM2005',1,'Dietary Reference Intakes for Energy','Institute of Medicine','IOM. Dietary Reference Intakes for Energy. 2005.'),
 ('ANVISA429',1,'RDC nº 429/2020 e IN nº 75/2020 — rotulagem nutricional','ANVISA','ANVISA. RDC 429/2020 e IN 75/2020.'),
 ('CUNNINGHAM1980',1,'A reanalysis of the factors influencing basal metabolic rate in normal adults','Cunningham','Cunningham JJ. Am J Clin Nutr. 1980;33:2372-2374.'),
 ('TINSLEY2018',1,'Resting metabolic rate in muscular physique athletes','Tinsley et al.','Tinsley GM et al. Am J Clin Nutr. 2019;110:135-145.'),
 ('MS_SISVAN',1,'Orientações para coleta e análise de dados antropométricos','Ministério da Saúde / SISVAN','Brasil. Ministério da Saúde. Orientações para coleta e análise de dados antropométricos em serviços de saúde.'),
 ('WHO_GROWTH',1,'WHO Child Growth Standards and Growth Reference 5–19 years','World Health Organization','WHO. Child Growth Standards; Growth Reference 5–19 years.')
)v(code,version,title,publisher,citation)where(s.code,s.version)=(v.code,v.version);

update public.clinical_protocol_catalog p set name=v.name,description=v.description,limitations=v.limitations
from(values
 ('energy.harris_benedict_revised',1,'Harris-Benedict revisada','Estimativa de gasto energético basal por peso, altura, idade e sexo.','Estimativa populacional; o nutricionista deve avaliar aplicabilidade individual.'),
 ('energy.mifflin_st_jeor',1,'Mifflin-St Jeor','Estimativa de gasto energético de repouso em adultos.','Não substitui calorimetria indireta nem julgamento clínico.'),
 ('energy.fao_who_1985',1,'FAO/OMS 1985','Equações por faixa etária e sexo.','Confirmar faixa etária e contexto clínico.'),
 ('energy.eer_iom_2005',1,'EER/IOM 2005','Estimativa de necessidade energética com coeficiente de atividade.','Coeficiente de atividade precisa de avaliação profissional.'),
 ('anthropometry.bmi_adult',1,'IMC adulto','Cálculo de IMC como indicador complementar.','Não usar isoladamente para diagnóstico nutricional ou definição de meta.'),
 ('anthropometry.bmi_elderly_sisvan',1,'IMC da pessoa idosa — SISVAN','Faixas brasileiras para pessoas com 60 anos ou mais.','Exige avaliação multidimensional, composição corporal, funcionalidade e contexto clínico.'),
 ('anthropometry.pediatric_who_lms',1,'Curvas OMS pediátricas','IMC-por-idade/sexo e escore-z usando tabelas LMS completas.','Motor automático ainda restrito: não usar aproximações anuais; avaliação profissional pelas curvas completas.'),
 ('laboratory.manual_reference',1,'Referência informada pelo laudo','Interpretação assistida usando intervalo e unidade do laboratório de origem.','Intervalos variam por método, laboratório, idade, sexo e condição clínica; exige confirmação profissional.'),
 ('food.tbca_7_3',1,'TBCA 7.3','Composição de alimentos brasileiros com fonte preservada.','Valores dependem da descrição, preparação e qualidade do dado de origem.'),
 ('meal_plan.cfn_record',1,'Registro de prescrição dietética','Campos mínimos e rastreabilidade profissional do plano.','A prescrição e a decisão final são privativas do nutricionista responsável.'),
 ('energy.cunningham_1980',1,'Cunningham 1980','Estimativa baseada em massa livre de gordura.','A massa livre de gordura precisa ter origem e método avaliados; equação populacional não substitui calorimetria.'),
 ('energy.tinsley_2018',1,'Tinsley 2018 (MLG)','Equação derivada em atletas de físico muscular.','População específica; não extrapolar sem julgamento clínico.')
)v(code,version,name,description,limitations)where(p.code,p.version)=(v.code,v.version);

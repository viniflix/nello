// HUAC-UFCG MA.UMULTI.007 v1 (21/02/2024), page 22, tables 16 and 17.
// Named hospital contexts, not automatic multipliers for any diagnosis.
export const INJURY_CATALOG_VERSION = 2;
export const CLINICAL_FACTOR_REFERENCE = {
  title: 'HUAC-UFCG — MA.UMULTI.007, versão 1, 21/02/2024, página 22, tabelas 16–17',
  url: 'https://www.gov.br/hubrasil/pt-br/hospitais-universitarios/regiao-nordeste/huac-ufcg/acesso-a-informacao/gestao-documental/manual/gerencia-de-atencao-a-saude-gas/divisao-de-gestao-do-cuidado-e-apoio-diagnostico-e-terapeutico-dcdt/unidade-multiprofissional-umulti/ma-umulti-007-manual-de-cuidado-nutricional-para-adultos-e-idosos-hospitalizados.pdf',
  scope: 'adult_hospital_protocol_individual_review_required',
  issuedAt: '2024-02-21', scheduledReviewAt: '2026-02-21',
  thermalFactorIncluded: false,
  limitation: 'Estimativa por protocolo hospitalar. Não determina, sozinha, o aporte a prescrever nem o manejo de pacientes críticos ou com risco de realimentação.',
};
export const CLINICAL_MOBILITY_FACTORS = { bedridden: 1.2, ambulatory: 1.3, bedridden_ventilated: 1.1, bedridden_mobile: 1.25 };
export const INJURY_FACTORS = [
  { id: 'none', label: 'Sem complicação / pós-operatório sem complicação', value: 1 },
  { id: 'postoperative_cancer', label: 'Pós-operatório de câncer', value: 1.1 },
  { id: 'fractures', label: 'Fraturas', value: 1.33 },
  { id: 'trauma_infection', label: 'Trauma com infecção', value: 1.79 },
  { id: 'peritonitis', label: 'Peritonite', value: 1.4 },
  { id: 'multitrauma_rehabilitation', label: 'Multitrauma em reabilitação', value: 1.5 },
  { id: 'multitrauma_sepsis', label: 'Multitrauma com sepse', value: 1.6 },
  { id: 'burn_30_50', label: 'Queimadura: extensão de 30–50%', value: 1.7 },
  { id: 'burn_50_70', label: 'Queimadura: extensão de 50–70%', value: 1.8 },
  { id: 'burn_70_90', label: 'Queimadura: extensão de 70–90%', value: 2 },
];
export const getInjuryFactorValue = id => INJURY_FACTORS.find(item => item.id === id)?.value ?? null;
export const PAL_REFERENCE = Object.freeze({title:'FAO/WHO/UNU 2004, PAL da rotina de 24 horas, tabela 5.3',url:'https://www.fao.org/4/y5686e/y5686e07.htm',selection:'individual_professional_assessment'});

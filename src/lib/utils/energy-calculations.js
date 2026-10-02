/**
 * Motor de Cálculos Energéticos - Nello
 * 
 * Este módulo contém as principais fórmulas para cálculo de Taxa Metabólica Basal (BMR)
 * e Gasto Energético Total (GET), seguindo protocolos científicos reconhecidos.
 * 
 * @module energy-calculations
 */

import { calculateDri2023, driPaCoefficient, validEnergyBiometry, normalizeEnergySex } from './dri-energy';
import { parseFiniteEnergyNumber } from './energy-numbers';
import { energyFormulaTrace } from '../../../supabase/functions/_shared/clinical-energy.js';
import { decimalFraction, exactOperation, fractionNumber } from '../../../supabase/functions/_shared/clinical-arithmetic.js';
export { HARRIS_1919 } from '../../../supabase/functions/_shared/clinical-energy.js';

// ============================================================================
// PROTOCOLOS DE CÁLCULO DE BMR (Basal Metabolic Rate)
// ============================================================================

/**
 * 1. Harris-Benedict (Original 1919)
 * Padrão clássico, muito utilizado no Brasil.
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'male' ou 'female'
 * @returns {number} BMR em kcal/dia
 */
export const calculateHarrisBenedict = (weight, height, age, gender) => {
  return energyFormulaTrace('harris', { weight, height, age, gender })?.resultKcal ?? null;
};

/**
 * 2. Mifflin-St Jeor (1990)
 * Padrão Ouro atual para obesidade e população clínica.
 * Mais preciso que Harris-Benedict para indivíduos com sobrepeso.
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'male' ou 'female'
 * @returns {number} BMR em kcal/dia
 */
export const calculateMifflinStJeor = (weight, height, age, gender) => {
  return energyFormulaTrace('mifflin', { weight, height, age, gender })?.resultKcal ?? null;
};

/**
 * 3. Cunningham (1980)
 * Baseado em Massa Livre de Gordura (FFM - Fat-Free Mass).
 * Melhores para ATLETAS e indivíduos com alta massa magra.
 * Requer input de Massa Magra (kg).
 * 
 * @param {number} leanMassKg - Massa magra em kg
 * @returns {number|null} BMR em kcal/dia, ou null se leanMassKg não fornecido
 */
export const calculateCunningham = (leanMassKg) => {
  const lMass = parseFiniteEnergyNumber(leanMassKg);
  if (lMass == null || lMass <= 0 || lMass > 300) return null;
  return fractionNumber(exactOperation('add',[decimalFraction(500), exactOperation('multiply',[decimalFraction(22),decimalFraction(lMass)])]));
};

/**
 * 4. Tinsley (Atletas de Força/Fisiculturismo)
 * Específico para atletas de força e fisiculturistas.
 * Requer massa magra.
 * 
 * @param {number} weight - Peso total em kg
 * @param {number} leanMassKg - Massa magra em kg
 * @returns {number|null} BMR em kcal/dia, ou null se leanMassKg não fornecido
 */
export const calculateTinsley = (weight, leanMassKg) => {
  const totalWeight = parseFiniteEnergyNumber(weight);
  const lMass = parseFiniteEnergyNumber(leanMassKg);
  if (totalWeight == null || totalWeight <= 0 || lMass == null || lMass <= 0 || lMass > totalWeight) return null;
  return fractionNumber(exactOperation('add',[decimalFraction(284), exactOperation('multiply',[decimalFraction(25.9),decimalFraction(lMass)])]));
};

/**
 * 5. FAO/WHO (Organização Mundial da Saúde) - versão simplificada (adultos 18-60)
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'M' ou 'F'
 * @returns {number} BMR em kcal/dia
 */
export const calculateFaoWho = (weight, height, age, gender) => {
  const w = parseFloat(weight);
  if (isNaN(w) || w <= 0) return null;
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  return isMale ? (15.3 * w) + 679 : (14.7 * w) + 496;
};

/**
 * 6. FAO/OMS 1985 - Equações por faixa etária e sexo (WHO/FAO/UNU 1985)
 * Faixas: 18-30, 30-60, >60 anos.
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'M' ou 'F'
 * @returns {number} BMR em kcal/dia
 */
export const calculateFaoOms1985 = (weight, height, age, gender) => {
  return energyFormulaTrace('fao_1985', { weight, height, age, gender })?.resultKcal ?? null;
};

/**
 * 7. FAO/OMS 2001 - Equações por faixa etária e sexo (WHO/FAO/UNU 2001)
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'M' ou 'F'
 * @returns {number} BMR em kcal/dia
 */
export const calculateFaoOms2001 = (weight, height, age, gender) => {
  const w = parseFloat(weight);
  const h = parseFloat(height);
  const a = parseFloat(age);
  if (isNaN(w) || isNaN(h) || isNaN(a) || w <= 0 || h <= 0 || a <= 0) return null;
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  if (isMale) {
    if (a >= 18 && a < 30) return 15.4 * w - 27 * (h / 100) + 717;
    if (a >= 30 && a < 60) return 11.3 * w + 16 * (h / 100) + 901;
    return 8.8 * w + 1128 * (h / 100) - 1071; // >60
  }
  if (a >= 18 && a < 30) return 13.3 * w + 334 * (h / 100) + 35;
  if (a >= 30 && a < 60) return 8.7 * w - 25 * (h / 100) + 865;
  return 9.2 * w + 637 * (h / 100) - 302; // >60
};

/**
 * Coeficientes de atividade física (PA) para EER/IOM.
 * Homem: Sedentário 1.0, Pouco ativo 1.11, Ativo 1.25, Muito ativo 1.48
 * Mulher: 1.0, 1.12, 1.27, 1.45
 */
export const EER_PA_COEFFICIENTS = {
  male: { 1.0: 'Sedentário', 1.11: 'Pouco ativo', 1.25: 'Ativo', 1.48: 'Muito ativo' },
  female: { 1.0: 'Sedentário', 1.12: 'Pouco ativo', 1.27: 'Ativo', 1.45: 'Muito ativo' }
};

/**
 * 8. EER/IOM (2005) - Estimated Energy Requirement (GET direto, não TMB×FA)
 * Fórmula base Homem: 662 - (9.53×Idade) + PA×[(15.91×Peso) + (539.6×Altura_m)]
 * Mulher: 354 - (6.91×Idade) + PA×[(9.36×Peso) + (726×Altura_m)]
 * PA = Physical Activity coefficient (1.0, 1.11/1.12, 1.25/1.27, 1.48/1.45)
 * @param {number} weight - Peso em kg
 * @param {number} heightCm - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'M' ou 'F'
 * @param {number} paCoefficient - Coeficiente PA (1.0, 1.11 ou 1.12, 1.25 ou 1.27, 1.48 ou 1.45)
 * @returns {number} GET em kcal/dia (não TMB)
 */
export const calculateEerIom = (weight, heightCm, age, paCoefficient, gender) => {
  if (!validEnergyBiometry({ weight, height: heightCm, age, gender }, 19)) return null;
  const pa = parseFiniteEnergyNumber(paCoefficient);
  const sex = normalizeEnergySex(gender);
  const index = (sex === 'male' ? [1, 1.11, 1.25, 1.48] : [1, 1.12, 1.27, 1.45]).indexOf(pa);
  if (index < 0) return null;
  return energyFormulaTrace('eer_iom', { weight, height: heightCm, age, gender,
    driActivity: ['inactive', 'low_active', 'active', 'very_active'][index] })?.resultKcal ?? null;
};

/**
 * Mapeia fator de atividade (NAF) para coeficiente PA do EER (aproximado).
 * NAF 1.2 -> 1.0, 1.375 -> 1.11/1.12, 1.55 -> 1.25/1.27, 1.725 -> 1.48/1.45, 1.9 -> 1.48/1.45
 */
export const activityFactorToEerPa = (activityFactor, gender) => {
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  if (activityFactor <= 1.2) return isMale ? 1.0 : 1.0;
  if (activityFactor <= 1.375) return isMale ? 1.11 : 1.12;
  if (activityFactor <= 1.55) return isMale ? 1.25 : 1.27;
  return isMale ? 1.48 : 1.45; // 1.725 e 1.9
};

// ============================================================================
// FATORES DE ATIVIDADE FÍSICA (Nível de Atividade Física - NAF)
// ============================================================================

/**
 * Fatores de atividade física para cálculo do GET (Gasto Energético Total)
 * GET = BMR × Fator de Atividade
 */
export const ACTIVITY_FACTORS = [
  { value: 1.4, label: 'Rotina leve', desc: 'PAL 1,40–1,69; ponto inicial 1,40', short: 'Leve' },
  { value: 1.7, label: 'Rotina moderada', desc: 'PAL 1,70–1,99; ponto inicial 1,70', short: 'Moderada' },
  { value: 2, label: 'Rotina vigorosa', desc: 'PAL 2,00–2,40; ponto inicial 2,00', short: 'Vigorosa' },
];
export const PAL_REFERENCE = 'https://www.fao.org/4/y5686e/y5686e07.htm';


/**
 * Calcula o Gasto Energético Total (GET) a partir do BMR e fator de atividade
 * GET = TMB × Fator de Atividade × Fator de Injúria (opcional)
 *
 * @param {number} bmr - Taxa Metabólica Basal em kcal/dia
 * @param {number} activityFactor - Fator de atividade (ex: 1.55)
 * @param {number} [injuryFactor=1.0] - Fator de estresse clínico/injúria (1.0 a 2.0)
 * @returns {number} GET em kcal/dia
 */
export const calculateGET = (bmr, activityFactor, injuryFactor = 1.0) => {
  const b = parseFiniteEnergyNumber(bmr);
  const af = parseFiniteEnergyNumber(activityFactor);
  const inj = parseFiniteEnergyNumber(injuryFactor);
  if (![b, af, inj].every(Number.isFinite) || b <= 0 || af <= 0 || inj <= 0) return null;
  const result = fractionNumber(exactOperation('multiply',[exactOperation('multiply',[decimalFraction(b),decimalFraction(af)]),decimalFraction(inj)]));
  return Number.isFinite(result) ? result : null;
};

// ============================================================================
// GASTO COM EXERCÍCIO (METs)
// ============================================================================

/**
 * Calcula kcal gastas em uma atividade (METs).
 * Fórmula: Kcal = MET × Peso (kg) × (Duração em minutos / 60)
 *
 * @param {number} met - Valor MET da atividade
 * @param {number} weightKg - Peso em kg
 * @param {number} durationMin - Duração em minutos
 * @returns {number} Kcal gastas na atividade
 */
export const calculateMetKcal = (met, weightKg, durationMin) => {
  const m=parseFiniteEnergyNumber(met),w=parseFiniteEnergyNumber(weightKg),duration=parseFiniteEnergyNumber(durationMin);
  if(m==null || w==null || duration==null || m<=0 || m>100 || w<1 || w>300 || duration<=0 || duration>1440) return 0;
  return fractionNumber(exactOperation('divide',[exactOperation('multiply',[exactOperation('multiply',[decimalFraction(m),decimalFraction(w)]),decimalFraction(duration)]),decimalFraction(60)]));
};

/**
 * Gasto por sessão e média diária conforme frequência (diária, semanal, mensal).
 * Kcal por Sessão = MET × Peso × (Duração_min / 60).
 * Média diária: daily = sessão × freqValue; weekly = (sessão × freqValue) / 7; monthly = (sessão × freqValue) / 30.
 *
 * @param {number} met - Valor MET
 * @param {number} weightKg - Peso em kg
 * @param {number} durationMin - Duração em minutos
 * @param {number} freqValue - Número de vezes (por dia/semana/mês)
 * @param {string} freqType - 'daily' | 'weekly' | 'monthly'
 * @returns {{ kcalPerSession: number, averageDailyKcal: number }}
 */
export const calculateActivityExpenditure = (met, weightKg, durationMin, freqValue, freqType) => {
  const kcalPerSession = calculateMetKcal(met, weightKg, durationMin);
  const parsedFrequency = parseFiniteEnergyNumber(freqValue);
  const freq = parsedFrequency != null && parsedFrequency > 0 ? parsedFrequency : 0;
  let averageDailyKcal = 0;
  switch (String(freqType || 'weekly').toLowerCase()) {
    case 'daily':
      averageDailyKcal = fractionNumber(exactOperation('multiply',[decimalFraction(kcalPerSession),decimalFraction(freq)]));
      break;
    case 'weekly':
      averageDailyKcal = freq > 0 ? fractionNumber(exactOperation('divide',[exactOperation('multiply',[decimalFraction(kcalPerSession),decimalFraction(freq)]),decimalFraction(7)])) : 0;
      break;
    case 'monthly':
      averageDailyKcal = freq > 0 ? fractionNumber(exactOperation('divide',[exactOperation('multiply',[decimalFraction(kcalPerSession),decimalFraction(freq)]),decimalFraction(30)])) : 0;
      break;
    default:
      averageDailyKcal = freq > 0 ? fractionNumber(exactOperation('divide',[exactOperation('multiply',[decimalFraction(kcalPerSession),decimalFraction(freq)]),decimalFraction(7)])) : 0;
  }
  return { kcalPerSession, averageDailyKcal };
};

/**
 * Calcula a soma de kcal de um array de atividades MET (formato legado: sem frequência).
 * Cada item: { name, met, duration_min } (kcal pode ser preenchido ou calculado).
 *
 * @param {Array<{name: string, met: number, duration_min: number, kcal?: number}>} activities - Lista de atividades
 * @param {number} weightKg - Peso em kg do paciente
 * @returns {{ totalKcal: number, items: Array<{...}&{kcal: number}> }}
 */
export const sumMetsActivitiesKcal = (activities, weightKg) => {
  if (!Array.isArray(activities) || !weightKg) return { totalKcal: 0, items: [] };
  const items = activities.map((a) => {
    const kcal = calculateMetKcal(a.met, weightKg, a.duration_min || 0);
    return { ...a, kcal };
  });
  const totalKcal = items.reduce((acc, i) => acc + (i.kcal || 0), 0);
  return { totalKcal, items };
};

/**
 * Soma o gasto médio diário de atividades no novo formato (frequency_type, frequency_value).
 * Cada item pode ter: average_daily_kcal (já calculado) ou será calculado com calculateActivityExpenditure.
 *
 * @param {Array<{met: number, duration_min: number, frequency_value?: number, frequency_type?: string, kcal_per_session?: number, average_daily_kcal?: number}>} activities
 * @param {number} weightKg - Peso em kg
 * @returns {{ totalAverageDailyKcal: number, items: Array<{...}&{kcal_per_session: number, average_daily_kcal: number}> }}
 */
export const sumMetsActivitiesAverageDaily = (activities, weightKg) => {
  if (!Array.isArray(activities) || !weightKg) return { totalAverageDailyKcal: 0, items: [] };
  const items = activities.map((a) => {
    const freqType = a.frequency_type ?? 'daily';
    const freqValue = a.frequency_value ?? (a.frequency_type == null ? 1 : 0);
    const { kcalPerSession, averageDailyKcal } = calculateActivityExpenditure(
      a.met,
      weightKg,
      a.duration_min ?? 0,
      freqValue,
      freqType
    );
    const avgDaily = averageDailyKcal;
    return { ...a, kcal_per_session: kcalPerSession, average_daily_kcal: avgDaily };
  });
  const totalAverageDailyKcal = items.reduce((acc, i) => acc + (i.average_daily_kcal || 0), 0);
  return { totalAverageDailyKcal, items };
};

// ============================================================================
// VENTA - Planejamento de Peso (déficit/superávit em prazo)
// ============================================================================

/**
 * Efeito Térmico dos Alimentos (ETA) - ~10% da TMB (opcional).
 * @param {number} tmbKcal - Taxa Metabólica Basal em kcal/dia
 * @returns {number} ETA em kcal/dia
 */
export const calculateETA = (tmbKcal) => {
  if (tmbKcal == null || tmbKcal <= 0) return 0;
  return tmbKcal * 0.1;
};

/** 7700 kcal ≈ 1 kg de tecido adiposo (déficit/superávit total para 1 kg) */
export const KCAL_PER_KG_BODY_CHANGE = 7700;

/**
 * Calcula o ajuste calórico diário (VENTA) para atingir peso alvo em N dias.
 * Kcal Totais da Meta = (Peso Atual - Peso Alvo) × 7700 (positivo = déficit, negativo = superávit).
 * Ajuste Diário = Kcal Totais / Dias.
 * Para perder peso: subtrai do GET; para ganhar: soma ao GET.
 *
 * @param {number} currentWeightKg - Peso atual em kg
 * @param {number} targetWeightKg - Peso alvo em kg
 * @param {number} timeframeDays - Prazo em dias
 * @returns {{ totalKcal: number, dailyAdjustmentKcal: number, isDeficit: boolean } | null} null se dados inválidos
 */
export const calculateVentaAdjustment = (currentWeightKg, targetWeightKg, timeframeDays) => {
  const cw = parseFiniteEnergyNumber(currentWeightKg);
  const tw = parseFiniteEnergyNumber(targetWeightKg);
  const td = parseFiniteEnergyNumber(timeframeDays);
  if (cw == null || cw < 1 || cw > 300 || tw == null || tw < 1 || tw > 300 || td == null || !Number.isInteger(td) || td <= 0) {
    return null;
  }
  const totalKcal = (cw - tw) * KCAL_PER_KG_BODY_CHANGE;
  const dailyAdjustmentKcal = totalKcal / td;
  const isDeficit = totalKcal > 0;
  return { totalKcal, dailyAdjustmentKcal, isDeficit };
};

/**
 * Calcula a meta calórica final (VET) aplicando o ajuste VENTA ao GET.
 * Se déficit (perder peso): VET = GET - |ajuste|.
 * Se superávit (ganhar peso): VET = GET + ajuste.
 *
 * @param {number} getKcal - Gasto energético total (GET) em kcal/dia
 * @param {number} ventaDailyAdjustmentKcal - Ajuste diário VENTA (positivo = déficit, negativo = superávit)
 * @returns {number} Meta calórica final (VET) em kcal/dia
 */
export const applyVentaToGet = (getKcal, ventaDailyAdjustmentKcal) => {
  const gk = parseFiniteEnergyNumber(getKcal);
  const adj = parseFiniteEnergyNumber(ventaDailyAdjustmentKcal);
  if (gk == null || gk <= 0 || adj == null) return null;
  const planned = gk - adj; // déficit (adj > 0) reduz; superávit (adj < 0) aumenta
  return Number.isFinite(planned) ? planned : null;
};

// ============================================================================
// FUNÇÃO MESTRA: Calcula Todos os Protocolos
// ============================================================================

/**
 * Calcula BMR usando todos os protocolos disponíveis
 * Retorna array com resultados de cada protocolo
 * 
 * @param {Object} data - Dados do paciente
 * @param {number} data.weight - Peso em kg
 * @param {number} data.height - Altura em cm
 * @param {number} data.age - Idade em anos
 * @param {string} data.gender - 'male' ou 'female'
 * @param {number} [data.leanMass] - Massa magra em kg (opcional, para protocolos de atleta)
 * @returns {Array} Array de objetos com informações de cada protocolo
 */
export const calculateAllProtocols = (data) => {
  const { weight, height, age, gender } = data;
  
  // Validação básica
  if (!validEnergyBiometry(data)) {
    return [];
  }

  const heightNum = Number(height) || 0;
  const protocols = [
    {
      id: 'harris',
      name: 'Harris-Benedict (1919)',
      description: 'Uso clínico: pacientes acamados ou ambulantes e fator de injúria.',
      bmr: calculateHarrisBenedict(weight, height, age, gender),
      category: 'general'
    },
    {
      id: 'mifflin',
      name: 'Mifflin-St Jeor',
      description: 'Estimativa para adultos; avalie a aplicabilidade individual.',
      bmr: calculateMifflinStJeor(weight, height, age, gender),
      category: 'clinical'
    },
    {
      id: 'fao_1985',
      name: 'FAO/OMS',
      description: 'Equações por faixa etária (18-30, 30-60, >60) e sexo.',
      bmr: calculateFaoOms1985(weight, height, age, gender),
      category: 'general'
    },
    {
      id: 'cunningham', name: 'Cunningham (1980)',
      description: 'Estimativa por massa magra medida; requer avaliação de aplicabilidade para atletas.',
      bmr: energyFormulaTrace('cunningham', data)?.resultKcal ?? null, category: 'athlete'
    },
    {
      id: 'tinsley', name: 'Tinsley (2018)',
      description: 'Estimativa por massa magra medida; requer avaliação de aplicabilidade para atletas.',
      bmr: energyFormulaTrace('tinsley', data)?.resultKcal ?? null, category: 'athlete'
    },
    {
      id: 'eer_iom',
      name: 'DRIs / EER-IOM (2005)',
      description: 'GET direto (não usa TMB×FA). Inclui coeficiente de atividade.',
      isEer: true,
      bmr: null,
      get: Number(age) >= 19 ? calculateEerIom(weight, heightNum, age, driPaCoefficient(data.driActivity, gender), gender) : null,
      category: 'clinical'
    },
    {
      id: 'dri_2023', name: 'DRIs / EER (2023)',
      description: 'Necessidade energética de adultos ≥19 anos. Atividade incluída na equação.',
      isEer: true, bmr: null,
      get: calculateDri2023(data, data.driActivity),
      category: 'general'
    }
  ];

  return protocols;
};

/**
 * Calcula BMR usando um protocolo específico
 * 
 * @param {string} protocolId - ID do protocolo ('harris', 'mifflin', 'fao', 'cunningham', 'tinsley')
 * @param {Object} data - Dados do paciente
 * @returns {number|null} BMR em kcal/dia, ou null se dados insuficientes
 */
export const calculateBMRByProtocol = (protocolId, data) => {
  const { weight, height, age, gender } = data;
  switch (protocolId) {
    case 'harris':
      return calculateHarrisBenedict(weight, height, age, gender);
    case 'mifflin':
      return calculateMifflinStJeor(weight, height, age, gender);
    case 'fao_1985':
      return calculateFaoOms1985(weight, height, age, gender);
    case 'eer_iom':
      return null; // EER retorna GET, não TMB
    default:
      return null;
  }
};

/**
 * Obtém informações sobre um protocolo específico
 * 
 * @param {string} protocolId - ID do protocolo
 * @returns {Object|null} Informações do protocolo ou null se não encontrado
 */
export const getProtocolInfo = (protocolId) => {
  const protocols = {
    harris: {
      id: 'harris',
      name: 'Harris-Benedict (1919)',
      description: 'Uso clínico: acamado ou ambulante, com fator de injúria.',
      category: 'general',
      requiresLeanMass: false
    },
    mifflin: {
      id: 'mifflin',
      name: 'Mifflin-St Jeor',
      description: 'Estimativa para adultos; avalie a aplicabilidade individual.',
      category: 'clinical',
      requiresLeanMass: false,
    },
    fao_1985: {
      id: 'fao_1985',
      name: 'FAO/OMS',
      description: 'Por faixa etária e sexo.',
      category: 'general',
      requiresLeanMass: false
    },
    eer_iom: {
      id: 'eer_iom',
      name: 'DRIs / EER-IOM (2005)',
      description: 'GET direto (Estimated Energy Requirement).',
      category: 'clinical',
      requiresLeanMass: false,
      isEer: true
    },
    dri_2023: {
      id: 'dri_2023', name: 'DRIs / EER (2023)',
      description: 'GET direto por categoria de atividade para adultos ≥19 anos.',
      category: 'general', requiresLeanMass: false, isEer: true
    }
  };

  return protocols[protocolId] || null;
};

// ============================================================================
// TRANSPARENCY: Formula Breakdown Generator
// ============================================================================

/**
 * Gera um breakdown detalhado de como uma fórmula foi calculada
 * Retorna informações para exibição em tooltips de transparência
 * 
 * @param {string} method - ID do método ('harris', 'mifflin', 'cunningham', 'tinsley', 'fao')
 * @param {Object} data - Dados do paciente
 * @param {number} data.weight - Peso em kg
 * @param {number} data.height - Altura em cm
 * @param {number} data.age - Idade em anos
 * @param {string} data.gender - 'male' ou 'female'
 * @param {number} [data.leanMass] - Massa magra em kg (opcional)
 * @returns {Object|null} Objeto com breakdown da fórmula ou null se dados insuficientes
 */
export const getFormulaBreakdown = (method, data) => {
  if (!['fao', 'fao_2001'].includes(method)) return energyFormulaTrace(method, data);
  // Retained historical methods are never offered for new calculations.
  const { weight, height, age, gender } = data;
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  switch (method) {
    case 'fao': {
      if (!weight || !gender) return null;
      const weightCoeff = isMale ? 15.3 : 14.7;
      const constant = isMale ? 679 : 496;
      const weightTerm = weightCoeff * weight;
      const result = weightTerm + constant;
      return {
        formulaName: `FAO/WHO (${isMale ? 'Masculino' : 'Feminino'})`,
        equationStr: isMale ? '(15.3 × P) + 679' : '(14.7 × P) + 496',
        appliedStr: `(${weightCoeff} × ${weight}) + ${constant}`,
        steps: [
          { label: 'Peso', value: `${weightCoeff} × ${weight} = ${weightTerm.toFixed(2)}` },
          { label: 'Constante', value: constant.toString() },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    case 'fao_2001': {
      if (!weight || !height || !age || !gender) return null;
      const result = calculateFaoOms2001(weight, height, age, gender);
      const band = age < 30 ? '18-30' : age < 60 ? '30-60' : '>60';
      return {
        formulaName: `FAO/OMS 2001 (${isMale ? 'M' : 'F'}, ${band} anos)`,
        equationStr: 'Equações WHO/FAO/UNU 2001',
        appliedStr: `Faixa ${band}`,
        steps: [{ label: 'TMB', value: `${result.toFixed(0)} kcal` }],
        baseData: { weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    default: return null;
  }
};

/**
 * Gera breakdown do cálculo GET (Gasto Energético Total)
 * 
 * @param {number} bmr - Taxa Metabólica Basal em kcal
 * @param {number} activityFactor - Fator de atividade
 * @param {string} activityLabel - Label do nível de atividade (opcional)
 * @returns {Object} Objeto com breakdown do GET
 */
export const getGETBreakdown = (bmr, activityFactor, activityLabel = null) => {
  if (!bmr || !activityFactor) return null;

  const get = calculateGET(bmr,activityFactor);
  if(get == null) return null;
  const activityInfo = ACTIVITY_FACTORS.find(f => f.value === activityFactor);

  return {
    formulaName: 'Gasto Energético Total (GET)',
    equationStr: 'TMB × NAF',
    appliedStr: `${bmr} × ${activityFactor} = ${get}`,
    steps: [
      { label: 'Taxa Metabólica Basal (TMB)', value: `${Math.round(bmr)} kcal` },
      { label: 'Nível de Atividade (NAF)', value: `${activityFactor}${activityLabel ? ` (${activityLabel})` : ''}` },
      { label: 'GET', value: `${Math.round(get)} kcal/dia` }
    ],
    baseData: { bmr, activityFactor, activityLabel: activityLabel || activityInfo?.label || 'N/A' }
  };
};

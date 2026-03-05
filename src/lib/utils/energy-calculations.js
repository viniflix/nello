/**
 * Motor de Cálculos Energéticos - HipoZero
 * 
 * Este módulo contém as principais fórmulas para cálculo de Taxa Metabólica Basal (BMR)
 * e Gasto Energético Total (GET), seguindo protocolos científicos reconhecidos.
 * 
 * @module energy-calculations
 */

// ============================================================================
// PROTOCOLOS DE CÁLCULO DE BMR (Basal Metabolic Rate)
// ============================================================================

/**
 * 1. Harris-Benedict (Original 1919 - Revisada 1984)
 * Bom para população geral, tende a superestimar levemente.
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'male' ou 'female'
 * @returns {number} BMR em kcal/dia
 */
export const calculateHarrisBenedict = (weight, height, age, gender) => {
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  return isMale
    ? 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
    : 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
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
  const s = /^(male|masculino|m)$/i.test(String(gender || '').trim()) ? 5 : -161;
  return (10 * weight) + (6.25 * height) - (5 * age) + s;
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
  if (!leanMassKg || leanMassKg <= 0) return null;
  return 500 + (22 * leanMassKg);
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
  if (!leanMassKg || leanMassKg <= 0) return null;
  return 259 + (25.9 * leanMassKg);
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
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  return isMale ? (15.3 * weight) + 679 : (14.7 * weight) + 496;
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
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  if (isMale) {
    if (age >= 18 && age < 30) return 15.3 * weight + 679;
    if (age >= 30 && age < 60) return 11.6 * weight + 879;
    return 13.5 * weight + 487; // >60
  }
  if (age >= 18 && age < 30) return 14.7 * weight + 496;
  if (age >= 30 && age < 60) return 8.7 * weight + 829;
  return 10.5 * weight + 596; // >60
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
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  if (isMale) {
    if (age >= 18 && age < 30) return 15.4 * weight - 27 * (height / 100) + 717;
    if (age >= 30 && age < 60) return 11.3 * weight + 16 * (height / 100) + 901;
    return 8.8 * weight + 1128 * (height / 100) - 1071; // >60
  }
  if (age >= 18 && age < 30) return 13.3 * weight + 334 * (height / 100) + 35;
  if (age >= 30 && age < 60) return 8.7 * weight - 25 * (height / 100) + 865;
  return 9.2 * weight + 637 * (height / 100) - 302; // >60
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
  const heightM = (heightCm || 0) / 100;
  const pa = typeof paCoefficient === 'number' && paCoefficient > 0 ? paCoefficient : 1.0;
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());
  if (isMale) {
    return 662 - (9.53 * age) + pa * ((15.91 * weight) + (539.6 * heightM));
  }
  return 354 - (6.91 * age) + pa * ((9.36 * weight) + (726 * heightM));
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
  { 
    value: 1.2, 
    label: 'Sedentário', 
    desc: 'Pouco ou nenhum exercício',
    short: 'Sedentário'
  },
  { 
    value: 1.375, 
    label: 'Levemente Ativo', 
    desc: 'Exercício leve 1-3 dias/semana',
    short: 'Leve'
  },
  { 
    value: 1.55, 
    label: 'Moderadamente Ativo', 
    desc: 'Exercício moderado 3-5 dias/semana',
    short: 'Moderado'
  },
  { 
    value: 1.725, 
    label: 'Muito Ativo', 
    desc: 'Exercício pesado 6-7 dias/semana',
    short: 'Muito Ativo'
  },
  { 
    value: 1.9, 
    label: 'Extremamente Ativo', 
    desc: 'Trabalho físico pesado ou treino 2x ao dia',
    short: 'Extremo'
  },
];

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
  if (!bmr || bmr <= 0 || !activityFactor || activityFactor <= 0) return 0;
  const inj = typeof injuryFactor === 'number' && injuryFactor > 0 ? injuryFactor : 1.0;
  return bmr * activityFactor * inj;
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
  if (!met || !weightKg || !durationMin || durationMin <= 0) return 0;
  return met * weightKg * (durationMin / 60);
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
  const freq = Math.max(0, Number(freqValue) || 0);
  let averageDailyKcal = 0;
  switch (String(freqType || 'weekly').toLowerCase()) {
    case 'daily':
      averageDailyKcal = kcalPerSession * freq;
      break;
    case 'weekly':
      averageDailyKcal = freq > 0 ? (kcalPerSession * freq) / 7 : 0;
      break;
    case 'monthly':
      averageDailyKcal = freq > 0 ? (kcalPerSession * freq) / 30 : 0;
      break;
    default:
      averageDailyKcal = freq > 0 ? (kcalPerSession * freq) / 7 : 0;
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
    const kcal = a.kcal != null ? a.kcal : calculateMetKcal(a.met, weightKg, a.duration_min || 0);
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
    if (a.average_daily_kcal != null && a.kcal_per_session != null) {
      return { ...a, kcal_per_session: a.kcal_per_session, average_daily_kcal: a.average_daily_kcal };
    }
    const freqType = a.frequency_type ?? 'weekly';
    const freqValue = a.frequency_value ?? 0;
    const { kcalPerSession, averageDailyKcal } = calculateActivityExpenditure(
      a.met,
      weightKg,
      a.duration_min ?? 0,
      freqValue,
      freqType
    );
    const avgDaily = (freqType && freqValue > 0) ? averageDailyKcal : kcalPerSession;
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
  if (
    currentWeightKg == null ||
    targetWeightKg == null ||
    timeframeDays == null ||
    timeframeDays <= 0
  ) {
    return null;
  }
  const totalKcal = (currentWeightKg - targetWeightKg) * KCAL_PER_KG_BODY_CHANGE;
  const dailyAdjustmentKcal = totalKcal / timeframeDays;
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
  if (getKcal == null || getKcal <= 0) return getKcal;
  const adj = ventaDailyAdjustmentKcal ?? 0;
  return getKcal - adj; // déficit (adj > 0) reduz; superávit (adj < 0) aumenta
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
  const { weight, height, age, gender, leanMass } = data;
  
  // Validação básica
  if (!weight || !height || !age || !gender) {
    return [];
  }

  const heightNum = Number(height) || 0;
  const protocols = [
    {
      id: 'harris',
      name: 'Harris-Benedict (1984)',
      description: 'Clássico. Bom para população geral.',
      bmr: calculateHarrisBenedict(weight, height, age, gender),
      category: 'general'
    },
    {
      id: 'mifflin',
      name: 'Mifflin-St Jeor',
      description: 'Padrão ouro clínico. Mais preciso para sobrepeso.',
      recommended: true,
      bmr: calculateMifflinStJeor(weight, height, age, gender),
      category: 'clinical'
    },
    {
      id: 'fao',
      name: 'FAO/WHO (simplificado)',
      description: 'Padrão OMS simplificado (adultos 18-60).',
      bmr: calculateFaoWho(weight, height, age, gender),
      category: 'general'
    },
    {
      id: 'fao_1985',
      name: 'FAO/OMS 1985',
      description: 'Equações por faixa etária (18-30, 30-60, >60) e sexo.',
      bmr: calculateFaoOms1985(weight, height, age, gender),
      category: 'general'
    },
    {
      id: 'fao_2001',
      name: 'FAO/OMS 2001',
      description: 'Equações WHO/FAO/UNU 2001 por faixa etária e sexo.',
      bmr: calculateFaoOms2001(weight, height, age, gender),
      category: 'general'
    },
    {
      id: 'eer_iom',
      name: 'EER/IOM (2005)',
      description: 'GET direto (não usa TMB×FA). Inclui coeficiente de atividade.',
      isEer: true,
      bmr: null,
      get: calculateEerIom(weight, heightNum, age, 1.25, gender),
      category: 'clinical'
    }
  ];

  // Adiciona protocolos de atleta APENAS se tiver massa magra
  if (leanMass && leanMass > 0) {
    const cunninghamBmr = calculateCunningham(leanMass);
    const tinsleyBmr = calculateTinsley(weight, leanMass);
    
    if (cunninghamBmr !== null) {
      protocols.push({ 
        id: 'cunningham', 
        name: 'Cunningham (Atletas)', 
        description: 'Baseado na Massa Magra. Ideal para alta performance.',
        bmr: cunninghamBmr,
        category: 'athlete'
      });
    }
    
    if (tinsleyBmr !== null) {
      protocols.push({ 
        id: 'tinsley', 
        name: 'Tinsley (Bodybuilding)', 
        description: 'Específico para treinamento de força.',
        bmr: tinsleyBmr,
        category: 'athlete'
      });
    }
  }

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
  const { weight, height, age, gender, leanMass } = data;
  switch (protocolId) {
    case 'harris':
      return calculateHarrisBenedict(weight, height, age, gender);
    case 'mifflin':
      return calculateMifflinStJeor(weight, height, age, gender);
    case 'fao':
      return calculateFaoWho(weight, height, age, gender);
    case 'fao_1985':
      return calculateFaoOms1985(weight, height, age, gender);
    case 'fao_2001':
      return calculateFaoOms2001(weight, height, age, gender);
    case 'cunningham':
      return calculateCunningham(leanMass);
    case 'tinsley':
      return calculateTinsley(weight, leanMass);
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
      name: 'Harris-Benedict (1984)',
      description: 'Clássico. Bom para população geral.',
      category: 'general',
      requiresLeanMass: false
    },
    mifflin: {
      id: 'mifflin',
      name: 'Mifflin-St Jeor',
      description: 'Padrão ouro clínico. Mais preciso para sobrepeso.',
      category: 'clinical',
      requiresLeanMass: false,
      recommended: true
    },
    fao: {
      id: 'fao',
      name: 'FAO/WHO (simplificado)',
      description: 'Padrão OMS simplificado.',
      category: 'general',
      requiresLeanMass: false
    },
    fao_1985: {
      id: 'fao_1985',
      name: 'FAO/OMS 1985',
      description: 'Por faixa etária e sexo.',
      category: 'general',
      requiresLeanMass: false
    },
    fao_2001: {
      id: 'fao_2001',
      name: 'FAO/OMS 2001',
      description: 'WHO/FAO/UNU 2001.',
      category: 'general',
      requiresLeanMass: false
    },
    eer_iom: {
      id: 'eer_iom',
      name: 'EER/IOM (2005)',
      description: 'GET direto (Estimated Energy Requirement).',
      category: 'clinical',
      requiresLeanMass: false,
      isEer: true
    },
    cunningham: {
      id: 'cunningham',
      name: 'Cunningham (Atletas)',
      description: 'Baseado na Massa Magra. Ideal para alta performance.',
      category: 'athlete',
      requiresLeanMass: true
    },
    tinsley: {
      id: 'tinsley',
      name: 'Tinsley (Bodybuilding)',
      description: 'Específico para treinamento de força.',
      category: 'athlete',
      requiresLeanMass: true
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
  const { weight, height, age, gender, leanMass } = data;

  // Normalizar gênero
  const isMale = /^(male|masculino|m)$/i.test(String(gender || '').trim());

  switch (method) {
    case 'harris': {
      if (!weight || !height || !age || !gender) return null;

      const constant = isMale ? 88.362 : 447.593;
      const weightCoeff = isMale ? 13.397 : 9.247;
      const heightCoeff = isMale ? 4.799 : 3.098;
      const ageCoeff = isMale ? 5.677 : 4.330;

      const weightTerm = weightCoeff * weight;
      const heightTerm = heightCoeff * height;
      const ageTerm = ageCoeff * age;

      const result = constant + weightTerm + heightTerm - ageTerm;

      return {
        formulaName: `Harris-Benedict (${isMale ? 'Masculino' : 'Feminino'})`,
        equationStr: isMale
          ? '88.362 + (13.397 × P) + (4.799 × A) - (5.677 × I)'
          : '447.593 + (9.247 × P) + (3.098 × A) - (4.330 × I)',
        appliedStr: `${constant.toFixed(3)} + (${weightCoeff.toFixed(3)} × ${weight}) + (${heightCoeff.toFixed(3)} × ${height}) - (${ageCoeff.toFixed(3)} × ${age})`,
        steps: [
          { label: 'Constante', value: constant.toFixed(3) },
          { label: 'Peso', value: `${weightCoeff.toFixed(3)} × ${weight} = ${weightTerm.toFixed(2)}` },
          { label: 'Altura', value: `${heightCoeff.toFixed(3)} × ${height} = ${heightTerm.toFixed(2)}` },
          { label: 'Idade', value: `${ageCoeff.toFixed(3)} × ${age} = ${ageTerm.toFixed(2)}` },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    case 'mifflin': {
      if (!weight || !height || !age || !gender) return null;

      const constant = isMale ? 5 : -161;
      const weightTerm = 10 * weight;
      const heightTerm = 6.25 * height;
      const ageTerm = 5 * age;

      const result = weightTerm + heightTerm - ageTerm + constant;

      return {
        formulaName: `Mifflin-St Jeor (${isMale ? 'Masculino' : 'Feminino'})`,
        equationStr: '(10 × P) + (6.25 × A) - (5 × I) + S',
        appliedStr: `(10 × ${weight}) + (6.25 × ${height}) - (5 × ${age}) + ${constant}`,
        steps: [
          { label: 'Peso', value: `10 × ${weight} = ${weightTerm}` },
          { label: 'Altura', value: `6.25 × ${height} = ${heightTerm.toFixed(2)}` },
          { label: 'Idade', value: `5 × ${age} = ${ageTerm}` },
          { label: 'Constante (S)', value: constant.toString() },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    case 'cunningham': {
      if (!leanMass || leanMass <= 0) return null;

      const constant = 500;
      const leanMassTerm = 22 * leanMass;
      const result = constant + leanMassTerm;

      return {
        formulaName: 'Cunningham (Atletas)',
        equationStr: '500 + (22 × MM)',
        appliedStr: `500 + (22 × ${leanMass})`,
        steps: [
          { label: 'Constante', value: '500' },
          { label: 'Massa Magra', value: `22 × ${leanMass} = ${leanMassTerm.toFixed(2)}` },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { leanMass, weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    case 'tinsley': {
      if (!weight || !leanMass || leanMass <= 0) return null;

      const constant = 259;
      const leanMassTerm = 25.9 * leanMass;
      const result = leanMassTerm + constant;

      return {
        formulaName: 'Tinsley (Bodybuilding)',
        equationStr: '259 + (25.9 × MM)',
        appliedStr: `259 + (25.9 × ${leanMass})`,
        steps: [
          { label: 'Constante', value: '259' },
          { label: 'Massa Magra', value: `25.9 × ${leanMass} = ${leanMassTerm.toFixed(2)}` },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { leanMass, weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

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

    case 'fao_1985': {
      if (!weight || !age || !gender) return null;
      const result = calculateFaoOms1985(weight, height, age, gender);
      const band = age < 30 ? '18-30' : age < 60 ? '30-60' : '>60';
      return {
        formulaName: `FAO/OMS 1985 (${isMale ? 'M' : 'F'}, ${band} anos)`,
        equationStr: 'Equações por faixa etária e sexo (WHO/FAO/UNU 1985)',
        appliedStr: `Faixa ${band}, ${isMale ? 'masculino' : 'feminino'}`,
        steps: [{ label: 'TMB', value: `${result.toFixed(0)} kcal` }],
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

    case 'eer_iom': {
      if (!weight || !height || !age || !gender) return null;
      const pa = 1.25;
      const result = calculateEerIom(weight, height, age, pa, gender);
      return {
        formulaName: 'EER/IOM (2005) - GET direto',
        equationStr: isMale
          ? '662 - (9.53×I) + PA×[(15.91×P) + (539.6×A_m)]'
          : '354 - (6.91×I) + PA×[(9.36×P) + (726×A_m)]',
        appliedStr: `PA=${pa} (Ativo)`,
        steps: [{ label: 'GET', value: `${result.toFixed(0)} kcal/dia` }],
        baseData: { weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    default:
      return null;
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

  const get = bmr * activityFactor;
  const activityInfo = ACTIVITY_FACTORS.find(f => f.value === activityFactor);

  return {
    formulaName: 'Gasto Energético Total (GET)',
    equationStr: 'TMB × NAF',
    appliedStr: `${Math.round(bmr)} × ${activityFactor} = ${Math.round(get)}`,
    steps: [
      { label: 'Taxa Metabólica Basal (TMB)', value: `${Math.round(bmr)} kcal` },
      { label: 'Nível de Atividade (NAF)', value: `${activityFactor}${activityLabel ? ` (${activityLabel})` : ''}` },
      { label: 'GET', value: `${Math.round(get)} kcal/dia` }
    ],
    baseData: { bmr: Math.round(bmr), activityFactor, activityLabel: activityLabel || activityInfo?.label || 'N/A' }
  };
};


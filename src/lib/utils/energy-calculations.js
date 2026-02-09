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
  if (gender === 'male' || gender === 'masculino' || gender === 'm') {
    return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  } else {
    return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
  }
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
  const s = (gender === 'male' || gender === 'masculino' || gender === 'm') ? 5 : -161;
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
  return (25.9 * leanMassKg) + 284;
};

/**
 * 5. FAO/WHO (Organização Mundial da Saúde)
 * Padrão da Organização Mundial da Saúde.
 * Simplificado por faixas etárias comuns para adultos (18-60).
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm (não usado na versão simplificada)
 * @param {number} age - Idade em anos (não usado na versão simplificada)
 * @param {string} gender - 'male' ou 'female'
 * @returns {number} BMR em kcal/dia
 */
export const calculateFaoWho = (weight, height, age, gender) => {
  // Simplificado por faixas etárias comuns para adultos (18-60)
  if (gender === 'male' || gender === 'masculino' || gender === 'm') {
    return (15.3 * weight) + 679;
  } else {
    return (14.7 * weight) + 496;
  }
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
 * 
 * @param {number} bmr - Taxa Metabólica Basal em kcal/dia
 * @param {number} activityFactor - Fator de atividade (ex: 1.55)
 * @returns {number} GET em kcal/dia
 */
export const calculateGET = (bmr, activityFactor) => {
  if (!bmr || bmr <= 0 || !activityFactor || activityFactor <= 0) return 0;
  return bmr * activityFactor;
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
      recommended: true, // Default recommendation
      bmr: calculateMifflinStJeor(weight, height, age, gender),
      category: 'clinical'
    },
    { 
      id: 'fao', 
      name: 'FAO/WHO', 
      description: 'Padrão da Organização Mundial da Saúde.',
      bmr: calculateFaoWho(weight, height, age, gender),
      category: 'general'
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
    case 'cunningham':
      return calculateCunningham(leanMass);
    case 'tinsley':
      return calculateTinsley(weight, leanMass);
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
      name: 'FAO/WHO',
      description: 'Padrão da Organização Mundial da Saúde.',
      category: 'general',
      requiresLeanMass: false
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
  const isMale = gender === 'male' || gender === 'masculino' || gender === 'm';

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

      const constant = 284;
      const leanMassTerm = 25.9 * leanMass;
      const result = leanMassTerm + constant;

      return {
        formulaName: 'Tinsley (Bodybuilding)',
        equationStr: '(25.9 × MM) + 284',
        appliedStr: `(25.9 × ${leanMass}) + 284`,
        steps: [
          { label: 'Massa Magra', value: `25.9 × ${leanMass} = ${leanMassTerm.toFixed(2)}` },
          { label: 'Constante', value: '284' },
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
        equationStr: isMale
          ? '(15.3 × P) + 679'
          : '(14.7 × P) + 496',
        appliedStr: `(${weightCoeff} × ${weight}) + ${constant}`,
        steps: [
          { label: 'Peso', value: `${weightCoeff} × ${weight} = ${weightTerm.toFixed(2)}` },
          { label: 'Constante', value: constant.toString() },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
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


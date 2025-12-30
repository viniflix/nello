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

/**
 * 6. Schofield (1985)
 * Amplamente usado na Europa. Baseado em estudos populacionais.
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'male' ou 'female'
 * @returns {number} BMR em kcal/dia
 */
export const calculateSchofield = (weight, height, age, gender) => {
  const isMale = gender === 'male' || gender === 'masculino' || gender === 'm';
  
  if (isMale) {
    if (age >= 18 && age <= 30) {
      return (15.057 * weight) + 692.2;
    } else if (age >= 30 && age <= 60) {
      return (11.472 * weight) + 873.1;
    } else if (age > 60) {
      return (11.711 * weight) + 587.7;
    }
    // Fallback para 18-30
    return (15.057 * weight) + 692.2;
  } else {
    if (age >= 18 && age <= 30) {
      return (13.623 * weight) + 112.4;
    } else if (age >= 30 && age <= 60) {
      return (8.126 * weight) + 845.6;
    } else if (age > 60) {
      return (9.082 * weight) + 658.5;
    }
    // Fallback para 18-30
    return (13.623 * weight) + 112.4;
  }
};

/**
 * 7. Owen (1986)
 * Específico para mulheres. Mais preciso para população feminina.
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'male' ou 'female'
 * @returns {number|null} BMR em kcal/dia, ou null se não for mulher
 */
export const calculateOwen = (weight, height, age, gender) => {
  const isMale = gender === 'male' || gender === 'masculino' || gender === 'm';
  if (isMale) return null; // Owen é específico para mulheres
  
  return 795 + (7.18 * weight);
};

/**
 * 8. Katch-McArdle (2005)
 * Baseado em Massa Livre de Gordura (FFM). Muito preciso para atletas.
 * Requer massa magra.
 * 
 * @param {number} leanMassKg - Massa magra em kg
 * @returns {number|null} BMR em kcal/dia, ou null se leanMassKg não fornecido
 */
export const calculateKatchMcArdle = (leanMassKg) => {
  if (!leanMassKg || leanMassKg <= 0) return null;
  return 370 + (21.6 * leanMassKg);
};

/**
 * 9. De Lorenzo (1999)
 * Baseado em Massa Livre de Gordura. Específico para atletas.
 * Requer massa magra.
 * 
 * @param {number} leanMassKg - Massa magra em kg
 * @returns {number|null} BMR em kcal/dia, ou null se leanMassKg não fornecido
 */
export const calculateDeLorenzo = (leanMassKg) => {
  if (!leanMassKg || leanMassKg <= 0) return null;
  return 500 + (22 * leanMassKg);
};

/**
 * 10. FAO/WHO/UNU 2001 (Versão atualizada)
 * Padrão internacional atualizado. Mais preciso que versão anterior.
 * 
 * @param {number} weight - Peso em kg
 * @param {number} height - Altura em cm
 * @param {number} age - Idade em anos
 * @param {string} gender - 'male' ou 'female'
 * @returns {number} BMR em kcal/dia
 */
export const calculateFaoWho2001 = (weight, height, age, gender) => {
  const isMale = gender === 'male' || gender === 'masculino' || gender === 'm';
  
  if (isMale) {
    if (age >= 18 && age <= 30) {
      return (15.4 * weight) - (27 * height / 100) + 717;
    } else if (age >= 30 && age <= 60) {
      return (11.3 * weight) + (16 * height / 100) + 901;
    } else if (age > 60) {
      return (11.3 * weight) + (16 * height / 100) + 901;
    }
    // Fallback
    return (15.4 * weight) - (27 * height / 100) + 717;
  } else {
    if (age >= 18 && age <= 30) {
      return (13.3 * weight) + (334 * height / 100) + 35;
    } else if (age >= 30 && age <= 60) {
      return (8.7 * weight) - (25 * height / 100) + 865;
    } else if (age > 60) {
      return (9.2 * weight) + (637 * height / 100) - 302;
    }
    // Fallback
    return (13.3 * weight) + (334 * height / 100) + 35;
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
/**
 * Determina o melhor protocolo baseado no perfil do paciente
 * @param {Object} data - Dados do paciente
 * @param {Array} protocols - Array de protocolos calculados
 * @returns {string} ID do protocolo recomendado
 */
export const recommendBestProtocol = (data, protocols) => {
  const { weight, height, age, gender, leanMass } = data;
  const isMale = gender === 'male' || gender === 'masculino' || gender === 'm';
  const bmi = weight / Math.pow(height / 100, 2);
  
  // Se tem massa magra e é atleta (alta massa magra)
  if (leanMass && leanMass > 0) {
    const bodyFatPercent = ((weight - leanMass) / weight) * 100;
    if (bodyFatPercent < 15) {
      // Atleta com baixo % de gordura - usar protocolos de atleta
      const athleteProtocol = protocols.find(p => p.category === 'athlete');
      if (athleteProtocol) return athleteProtocol.id;
    }
  }
  
  // Se tem sobrepeso/obesidade (BMI > 25)
  if (bmi > 25) {
    return 'mifflin'; // Mifflin é mais preciso para sobrepeso
  }
  
  // Mulheres - Owen pode ser melhor
  if (!isMale) {
    const owen = protocols.find(p => p.id === 'owen');
    if (owen) return 'owen';
  }
  
  // Padrão: Mifflin-St Jeor (mais preciso em geral)
  return 'mifflin';
};

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
      name: 'Mifflin-St Jeor (1990)', 
      description: 'Padrão ouro clínico. Mais preciso para sobrepeso.',
      bmr: calculateMifflinStJeor(weight, height, age, gender),
      category: 'clinical'
    },
    { 
      id: 'fao', 
      name: 'FAO/WHO (1985)', 
      description: 'Padrão da Organização Mundial da Saúde.',
      bmr: calculateFaoWho(weight, height, age, gender),
      category: 'general'
    },
    { 
      id: 'schofield', 
      name: 'Schofield (1985)', 
      description: 'Amplamente usado na Europa. Baseado em estudos populacionais.',
      bmr: calculateSchofield(weight, height, age, gender),
      category: 'general'
    },
    { 
      id: 'fao2001', 
      name: 'FAO/WHO/UNU (2001)', 
      description: 'Versão atualizada do padrão internacional.',
      bmr: calculateFaoWho2001(weight, height, age, gender),
      category: 'general'
    }
  ];

  // Owen apenas para mulheres
  const owenBmr = calculateOwen(weight, height, age, gender);
  if (owenBmr !== null) {
    protocols.push({ 
      id: 'owen', 
      name: 'Owen (1986)', 
      description: 'Específico para mulheres. Mais preciso para população feminina.',
      bmr: owenBmr,
      category: 'clinical'
    });
  }

  // Adiciona protocolos de atleta APENAS se tiver massa magra
  if (leanMass && leanMass > 0) {
    const cunninghamBmr = calculateCunningham(leanMass);
    const tinsleyBmr = calculateTinsley(weight, leanMass);
    const katchBmr = calculateKatchMcArdle(leanMass);
    const deLorenzoBmr = calculateDeLorenzo(leanMass);
    
    if (cunninghamBmr !== null) {
      protocols.push({ 
        id: 'cunningham', 
        name: 'Cunningham (1980)', 
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
    
    if (katchBmr !== null) {
      protocols.push({ 
        id: 'katch', 
        name: 'Katch-McArdle (2005)', 
        description: 'Baseado em FFM. Muito preciso para atletas.',
        bmr: katchBmr,
        category: 'athlete'
      });
    }
    
    if (deLorenzoBmr !== null) {
      protocols.push({ 
        id: 'delorenzo', 
        name: 'De Lorenzo (1999)', 
        description: 'Baseado em FFM. Específico para atletas.',
        bmr: deLorenzoBmr,
        category: 'athlete'
      });
    }
  }

  // Determinar recomendação baseada no perfil
  const recommendedId = recommendBestProtocol(data, protocols);
  protocols.forEach(p => {
    if (p.id === recommendedId) {
      p.recommended = true;
    }
  });

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
    case 'harris-benedict':
      return calculateHarrisBenedict(weight, height, age, gender);
    case 'mifflin':
    case 'mifflin-st-jeor':
      return calculateMifflinStJeor(weight, height, age, gender);
    case 'fao':
    case 'fao-who':
      return calculateFaoWho(weight, height, age, gender);
    case 'fao2001':
    case 'fao-who-2001':
    case 'fao-oms-2001':
      return calculateFaoWho2001(weight, height, age, gender);
    case 'schofield':
      return calculateSchofield(weight, height, age, gender);
    case 'owen':
      return calculateOwen(weight, height, age, gender);
    case 'cunningham':
      return calculateCunningham(leanMass);
    case 'tinsley':
      return calculateTinsley(weight, leanMass);
    case 'katch':
    case 'katch-mcardle':
      return calculateKatchMcArdle(leanMass);
    case 'delorenzo':
    case 'de-lorenzo':
      return calculateDeLorenzo(leanMass);
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

    case 'schofield': {
      if (!weight || !height || !age || !gender) return null;

      let weightCoeff, constant;
      if (isMale) {
        if (age >= 18 && age <= 30) {
          weightCoeff = 15.057;
          constant = 692.2;
        } else if (age >= 30 && age <= 60) {
          weightCoeff = 11.472;
          constant = 873.1;
        } else {
          weightCoeff = 11.711;
          constant = 587.7;
        }
      } else {
        if (age >= 18 && age <= 30) {
          weightCoeff = 13.623;
          constant = 112.4;
        } else if (age >= 30 && age <= 60) {
          weightCoeff = 8.126;
          constant = 845.6;
        } else {
          weightCoeff = 9.082;
          constant = 658.5;
        }
      }

      const weightTerm = weightCoeff * weight;
      const result = weightTerm + constant;

      return {
        formulaName: `Schofield (${isMale ? 'Masculino' : 'Feminino'})`,
        equationStr: `(${weightCoeff.toFixed(3)} × P) + ${constant}`,
        appliedStr: `(${weightCoeff.toFixed(3)} × ${weight}) + ${constant}`,
        steps: [
          { label: 'Peso', value: `${weightCoeff.toFixed(3)} × ${weight} = ${weightTerm.toFixed(2)}` },
          { label: 'Constante', value: constant.toString() },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    case 'owen': {
      if (!weight || isMale) return null;

      const weightCoeff = 7.18;
      const constant = 795;
      const weightTerm = weightCoeff * weight;
      const result = constant + weightTerm;

      return {
        formulaName: 'Owen (Feminino)',
        equationStr: '795 + (7.18 × P)',
        appliedStr: `795 + (7.18 × ${weight})`,
        steps: [
          { label: 'Constante', value: '795' },
          { label: 'Peso', value: `7.18 × ${weight} = ${weightTerm.toFixed(2)}` },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { weight, height, age, gender: 'Feminino' }
      };
    }

    case 'katch':
    case 'katch-mcardle': {
      if (!leanMass || leanMass <= 0) return null;

      const constant = 370;
      const leanMassTerm = 21.6 * leanMass;
      const result = constant + leanMassTerm;

      return {
        formulaName: 'Katch-McArdle',
        equationStr: '370 + (21.6 × MM)',
        appliedStr: `370 + (21.6 × ${leanMass})`,
        steps: [
          { label: 'Constante', value: '370' },
          { label: 'Massa Magra', value: `21.6 × ${leanMass} = ${leanMassTerm.toFixed(2)}` },
          { label: 'Resultado', value: `${result.toFixed(0)} kcal` }
        ],
        baseData: { leanMass, weight, height, age, gender: isMale ? 'Masculino' : 'Feminino' }
      };
    }

    case 'delorenzo':
    case 'de-lorenzo': {
      if (!leanMass || leanMass <= 0) return null;

      const constant = 500;
      const leanMassTerm = 22 * leanMass;
      const result = constant + leanMassTerm;

      return {
        formulaName: 'De Lorenzo',
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

    case 'fao2001':
    case 'fao-who-2001':
    case 'fao-oms-2001': {
      if (!weight || !height || !age || !gender) return null;

      let weightCoeff, heightCoeff, constant;
      if (isMale) {
        if (age >= 18 && age <= 30) {
          weightCoeff = 15.4;
          heightCoeff = -27;
          constant = 717;
        } else {
          weightCoeff = 11.3;
          heightCoeff = 16;
          constant = 901;
        }
      } else {
        if (age >= 18 && age <= 30) {
          weightCoeff = 13.3;
          heightCoeff = 334;
          constant = 35;
        } else if (age >= 30 && age <= 60) {
          weightCoeff = 8.7;
          heightCoeff = -25;
          constant = 865;
        } else {
          weightCoeff = 9.2;
          heightCoeff = 637;
          constant = -302;
        }
      }

      const heightM = height / 100;
      const weightTerm = weightCoeff * weight;
      const heightTerm = heightCoeff * heightM;
      const result = weightTerm + heightTerm + constant;

      return {
        formulaName: `FAO/WHO/UNU 2001 (${isMale ? 'Masculino' : 'Feminino'})`,
        equationStr: `(${weightCoeff} × P) + (${heightCoeff} × A) + ${constant}`,
        appliedStr: `(${weightCoeff} × ${weight}) + (${heightCoeff} × ${heightM.toFixed(2)}) + ${constant}`,
        steps: [
          { label: 'Peso', value: `${weightCoeff} × ${weight} = ${weightTerm.toFixed(2)}` },
          { label: 'Altura', value: `${heightCoeff} × ${heightM.toFixed(2)} = ${heightTerm.toFixed(2)}` },
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


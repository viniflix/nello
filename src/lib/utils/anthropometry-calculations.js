/**
 * Anthropometry Calculations - Funções científicas para cálculos antropométricos
 * 
 * Baseado em:
 * - Jackson & Pollock (1985) - Body Density
 * - Siri (1961) - Body Fat %
 * - Heath-Carter (1967) - Somatotype
 * - Frame Size (Wrist circumference)
 */

/**
 * Calcula densidade corporal usando Pollock 3 dobras
 * @param {number} triceps - Dobra tríceps (mm)
 * @param {number} subscapular - Dobra subescapular (mm)
 * @param {number} suprailiac - Dobra suprailíaca (mm)
 * @param {number} age - Idade (anos)
 * @param {boolean} isMale - Gênero (true = masculino)
 * @returns {number|null} Densidade corporal (g/cm³)
 */
export function calculateBodyDensityPollock3(triceps, subscapular, suprailiac, age, isMale) {
  if (!triceps || !subscapular || !suprailiac || !age) return null;

  const sum = triceps + subscapular + suprailiac;

  if (isMale) {
    return 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * age);
  } else {
    return 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * age);
  }
}

/**
 * Calcula densidade corporal usando Pollock 7 dobras
 * @param {number} chest - Dobra peito (mm)
 * @param {number} axillary - Dobra axilar (mm)
 * @param {number} triceps - Dobra tríceps (mm)
 * @param {number} subscapular - Dobra subescapular (mm)
 * @param {number} abdominal - Dobra abdominal (mm)
 * @param {number} suprailiac - Dobra suprailíaca (mm)
 * @param {number} thigh - Dobra coxa (mm)
 * @param {number} age - Idade (anos)
 * @param {boolean} isMale - Gênero (true = masculino)
 * @returns {number|null} Densidade corporal (g/cm³)
 */
export function calculateBodyDensityPollock7(chest, axillary, triceps, subscapular, abdominal, suprailiac, thigh, age, isMale) {
  if (!chest || !axillary || !triceps || !subscapular || !abdominal || !suprailiac || !thigh || !age) return null;

  const sum = chest + axillary + triceps + subscapular + abdominal + suprailiac + thigh;

  if (isMale) {
    return 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * age);
  } else {
    return 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * age);
  }
}

/**
 * Calcula densidade corporal usando Weltman (1988)
 * @param {number} triceps - Dobra tríceps (mm)
 * @param {number} biceps - Dobra bíceps (mm)
 * @param {number} subscapular - Dobra subescapular (mm)
 * @param {number} suprailiac - Dobra suprailíaca (mm)
 * @param {boolean} isMale - Gênero (true = masculino)
 * @returns {number|null} Densidade corporal (g/cm³)
 */
export function calculateBodyDensityWeltman(triceps, biceps, subscapular, suprailiac, isMale) {
  if (!triceps || !biceps || !subscapular || !suprailiac) return null;

  const sum = triceps + biceps + subscapular + suprailiac;
  const logSum = Math.log10(sum);

  if (isMale) {
    return 1.1714 - (0.0671 * logSum);
  } else {
    return 1.1665 - (0.0706 * logSum);
  }
}

/**
 * Converte densidade corporal em % de gordura (Siri Equation, 1961)
 * @param {number} bodyDensity - Densidade corporal (g/cm³)
 * @returns {number|null} Percentual de gordura corporal
 */
export function calculateBodyFatPercent(bodyDensity) {
  if (!bodyDensity || bodyDensity <= 0) return null;
  return ((4.95 / bodyDensity) - 4.5) * 100;
}

/**
 * Calcula Frame Size (Compleição Óssea) baseado na circunferência do punho
 * @param {number} height - Altura (cm)
 * @param {number} wrist - Circunferência do punho (cm)
 * @param {boolean} isMale - Gênero (true = masculino)
 * @returns {{size: string, ratio: number}} Frame size e ratio
 */
export function calculateFrameSize(height, wrist, isMale) {
  if (!height || !wrist || height <= 0 || wrist <= 0) return null;

  const ratio = height / wrist;

  if (isMale) {
    if (ratio > 10.9) return { size: 'Pequena', ratio, label: 'Pequena' };
    if (ratio > 9.9) return { size: 'Média', ratio, label: 'Média' };
    return { size: 'Grande', ratio, label: 'Grande' };
  } else {
    if (ratio > 11.0) return { size: 'Pequena', ratio, label: 'Pequena' };
    if (ratio > 10.1) return { size: 'Média', ratio, label: 'Média' };
    return { size: 'Grande', ratio, label: 'Grande' };
  }
}

/**
 * Calcula Somatotipo usando Heath-Carter (1967)
 * @param {object} params - Parâmetros necessários
 * @param {number} params.height - Altura (cm)
 * @param {number} params.weight - Peso (kg)
 * @param {number} params.triceps - Dobra tríceps (mm)
 * @param {number} params.subscapular - Dobra subescapular (mm)
 * @param {number} params.suprailiac - Dobra suprailíaca (mm)
 * @param {number} params.humerusWidth - Largura do úmero (cm)
 * @param {number} params.femurWidth - Largura do fêmur (cm)
 * @param {number} params.armCirc - Circunferência do braço (cm)
 * @param {number} params.calfCirc - Circunferência da panturrilha (cm)
 * @param {boolean} params.isMale - Gênero (true = masculino)
 * @returns {{endo: number, meso: number, ecto: number, x: number, y: number}|null}
 */
export function calculateSomatotype(params) {
  const {
    height,
    weight,
    triceps,
    subscapular,
    suprailiac,
    humerusWidth,
    femurWidth,
    armCirc,
    calfCirc,
    isMale
  } = params;

  // Validação mínima
  if (!height || !weight) return null;

  // 1. ENDOMORPHY (Gordura relativa)
  let endomorphy = null;
  if (triceps && subscapular && suprailiac) {
    const sum = triceps + subscapular + suprailiac;
    endomorphy = -0.7182 + (0.1451 * sum) - (0.00068 * sum * sum) + (0.0000014 * sum * sum * sum);
    if (endomorphy < 0) endomorphy = 0;
  }

  // 2. MESOMORPHY (Massa muscular e óssea)
  let mesomorphy = null;
  if (height && humerusWidth && femurWidth && armCirc && calfCirc) {
    const heightM = height / 100;
    const correctedArmCirc = armCirc - (triceps || 0) / 10; // Correção: subtrai dobra cutânea
    const correctedCalfCirc = calfCirc - (subscapular || 0) / 10; // Aproximação

    mesomorphy = 0.858 * humerusWidth + 0.601 * femurWidth + 0.188 * correctedArmCirc + 
                 0.161 * correctedCalfCirc - (heightM * 0.131) + 4.5;
    if (mesomorphy < 0) mesomorphy = 0;
  }

  // 3. ECTOMORPHY (Linearidade)
  let ectomorphy = null;
  if (height && weight) {
    const heightM = height / 100;
    const hwr = heightM / Math.pow(weight, 1/3); // Height/Weight Ratio

    if (hwr >= 0.462) {
      ectomorphy = 0.732 * hwr - 28.58;
    } else if (hwr >= 0.231) {
      ectomorphy = 0.463 * hwr - 5.5;
    } else {
      ectomorphy = 0.1;
    }

    if (ectomorphy < 0) ectomorphy = 0;
  }

  // Se não temos todos os componentes, retorna null
  if (endomorphy === null || mesomorphy === null || ectomorphy === null) {
    return null;
  }

  // Calcular coordenadas X e Y para o Somatochart
  // X = Ectomorphy - Endomorphy
  // Y = 2 * Mesomorphy - (Endomorphy + Ectomorphy)
  const x = ectomorphy - endomorphy;
  const y = (2 * mesomorphy) - (endomorphy + ectomorphy);

  return {
    endo: parseFloat(endomorphy.toFixed(2)),
    meso: parseFloat(mesomorphy.toFixed(2)),
    ecto: parseFloat(ectomorphy.toFixed(2)),
    x: parseFloat(x.toFixed(2)),
    y: parseFloat(y.toFixed(2))
  };
}

/**
 * Obtém descrição do somatotipo dominante
 * @param {number} endo - Endomorphy
 * @param {number} meso - Mesomorphy
 * @param {number} ecto - Ectomorphy
 * @returns {string} Descrição do somatotipo
 */
export function getSomatotypeDescription(endo, meso, ecto) {
  if (!endo || !meso || !ecto) return 'Incompleto';

  const max = Math.max(endo, meso, ecto);
  
  if (max === endo) {
    if (meso > ecto) return 'Endomorfo-Mesomorfo';
    return 'Endomorfo';
  } else if (max === meso) {
    if (endo > ecto) return 'Mesomorfo-Endomorfo';
    if (ecto > endo) return 'Mesomorfo-Ectomorfo';
    return 'Mesomorfo';
  } else {
    if (meso > endo) return 'Ectomorfo-Mesomorfo';
    return 'Ectomorfo';
  }
}


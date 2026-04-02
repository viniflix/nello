export const SUBSTITUTION_LIMITS = {
  calories: 30,
  protein: 2,
  carbs: 2,
  fat: 2
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const MICRO_FIELDS = [
  'fiber',
  'sodium',
  'calcium',
  'iron',
  'magnesium',
  'potassium',
  'zinc',
  'vitamin_a',
  'vitamin_c',
  'vitamin_d'
];

export const getSubstitutionAnalysis = (baseFood, candidateFood) => {
  const base = baseFood || {};
  const candidate = candidateFood || {};

  const baseMacros = {
    calories: toNumber(base.calories),
    protein: toNumber(base.protein),
    carbs: toNumber(base.carbs),
    fat: toNumber(base.fat)
  };

  const candidateMacros = {
    calories: toNumber(candidate.calories),
    protein: toNumber(candidate.protein),
    carbs: toNumber(candidate.carbs),
    fat: toNumber(candidate.fat)
  };

  const diffs = {
    calories: candidateMacros.calories - baseMacros.calories,
    protein: candidateMacros.protein - baseMacros.protein,
    carbs: candidateMacros.carbs - baseMacros.carbs,
    fat: candidateMacros.fat - baseMacros.fat
  };

  const absDiffs = {
    calories: Math.abs(diffs.calories),
    protein: Math.abs(diffs.protein),
    carbs: Math.abs(diffs.carbs),
    fat: Math.abs(diffs.fat)
  };

  const hasCompleteMacros = Object.values(candidateMacros).every((value) => Number.isFinite(value));
  const exceeds = {
    calories: absDiffs.calories > SUBSTITUTION_LIMITS.calories,
    protein: absDiffs.protein > SUBSTITUTION_LIMITS.protein,
    carbs: absDiffs.carbs > SUBSTITUTION_LIMITS.carbs,
    fat: absDiffs.fat > SUBSTITUTION_LIMITS.fat
  };

  const groupMatch = base.group && candidate.group ? base.group === candidate.group : false;
  const sourceMatch = base.source && candidate.source ? base.source === candidate.source : false;

  const macroDiffTotal = absDiffs.protein + absDiffs.carbs + absDiffs.fat;
  const microDiffTotal = MICRO_FIELDS.reduce((acc, field) => {
    const baseValue = toNumber(base[field]);
    const candidateValue = toNumber(candidate[field]);
    return acc + Math.abs(candidateValue - baseValue);
  }, 0);

  const similarityScore = (
    absDiffs.calories * 2 +
    macroDiffTotal * 8 +
    microDiffTotal * 0.4 -
    (groupMatch ? 5 : 0) -
    (sourceMatch ? 1.5 : 0)
  );

  const reasons = [];
  if (exceeds.calories) reasons.push(`calorias ${diffs.calories > 0 ? '+' : ''}${diffs.calories.toFixed(0)} kcal`);
  if (exceeds.protein) reasons.push(`proteína ${diffs.protein > 0 ? '+' : ''}${diffs.protein.toFixed(1)}g`);
  if (exceeds.carbs) reasons.push(`carboidrato ${diffs.carbs > 0 ? '+' : ''}${diffs.carbs.toFixed(1)}g`);
  if (exceeds.fat) reasons.push(`gordura ${diffs.fat > 0 ? '+' : ''}${diffs.fat.toFixed(1)}g`);

  const isRecommended = hasCompleteMacros && !Object.values(exceeds).some(Boolean);

  return {
    diffs,
    absDiffs,
    hasCompleteMacros,
    isRecommended,
    reason: reasons.length ? reasons.join(' • ') : null,
    similarityScore,
    macroDiffTotal,
    microDiffTotal,
    groupMatch
  };
};

export const calculateEquivalentPortion = (originalKcal, substituteKcalPer100g) => {
  if (!substituteKcalPer100g || substituteKcalPer100g <= 0) return 0;
  // (Original Kcal / Sub Kcal per 100g) * 100g
  return (originalKcal / substituteKcalPer100g) * 100;
};

export const getMacroProportions = (protein, carbs, fat) => {
  const pKcal = (protein || 0) * 4;
  const cKcal = (carbs || 0) * 4;
  const fKcal = (fat || 0) * 9;
  const total = pKcal + cKcal + fKcal || 1;

  return {
    p: (pKcal / total) * 100,
    c: (cKcal / total) * 100,
    f: (fKcal / total) * 100
  };
};

export const formatDiff = (value, unit) => {
  const numeric = toNumber(value);
  const signal = numeric > 0 ? '+' : '';
  const decimals = unit === 'kcal' ? 0 : 1;
  return `${signal}${numeric.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
};

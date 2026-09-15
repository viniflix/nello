// NASEM 2023, adult EER equations; height in cm, weight in kg, age in years.
export const DRI_SOURCE_URL = 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html';
export const DRI_ACTIVITY_LEVELS = [
  { id: 'inactive', label: 'Inativo' },
  { id: 'low_active', label: 'Pouco ativo' },
  { id: 'active', label: 'Ativo' },
  { id: 'very_active', label: 'Muito ativo' },
];
export const DRI_2023_COEFFICIENTS = {
  male: {
    inactive: [753.07, 10.83, 6.50, 14.10],
    low_active: [581.47, 10.83, 8.30, 14.94],
    active: [1004.82, 10.83, 6.52, 15.91],
    very_active: [-517.88, 10.83, 15.61, 19.11],
  },
  female: {
    inactive: [584.90, 7.01, 5.72, 11.71],
    low_active: [575.77, 7.01, 6.60, 12.14],
    active: [710.25, 7.01, 6.54, 12.34],
    very_active: [511.83, 7.01, 9.07, 12.56],
  },
};
export const normalizeEnergySex = gender => {
  const value = String(gender || '').trim().toLowerCase();
  if (['m', 'male', 'masculino'].includes(value)) return 'male';
  if (['f', 'female', 'feminino'].includes(value)) return 'female';
  return null;
};
export const validEnergyBiometry = ({ weight, height, age, gender }, minimumAge = 18) =>
  [weight, height, age].every(v => v !== '' && v != null && Number.isFinite(Number(v))) &&
  Number(weight) >= 1 && Number(weight) <= 300 && Number(height) >= 50 && Number(height) <= 255 &&
  Number(age) >= minimumAge && Number(age) <= 120 && Number.isInteger(Number(age)) && !!normalizeEnergySex(gender);

export function driPaCoefficient(activity, gender) {
  const index = DRI_ACTIVITY_LEVELS.findIndex(item => item.id === activity);
  const sex = normalizeEnergySex(gender);
  if (index < 0 || !sex) return null;
  return (sex === 'male' ? [1, 1.11, 1.25, 1.48] : [1, 1.12, 1.27, 1.45])[index];
}

export function calculateDri2023(data, activity = 'inactive') {
  if (!validEnergyBiometry(data, 19)) return null;
  const coefficients = DRI_2023_COEFFICIENTS[normalizeEnergySex(data.gender)]?.[activity];
  if (!coefficients) return null;
  const [constant, age, height, weight] = coefficients;
  return constant - age * Number(data.age) + height * Number(data.height) + weight * Number(data.weight);
}

export function dri2023Breakdown(data, activity = 'inactive') {
  const result = calculateDri2023(data, activity);
  if (result == null) return null;
  const [c, a, h, w] = DRI_2023_COEFFICIENTS[normalizeEnergySex(data.gender)][activity];
  return {
    formulaName: `DRIs 2023 — ${DRI_ACTIVITY_LEVELS.find(item => item.id === activity).label}`,
    equationStr: `${c} − (${a} × idade) + (${h} × altura em cm) + (${w} × peso em kg)`,
    appliedStr: `${c} − (${a} × ${data.age}) + (${h} × ${data.height}) + (${w} × ${data.weight}) = ${result.toFixed(2)} kcal/dia`,
    steps: [{ label: 'EER / GET (atividade já incluída)', value: `${result.toFixed(2)} kcal/dia` }],
    sourceUrl: DRI_SOURCE_URL,
    baseData: data,
  };
}

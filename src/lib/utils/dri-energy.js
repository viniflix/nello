import { parseFiniteEnergyNumber } from './energy-numbers';
import { energyFormulaTrace } from '../../../supabase/functions/_shared/clinical-energy.js';
export { DRI_2023_COEFFICIENTS } from '../../../supabase/functions/_shared/clinical-energy.js';

// NASEM 2023, adult EER equations; height in cm, weight in kg, age in years.
export const DRI_SOURCE_URL = 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html';
export const DRI_ACTIVITY_LEVELS = [
  { id: 'inactive', label: 'Sedentário (inativo)' },
  { id: 'low_active', label: 'Pouco ativo' },
  { id: 'active', label: 'Ativo' },
  { id: 'very_active', label: 'Muito ativo' },
];
export const normalizeEnergySex = gender => {
  const value = String(gender || '').trim().toLowerCase();
  if (['m', 'male', 'masculino'].includes(value)) return 'male';
  if (['f', 'female', 'feminino'].includes(value)) return 'female';
  return null;
};
export const validEnergyBiometry = ({ weight, height, age, gender }, minimumAge = 18) =>
  [weight, height, age].every(v => parseFiniteEnergyNumber(v) != null) &&
  parseFiniteEnergyNumber(weight) >= 1 && parseFiniteEnergyNumber(weight) <= 300 &&
  parseFiniteEnergyNumber(height) >= 50 && parseFiniteEnergyNumber(height) <= 255 &&
  parseFiniteEnergyNumber(age) >= minimumAge && parseFiniteEnergyNumber(age) <= 120 &&
  Number.isInteger(parseFiniteEnergyNumber(age)) && !!normalizeEnergySex(gender);

export function driPaCoefficient(activity, gender) {
  const index = DRI_ACTIVITY_LEVELS.findIndex(item => item.id === activity);
  const sex = normalizeEnergySex(gender);
  if (index < 0 || !sex) return null;
  return (sex === 'male' ? [1, 1.11, 1.25, 1.48] : [1, 1.12, 1.27, 1.45])[index];
}

export function driActivityOptionLabel(activity, protocol, gender) {
  const item = DRI_ACTIVITY_LEVELS.find(level => level.id === activity);
  if (!item) return '';
  const pa = protocol === 'eer_iom' ? driPaCoefficient(activity, gender) : null;
  return pa == null ? item.label : `${item.label} (PA ${pa.toLocaleString('pt-BR')})`;
}

export function calculateDri2023(data, activity) {
  return energyFormulaTrace('dri_2023', { ...data, driActivity: activity })?.resultKcal ?? null;
}

export function dri2023Breakdown(data, activity) {
  return energyFormulaTrace('dri_2023', { ...data, driActivity: activity });
}

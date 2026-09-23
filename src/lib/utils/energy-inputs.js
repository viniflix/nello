import { normalizeEnergySex } from './dri-energy';

const ranges = { weight: [1, 300], height: [50, 255], age: [0, 120], body_fat_percentage: [0, 100], lean_mass_kg: [0, 300] };
const snapshotKeys = { weight: 'weight_kg', height: 'height_cm', age: 'age_years', gender: 'sex', body_fat_percentage: 'body_fat_percentage', lean_mass_kg: 'lean_mass_kg' };

export function normalizeEnergyInput(field, value) {
  if (field === 'gender') {
    const sex = normalizeEnergySex(value);
    return sex === 'male' ? 'M' : sex === 'female' ? 'F' : null;
  }
  if (value == null || String(value).trim() === '') return null;
  const number = Number(value);
  const [min, max] = ranges[field];
  if (!Number.isFinite(number) || number < min || number > max || (field === 'age' && !Number.isInteger(number))) return null;
  return number;
}

export function readAnthropometryEnergyValues(results) {
  if (['pollock3', 'pollock7'].includes(results?.protocol) &&
      (!results?.equation_version || !['male', 'female'].includes(results?.sex_used) || !Number.isInteger(results?.age_years))) {
    return { body_fat_percentage: null, lean_mass_kg: null };
  }
  return {
    body_fat_percentage: normalizeEnergyInput('body_fat_percentage', results?.body_fat_percent ?? results?.body_fat_percentage),
    lean_mass_kg: normalizeEnergyInput('lean_mass_kg', results?.lean_mass_kg),
  };
}

/** Current source wins; a previous calculation is only a visible fallback. */
export function restoreEnergyBiometry(current = {}, saved = null) {
  const values = {};
  const sources = {};
  for (const field of Object.keys(snapshotKeys)) {
    const currentValue = normalizeEnergyInput(field, current?.[field]);
    const savedValue = normalizeEnergyInput(field, saved?.input_snapshot?.[snapshotKeys[field]])
      ?? normalizeEnergyInput(field, saved?.[field]);
    values[field] = currentValue ?? savedValue;
    sources[field] = currentValue != null ? current?._sources?.[field] || null : savedValue != null ? 'saved' : null;
  }
  return { ...values, _sources: sources };
}

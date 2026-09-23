import { HARRIS_1919 } from './energy-calculations';
import { normalizeEnergySex } from './dri-energy';

const HARRIS_1984 = { male: [88.362, 13.397, 4.799, 5.677], female: [447.593, 9.247, 3.098, 4.330] };
const HARRIS_1919_ROUNDED = { male: [66.5, 13.75, 5.003, 6.75], female: [655.1, 9.563, 1.85, 4.676] };

const evaluate = (coefficients, weight, height, age) =>
  coefficients[0] + coefficients[1] * weight + coefficients[2] * height - coefficients[3] * age;

export function identifyHarrisEquation(saved) {
  const protocol = saved?.tmb_protocol || saved?.protocol;
  if (!['harris', 'harris-benedict'].includes(protocol)) return null;
  const sex = normalizeEnergySex(saved?.input_snapshot?.sex ?? saved?.gender);
  const weight = Number(saved?.input_snapshot?.weight_kg ?? saved?.weight);
  const height = Number(saved?.input_snapshot?.height_cm ?? saved?.height);
  const age = Number(saved?.input_snapshot?.age_years ?? saved?.age);
  const tmb = Number(saved?.tmb_result ?? saved?.tmb);
  if (!sex || ![weight, height, age, tmb].every(Number.isFinite) || weight <= 0 || height <= 0 || age <= 0 || tmb <= 0) return 'unknown';
  if (Math.abs(tmb - evaluate(HARRIS_1984[sex], weight, height, age)) < 0.001) return '1984_revised';
  if (Math.abs(tmb - evaluate(HARRIS_1919_ROUNDED[sex], weight, height, age)) < 0.001) return '1919_rounded';
  if (Math.abs(tmb - evaluate(HARRIS_1919[sex], weight, height, age)) < 0.001) return '1919_full';
  return 'unknown';
}

export function harrisEquationLabel(saved) {
  const version = identifyHarrisEquation(saved);
  return version === null ? null : ({
    '1984_revised': 'Harris-Benedict (revisada 1984)',
    '1919_rounded': 'Harris-Benedict (1919, coeficientes arredondados)',
    '1919_full': 'Harris-Benedict (1919)',
    unknown: 'Harris-Benedict (versão não identificada)',
  })[version];
}

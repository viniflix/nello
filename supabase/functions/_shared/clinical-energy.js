import { clinicalLeaf as leaf, clinicalOperation as op, roundClinicalFraction, decimalFraction } from './clinical-arithmetic.js';

export const ENERGY_ARITHMETIC_POLICY = Object.freeze({
  version: 1, arithmetic: 'exact_decimal_rational', intermediateRounding: 'none',
  displayDecimals: 2, rounding: 'half_away_from_zero', resultUnit: 'kcal/day',
});
export const HARRIS_1919 = {
  male: [66.473, 13.7516, 5.0033, 6.755],
  female: [655.0955, 9.5634, 1.8496, 4.6756],
};
export const DRI_2023_COEFFICIENTS = {
  male: { inactive: [753.07, 10.83, 6.5, 14.1], low_active: [581.47, 10.83, 8.3, 14.94], active: [1004.82, 10.83, 6.52, 15.91], very_active: [-517.88, 10.83, 15.61, 19.11] },
  female: { inactive: [584.9, 7.01, 5.72, 11.71], low_active: [575.77, 7.01, 6.6, 12.14], active: [710.25, 7.01, 6.54, 12.34], very_active: [511.83, 7.01, 9.07, 12.56] },
};
export const ENERGY_REFERENCES = {
  harris: { title: 'Harris & Benedict, 1918/1919 — equação original', url: 'https://doi.org/10.1073/pnas.4.12.370', equationVersion: 'harris_benedict_1919_full_precision' },
  mifflin: { title: 'Mifflin et al., 1990 — equação simplificada publicada', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/', equationVersion: 'mifflin_st_jeor_1990_simplified' },
  fao_1985: { title: 'FAO/WHO/UNU, 1985 — peso, sexo e faixa etária, tabela 5', url: 'https://www.fao.org/4/aa040e/AA040E06.htm', equationVersion: 'fao_who_unu_1985_weight' },
  cunningham: { title: 'Cunningham, 1980 — massa livre de gordura', url: 'https://pubmed.ncbi.nlm.nih.gov/7435418/', equationVersion: 'cunningham_1980_ffm' },
  tinsley: { title: 'Tinsley et al., publicação online 2018, volume 2019 — massa livre de gordura', url: 'https://doi.org/10.1139/apnm-2018-0412', equationVersion: 'tinsley_2018_ffm' },
  eer_iom: { title: 'IOM, DRIs 2005 — EER de adultos, capítulo 5: Energy', url: 'https://www.nationalacademies.org/read/10490/chapter/7', tableUrl: 'https://www.canada.ca/en/health-canada/services/food-nutrition/food-nutrition-surveillance/health-nutrition-surveys/canadian-community-health-survey-cchs/canadian-community-health-survey-cycle-2-2-nutrition-2004-guide-accessing-interpreting-data-health-canada-2006.html', equationVersion: 'iom_2005_adult_eer' },
  dri_2023: { title: 'NASEM, DRIs 2023 — EER de adultos; tabela oficial Health Canada', url: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html', equationVersion: 'nasem_2023_adult_eer' },
};
export const parseClinicalNumber = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.length > 64 || !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(value.trim())) return null;
  const result = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(result)) return null;
  const original = decimalFraction(value), converted = decimalFraction(result);
  return original.numerator === converted.numerator && original.denominator === converted.denominator ? result : null;
};
const sexOf = value => {
  const sex = String(value || '').trim().toLowerCase();
  return ['male', 'm', 'masculino'].includes(sex) ? 'male' : ['female', 'f', 'feminino'].includes(sex) ? 'female' : null;
};
const term = (coefficient, label, value, unit) => op('multiply', leaf('Coeficiente', coefficient, `kcal/day/${unit}`), leaf(label, value, unit), label);
const linear = (c, w, h, a, data) => {
  const constant = leaf('Constante', c, 'kcal/day');
  const weight = term(w, 'Peso', data.weight, 'kg');
  const height = term(h, 'Altura', data.height, 'cm');
  const age = term(a, 'Idade', data.age, 'year');
  const tree = op('subtract', op('add', op('add', constant, weight, 'Constante + peso'), height, 'Soma com altura'), age, 'Resultado');
  return { tree, terms: { constant: c, weight: weight.value, height: height.value, age: age.value, result: tree.value } };
};
const symbols = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
export const explainClinicalTree = tree => tree.operation === 'input'
  ? `${tree.value}${tree.unit === '1' || tree.label === 'Constante' ? '' : ` ${tree.unit}`}`
  : `(${explainClinicalTree(tree.operands[0])} ${symbols[tree.operation]} ${explainClinicalTree(tree.operands[1])})`;

/** One evaluated expression also supplies the explanation. Returns JSON-safe audit data. */
export function energyFormulaTrace(method, raw) {
  const data = Object.fromEntries(['weight', 'height', 'age', 'leanMass'].map(key => [key, parseClinicalNumber(raw?.[key])]));
  const sex = sexOf(raw?.gender);
  const reference = ENERGY_REFERENCES[method];
  const minimumAge = ['eer_iom', 'dri_2023'].includes(method) ? 19 : 18;
  if (!reference || !sex || data.weight == null || data.weight < 1 || data.weight > 300 || data.height == null || data.height < 50 || data.height > 255 || !Number.isInteger(data.age) || data.age < minimumAge || data.age > 120) return null;
  let trace, equationStr;
  if (method === 'harris' || method === 'mifflin' || method === 'dri_2023') {
    const coefficients = method === 'harris' ? HARRIS_1919[sex] : method === 'mifflin' ? [sex === 'male' ? 5 : -161, 10, 6.25, 5] : DRI_2023_COEFFICIENTS[sex]?.[raw.driActivity];
    if (!coefficients) return null;
    const [c, w, h, a] = method === 'dri_2023' ? [coefficients[0], coefficients[3], coefficients[2], coefficients[1]] : coefficients;
    trace = linear(c, w, h, a, data);
    equationStr = `${c} + (${w} × P) + (${h} × A) − (${a} × I)`;
  } else if (method === 'fao_1985') {
    const [w, c] = (sex === 'male' ? [[15.3, 679], [11.6, 879], [13.5, 487]] : [[14.7, 496], [8.7, 829], [10.5, 596]])[data.age < 30 ? 0 : data.age < 60 ? 1 : 2];
    trace = { tree: op('add', term(w, 'Peso', data.weight, 'kg'), leaf('Constante', c, 'kcal/day'), 'Resultado') };
    equationStr = `${w} × P + ${c}`;
  } else if (['cunningham', 'tinsley'].includes(method)) {
    if (data.leanMass == null || data.leanMass <= 0 || data.leanMass > data.weight) return null;
    const [c, w] = method === 'cunningham' ? [500, 22] : [284, 25.9];
    trace = { tree: op('add', leaf('Constante', c, 'kcal/day'), term(w, 'Massa livre de gordura', data.leanMass, 'kg'), 'Resultado') };
    equationStr = `${c} + (${w} × MM)`;
  } else {
    const index = ['inactive', 'low_active', 'active', 'very_active'].indexOf(raw.driActivity);
    if (index < 0) return null;
    const pa = (sex === 'male' ? [1, 1.11, 1.25, 1.48] : [1, 1.12, 1.27, 1.45])[index];
    const [c, a, w, h] = sex === 'male' ? [662, 9.53, 15.91, 539.6] : [354, 6.91, 9.36, 726];
    const heightM = op('divide', leaf('Altura', data.height, 'cm'), leaf('cm/m', 100, 'cm/m'), 'Altura em metros', 'm');
    const sum = op('add', term(w, 'Peso', data.weight, 'kg'), op('multiply', leaf('Coeficiente', h, 'kcal/day/m'), heightM, 'Altura'), 'Peso + altura');
    trace = { tree: op('add', op('subtract', leaf('Constante', c, 'kcal/day'), term(a, 'Idade', data.age, 'year'), 'Constante − idade'), op('multiply', leaf('PA', pa), sum, 'Atividade incluída'), 'Resultado') };
    equationStr = `${c} − (${a} × I) + PA × [(${w} × P) + (${h} × A_m)]`;
  }
  const result = trace.tree.value;
  return {
    formulaName: reference.title, equationVersion: reference.equationVersion, sourceUrl: reference.url,
    reference, arithmeticPolicy: ENERGY_ARITHMETIC_POLICY, calculationTree: trace.tree,
    resultKcal: result, terms: trace.terms, equationStr,
    appliedStr: `${explainClinicalTree(trace.tree)} = ${roundClinicalFraction(trace.tree.exact)} kcal/dia`,
    steps: [{ label: 'Resultado', value: `${roundClinicalFraction(trace.tree.exact)} kcal/dia` }],
    baseData: { ...data, gender: sex },
  };
}

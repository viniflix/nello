import { describe, expect, it } from 'vitest';
import { harrisEquationLabel, identifyHarrisEquation } from './harris-history';

describe('historical Harris equation provenance', () => {
  it.each([
    [1938.318, 'M', 80, 187, 21, '1984_revised'],
    [1675.749, 'F', 80, 187, 21, '1984_revised'],
    [2057.293, 'M', 102, 181, 47, '1919_rounded'],
    [1655.758, 'F', 88, 177, 36, '1919_rounded'],
    [1655.7323, 'F', 88, 177, 36, '1919_full'],
  ])('identifies stored TMB %s from its actual coefficients', (tmb_result, gender, weight, height, age, version) => {
    expect(identifyHarrisEquation({ tmb_protocol: 'harris', tmb_result, gender, weight, height, age,
      protocol_code: 'energy.harris_benedict_revised' })).toBe(version);
  });
  it('does not trust a mislabeled protocol or invent a version without inputs', () => {
    const saved = { tmb_protocol: 'harris', protocol_code: 'energy.harris_benedict_revised', gender: 'F', weight: 88, height: 177, age: 36, tmb_result: 1655.758 };
    expect(harrisEquationLabel(saved)).toBe('Harris-Benedict (1919, coeficientes arredondados)');
    expect(identifyHarrisEquation({ tmb_protocol: 'harris' })).toBe('unknown');
  });
});

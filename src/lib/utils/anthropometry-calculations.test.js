import { describe, expect, it } from 'vitest';
import {
  calculateBodyDensityPollock3,
  calculateBodyDensityPollock7,
  calculateBodyFatPercent,
  calculatePollockComposition,
  getPollockSex,
} from './anthropometry-calculations';

const seven = { peito: 10, axilar: 12, triceps: 14, subescapular: 16, abdominal: 18, suprailiaca: 20, coxa: 22 };

describe('Pollock body composition', () => {
  it.each([
    ['male', 30, 1.112 - 0.00043499 * 112 + 0.00000055 * 112 ** 2 - 0.00028826 * 30],
    ['female', 30, 1.097 - 0.00046971 * 112 + 0.00000056 * 112 ** 2 - 0.00012828 * 30],
  ])('matches the independent seven-site equation for %s', (sex, age, expectedDensity) => {
    const result = calculatePollockComposition({ skinfolds: seven, age, sex, weight: 70, protocol: 'pollock7' });
    const expectedPercent = (4.95 / expectedDensity - 4.5) * 100;
    expect(result.body_density).toBeCloseTo(expectedDensity, 10);
    expect(result.body_fat_percent).toBeCloseTo(expectedPercent, 10);
    expect(result.fat_mass_kg).toBeCloseTo(70 * expectedPercent / 100, 10);
    expect(result.fat_mass_kg + result.lean_mass_kg).toBeCloseTo(70, 10);
    expect(result.skinfold_sum_mm).toBe(112);
    expect(result.age_years).toBe(30);
    expect(result.sex_used).toBe(sex);
  });

  it('uses distinct three-site measurements for men and women', () => {
    const male = calculatePollockComposition({ skinfolds: { peito: 10, abdominal: 18, coxa: 22 }, age: 30, sex: 'male', weight: 70, protocol: 'pollock3' });
    const female = calculatePollockComposition({ skinfolds: { triceps: 14, suprailiaca: 20, coxa: 22 }, age: 30, sex: 'female', weight: 70, protocol: 'pollock3' });
    expect(male.body_density).toBeCloseTo(1.10938 - 0.0008267 * 50 + 0.0000016 * 50 ** 2 - 0.0002574 * 30, 10);
    expect(female.body_density).toBeCloseTo(1.0994921 - 0.0009929 * 56 + 0.0000023 * 56 ** 2 - 0.0001392 * 30, 10);
    expect(calculateBodyDensityPollock3({ triceps: 14, suprailiaca: 20, coxa: 22 }, 30, true)).toBeNull();
  });

  it('rejects missing, malformed and zero folds instead of silently using partial values', () => {
    for (const value of [undefined, '12mm', '12.3.4', 0]) {
      expect(calculatePollockComposition({ skinfolds: { ...seven, axilar: value }, age: 30, sex: 'female', weight: 70, protocol: 'pollock7' })).toBeNull();
    }
  });

  it('requires known sex and an age within the population used for the equation', () => {
    expect(getPollockSex(null)).toBeNull();
    expect(getPollockSex('Masculino')).toBe('male');
    expect(getPollockSex('Feminino')).toBe('female');
    for (const [sex, age] of [['female', 56], ['male', 62], ['male', 17], ['female', 30.5]]) {
      expect(calculatePollockComposition({ skinfolds: seven, age, sex, weight: 70, protocol: 'pollock7' })).toBeNull();
    }
    expect(calculatePollockComposition({ skinfolds: seven, age: 30, sex: null, weight: 70, protocol: 'pollock7' })).toBeNull();
    expect(calculateBodyDensityPollock7(10, 12, 14, 16, 18, 20, 22, 56, false)).toBeNull();
  });

  it('reports implausible Siri results as unavailable instead of clamping them', () => {
    expect(calculateBodyFatPercent(0.9)).toBeNull();
    expect(calculateBodyFatPercent(1.2)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { calculateBMI, classifyBMI, getBMICuts } from './bmi-classification';

describe('D3 profile-aware assisted BMI', () => {
  it('does not invent pediatric percentiles from approximate annual cutoffs', () => {
    const result = classifyBMI({ bmi: 18, age: 9, sex: 'feminino' });
    expect(result.method).toBe('pediatrico_pendente_curva_oms');
    expect(result.normalRange).toBeNull();
    expect(getBMICuts({ age: 9 })).toBeNull();
  });
  it('uses the Brazilian elderly profile from 60 years without obesity grading', () => {
    expect(classifyBMI({ bmi: 21.9, age: 60 }).label).toBe('Baixo peso');
    expect(classifyBMI({ bmi: 24, age: 72 }).label).toBe('Eutrofia');
    expect(classifyBMI({ bmi: 31, age: 80 }).label).toBe('Sobrepeso');
  });
  it('keeps adult classification assisted and computes BMI safely', () => {
    expect(calculateBMI(70, 170)).toBeCloseTo(24.22, 2);
    expect(classifyBMI({ bmi: 24.2, age: 35 }).requiresProfessionalValidation).toBe(true);
  });
});

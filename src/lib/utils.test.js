import { describe, expect, it } from 'vitest';
import { formatNutrient } from './utils';

describe('Brazilian nutrient presentation', () => {
  it('limits repeating decimals and separates thousands without changing stored values', () => {
    const raw = 2333.333333333333;
    expect(formatNutrient(raw)).toBe('2.333,33');
    expect(formatNutrient(2.333333333333)).toBe('2,33');
    expect(raw).toBe(2333.333333333333);
  });
  it('distinguishes unavailable from measured zero', () => {
    expect(formatNutrient(null)).toBe('—');
    expect(formatNutrient(0)).toBe('0');
  });
});

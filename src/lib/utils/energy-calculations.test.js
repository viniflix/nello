import { describe, expect, it } from 'vitest';
import { calculateAllProtocols, calculateTinsley, calculateCunningham } from './energy-calculations';

describe('D4 versioned energy calculation contracts', () => {
  it('uses the published Tinsley fat-free-mass constant', () => {
    expect(calculateTinsley(80, 60)).toBeCloseTo(284 + (25.9 * 60), 6);
  });
  it('offers only protocols represented in the D4 catalog', () => {
    const protocols = calculateAllProtocols({ weight: 80, height: 180, age: 30, gender: 'M', leanMass: 60 });
    expect(protocols.map(({ id }) => id)).toEqual(['harris', 'mifflin', 'fao_1985', 'eer_iom', 'cunningham', 'tinsley']);
    expect(protocols.some(({ recommended }) => recommended)).toBe(false);
  });
});

describe('Mathematical Shielding (Edge Cases & Validation)', () => {
  it('gracefully handles missing or invalid leanMass for athlete protocols', () => {
    expect(calculateCunningham("")).toBeNull();
    expect(calculateCunningham(null)).toBeNull();
    expect(calculateCunningham(-10)).toBeNull();
    expect(calculateTinsley(80, "texto")).toBeNull();
    expect(calculateTinsley(80, 0)).toBeNull();
  });

  it('coerces valid strings to numbers for calculations', () => {
    expect(calculateCunningham("60")).toBe(500 + (22 * 60));
    expect(calculateTinsley("80", "60")).toBe(284 + (25.9 * 60));
  });

  it('returns null when general attributes like weight or height are invalid', () => {
    const mifflinBad = calculateAllProtocols({ weight: "NaN", height: 180, age: 30, gender: 'M' });
    expect(mifflinBad.every(p => p.bmr === null && (p.get === null || p.get === undefined))).toBe(true);
  });
});

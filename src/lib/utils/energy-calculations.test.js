import { describe, expect, it } from 'vitest';
import { calculateAllProtocols, calculateTinsley } from './energy-calculations';

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

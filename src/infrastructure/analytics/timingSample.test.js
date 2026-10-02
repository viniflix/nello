import { describe, expect, it } from 'vitest';
import { createTimingSampler } from './timingSample';
describe('representative timing sampling', () => {
  it('retains approximately 10% of sessions independently of their operation volume', () => {
    const sample = createTimingSampler();
    let retained = 0;
    for (let i = 0; i < 1000; i++) if (sample({ session: `synthetic-${i}`, operation: 'dashboard_stats', duration: 100, now: 0 })) retained++;
    expect(retained).toBeGreaterThanOrEqual(80);
    expect(retained).toBeLessThanOrEqual(120);
  });
  it('bounds repeated slow loads per operation, preserves separate sessions and expires', () => {
    const sample = createTimingSampler();
    expect(sample({ session: 'a', operation: 'food_search', duration: 2400, now: 0 })).toEqual({ sample_rate: 1, sample_type: 'slow' });
    expect(sample({ session: 'a', operation: 'food_search', duration: 2400, now: 59999 })).toBeNull();
    expect(sample({ session: 'b', operation: 'food_search', duration: 2400, now: 59999 })).not.toBeNull();
    expect(sample({ session: 'a', operation: 'food_search', duration: 2400, now: 60000 })).not.toBeNull();
  });
  it('rejects missing sessions, arbitrary text and invalid duration', () => {
    const sample = createTimingSampler();
    for (const input of [{session:null,operation:'x',duration:3},{session:'a',operation:'private free text',duration:3},{session:'a',operation:'x',duration:NaN},{session:'a',operation:'x',duration:-1}]) expect(sample(input)).toBeNull();
  });
});

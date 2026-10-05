import { describe, expect, it } from 'vitest';
import { sourceFreshness, operationalCount, validateBriefing } from './sourceState';
describe('administrative source truth', () => {
  it('does not turn missing, negative or malformed counts into zero', () => {
    for (const value of [undefined, null, '', '2', -1, NaN, Infinity]) expect(operationalCount(value)).toBe('—');
    expect(operationalCount(0)).toBe('0');
  });
  it('uses the data timestamp, not request receipt time', () => {
    const now = Date.parse('2026-10-05T12:00:00Z');
    expect(sourceFreshness({ generated_at: '2026-10-05T12:00:00Z', data_through: '2026-10-05T11:00:00Z' }, now).state).toBe('stale');
    expect(sourceFreshness({ generated_at: '2026-10-05T12:00:00Z' }, now).state).toBe('fresh');
    expect(sourceFreshness({ generated_at: '2026-10-05T13:00:00Z' }, now).state).toBe('unknown');
  });
  it('rejects drift and unsafe queue destinations', () => {
    const valid = { schema_version: 1, counts: {}, generated_at: '2026-10-05T12:00:00Z', invariants: [], queues: [{ key: 'privacy', count: 1, route: '/admin/privacy' }] };
    expect(validateBriefing(valid)).toBe(valid);
    expect(() => validateBriefing({ ...valid, queues: [{ key: 'privacy', count: 1, route: 'https://evil.example' }] })).toThrow();
    expect(() => validateBriefing({ ...valid, schema_version: 2 })).toThrow();
  });
});

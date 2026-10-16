import { describe, expect, it } from 'vitest';
import { laboratoryNumber, laboratoryPayload, laboratoryTrend, laboratoryUnit } from './laboratory';

describe('laboratory values preserve meaning across consumers', () => {
  it('retains small canonical decimals and scientific notation without accepting prefixes', () => {
    expect(laboratoryNumber('2,5e-3')).toEqual({ kind: 'number', value: 0.0025 });
    const payload = laboratoryPayload({ test_value: '0.0000001' });
    expect(laboratoryNumber(payload.test_value).value).toBe(0.0000001);
    for (const value of [true, [], {}, '12 mg', '1.000,1', Number.POSITIVE_INFINITY, '9007199254740992']) expect(laboratoryNumber(value).kind).toBe('invalid');
  });
  it('does not fabricate a stable trend from missing data or compare incompatible units', () => {
    const latest = { test_value: '5,5', test_unit: 'mmol/L' };
    expect(laboratoryTrend(latest, null)).toMatchObject({ direction: 'unknown', delta: null });
    expect(laboratoryTrend(latest, { test_value: null, test_unit: 'mmol/L' }).delta).toBeNull();
    expect(laboratoryTrend(latest, { test_value: 100, test_unit: 'mg/dL' }).delta).toBeNull();
    expect(laboratoryTrend(latest, { test_value: '5,0', test_unit: 'mmol/l' })).toMatchObject({ direction: 'up', delta: 0.5 });
  });
  it('normalizes typography without collapsing meaningful numerator case or converting units', () => {
    expect(laboratoryUnit('µmol / L')).toBe(laboratoryUnit('μmol/l'));
    expect(laboratoryUnit('mmol/L')).not.toBe(laboratoryUnit('Mmol/L'));
  });
  it('does not mutate prior snapshots or acknowledge unsupported removal as a successful revision', () => {
    const original = { test_value: '5', reference_min: 2, reference_max: 10, reference_snapshot: { recorded: 'unchanged' } };
    const patch = { test_value: '5,5' };
    expect(laboratoryPayload(patch, original)).toMatchObject({ test_value: '5.5', status: 'normal' });
    expect(patch).toEqual({ test_value: '5,5' });
    expect(original.reference_snapshot).toEqual({ recorded: 'unchanged' });
    expect(() => laboratoryPayload({ reference_min: '' }, original)).toThrow(/Não é possível retirar/);
  });
});

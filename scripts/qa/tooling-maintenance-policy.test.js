import { describe, it, expect } from 'vitest';
import { checkToolingMaintenance } from './tooling-maintenance-policy.mjs';

const pkg = { devDependencies: { eslint: '9.39.5' } };
const policy = { schemaVersion: 1, reviewBy: '2026-10-23T00:00:00Z', packages: { eslint: { version: '9.39.5', status: 'end_of_life', reason: 'Peer compatibility pending', source: 'official-source' } } };
describe('explicit temporary maintenance review', () => {
  it('keeps the unsupported finding open and blocks expiration independently of npm audit', () => {
    expect(checkToolingMaintenance(pkg, policy, new Date('2026-10-10'))).toMatchObject({ supportedToolingCertified: false, pending: ['eslint'] });
    expect(() => checkToolingMaintenance(pkg, policy, new Date('2026-10-23'))).toThrow('expired');
  });
  it('rejects invalid deadlines, version changes and incomplete justifications', () => {
    expect(() => checkToolingMaintenance(pkg, { ...policy, reviewBy: 'invalid' })).toThrow('expired');
    expect(() => checkToolingMaintenance({ devDependencies: { eslint: '10.12.0' } }, policy)).toThrow('changed');
    expect(() => checkToolingMaintenance(pkg, { ...policy, packages: { eslint: { version: '9.39.5' } } })).toThrow('changed');
  });
});

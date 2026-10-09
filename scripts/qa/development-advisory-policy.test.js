import { describe, expect, it } from 'vitest';
import { checkDevelopmentAdvisories } from './development-advisory-policy.mjs';

const fixture = () => ({
  audit: { auditReportVersion: 2, metadata: { vulnerabilities: { total: 2, info: 0, low: 0, moderate: 0, high: 2, critical: 0 } }, vulnerabilities: {
    braces: { name: 'braces', severity: 'high', nodes: ['node_modules/braces'], via: [{ url: 'reviewed-advisory' }] },
    compiler: { name: 'compiler', severity: 'high', nodes: ['node_modules/compiler'], via: ['braces'] },
  } },
  lock: { packages: { 'node_modules/braces': { dev: true, version: '3.0.3' }, 'node_modules/compiler': { dev: true, version: '1.0.0' } } },
  policy: { advisory: 'reviewed-advisory', reviewBy: '2026-10-23T00:00:00Z', packages: {
    braces: { severity: 'high', nodes: { 'node_modules/braces': '3.0.3' }, via: ['reviewed-advisory'] },
    compiler: { severity: 'high', nodes: { 'node_modules/compiler': '1.0.0' }, via: ['braces'] },
  } },
});
const run = ({ audit, lock, policy }, now = new Date('2026-10-09')) => checkDevelopmentAdvisories(audit, lock, policy, now);
describe('development security review gate', () => {
  it('distinguishes audit findings from proof of an upstream patch', () => {
    const f = fixture();
    expect(run(f)).toMatchObject({ completeAuditClear: false, upstreamPatchVerified: false, reviewedDevelopmentWarnings: ['braces', 'compiler'] });
    f.audit.vulnerabilities = {};
    f.audit.metadata.vulnerabilities.high = 0;
    f.audit.metadata.vulnerabilities.total = 0;
    expect(run(f)).toMatchObject({ completeAuditClear: true, upstreamPatchVerified: false, reviewedDevelopmentWarnings: [] });
  });
  it('blocks a new advisory even on a reviewed package', () => {
    const f = fixture(); f.audit.vulnerabilities.braces.via.push({ url: 'new-advisory' });
    expect(() => run(f)).toThrow('cause changed');
    f.audit.vulnerabilities.other = { name: 'other' };
    delete f.audit.vulnerabilities.braces;
    expect(() => run(f)).toThrow();
  });
  it('accepts omission of redundant reviewed edges without allowing a new cause', () => {
    const f = fixture(); f.policy.packages.compiler.via.push('redundant-reviewed-edge');
    expect(run(f).completeAuditClear).toBe(false);
    f.audit.vulnerabilities.compiler.via.push('unexpected-edge');
    expect(() => run(f)).toThrow('cause changed');
  });
  it('blocks runtime exposure, version changes and new nested paths', () => {
    for (const mutate of [
      f => { f.lock.packages['node_modules/braces'].dev = false; },
      f => { f.lock.packages['node_modules/braces'].version = '3.0.4'; },
      f => { f.audit.vulnerabilities.braces.nodes.push('node_modules/other/node_modules/braces'); },
    ]) { const f = fixture(); mutate(f); expect(() => run(f)).toThrow(); }
  });
  it('fails closed on expired review, malformed report and broken or cyclic causes', () => {
    expect(() => run(fixture(), new Date('2026-10-23'))).toThrow('expired');
    const f = fixture(); f.audit = {}; expect(() => run(f)).toThrow('Complete');
    const incomplete = fixture(); incomplete.audit.metadata.vulnerabilities.total = 0;
    expect(() => run(incomplete)).toThrow('Complete');
    const broken = fixture(); broken.audit.vulnerabilities.compiler.via = ['missing'];
    broken.policy.packages.compiler.via = ['missing']; expect(() => run(broken)).toThrow('Incomplete');
    const cyclic = fixture(); cyclic.audit.vulnerabilities.braces.via = ['compiler'];
    cyclic.policy.packages.braces.via = ['compiler']; expect(() => run(cyclic)).toThrow('Cyclic');
  });
});

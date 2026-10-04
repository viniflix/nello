import { it, expect } from 'vitest';
import { certifySystem } from './certification.mjs';

const sha = 'a'.repeat(40);
function fixture() {
  const names = ['Quality gate', 'Backend reconstruction', 'Production observation'];
  const checks = ['edge-results/results.json', 'edge-boundary-results/result.json', 'storage-results/result.json',
    'realtime-results/result.json', 'forward-results/result.json', 'auth-onboarding-results/result.json',
    'auth-captcha-results/result.json', 'wave09-results/result.json', 'wave10-results/pdf.json',
    'wave12-results/performance.json', 'wave13-results/performance.json', 'fault-results/result.json', 'fault-results/css-gate/result.json'];
  return {
    sha,
    proof: { sha, passed: true, capturedAt: new Date().toISOString(), deployment: 'dpl_fixture',
      workflows: names.map((name, id) => ({ id: id + 1, name, conclusion: 'success' })),
      catalogDiff: 0, sql: 49, mathCases: 208, checks,
      browser: { expected: 109, unexpected: 0, flaky: 0, skipped: 0 }, smoke: true,
      observation: { passed: true, environment: 'production' },
      analytics: { release: sha, state: 'ingestion_verified', probeCount: 1, invalidReleaseCount: 0, signals: [] },
      budget: { state: 'covered', fresh: true, coverageGap: false, alerts: [] } },
    workflows: { sha, runs: names.map((name, id) => ({ id: id + 1, name, sha, status: 'completed', conclusion: 'success',
      jobs: [{ status: 'completed', conclusion: 'success', steps: [{ status: 'completed', conclusion: 'success' }] }] })) },
    recovery: { passed: true, productionData: false, clinicalMatched: true, catalogPoliciesGrantsFunctionsMatched: true,
      authIdentityAndPasswordsMatched: true, actualAuthLogin: true, actualSessionValidation: true, actualRestRead: true,
      restoredRlsIsolation: true, databaseOutageDetected: true, encryptedBackupIntegrity: true, wrongKeyRejected: true,
      publicTablesCompared: 1, storageObjectsCompared: 1, rtoMs: 60000, rpoMs: 1000 },
    rollback: { passed: true, productionData: false, functions: { actualEdgeHttp: true, baselineVerified: true,
      incompatibleVersionDetected: true, restoredVersionVerified: true },
    migration: { clonedDatabase: true, applied: true, reverted: true, originalRowsMatched: true } },
    findings: Array.from({ length: 158 }, (_, id) => ({ id: `QA-${id}`, severity: 'high', status: 'CORRECTED',
      ownerWave: 1, responsible: 'Synthetic owner', decision: 'Verified synthetic evidence', evidence: ['qa/report'] })),
    provenance: { backendSha: sha, observationSha: sha, backendArtifact: `backend-reconstruction-${sha}`,
      backendArchiveSha256: 'b'.repeat(64), observationArchiveSha256: 'c'.repeat(64) },
  };
}

it('certifies all seven layers without asserting production PITR, 30-day SLO or adoption', () => {
  expect(certifySystem(fixture())).toMatchObject({ technicalPassed: true, certified: true, blockingFindings: [], layers: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'] });
  expect(certifySystem(fixture()).limitations).toHaveLength(3);
});
it('keeps an unaccepted high risk open even when every technical gate passes', () => {
  const input = fixture(); input.findings[0].status = 'OPEN';
  expect(certifySystem(input)).toMatchObject({ technicalPassed: true, certified: false, blockingFindings: ['QA-0'] });
  input.findings[0].status = 'MITIGATED';
  expect(certifySystem(input).certified).toBe(false);
  input.findings[0].status = 'DECISION_APPROVED';
  expect(certifySystem(input)).toMatchObject({ certified: true, findingCounts: { DECISION_APPROVED: 1, CORRECTED: 157 } });
});
it('allows a measurable medium backlog without presenting it as corrected', () => {
  const input = fixture(); input.findings[0].severity = 'medium'; input.findings[0].status = 'OPEN';
  expect(certifySystem(input)).toMatchObject({ certified: true, findingCounts: { OPEN: 1, CORRECTED: 157 } });
});
it.each([
  ['commit', input => { input.proof.sha = 'd'.repeat(40); }],
  ['archive binding', input => { input.provenance.backendSha = 'd'.repeat(40); }],
  ['missing archive digest', input => { delete input.provenance.backendArchiveSha256; }],
  ['old observation', input => { input.proof.analytics.release = 'd'.repeat(40); }],
  ['unfinished job', input => { input.workflows.runs[1].jobs[0].status = 'in_progress'; }],
  ['skipped step', input => { input.workflows.runs[1].jobs[0].steps[0].conclusion = 'skipped'; }],
  ['missing workflow', input => { input.workflows.runs.pop(); }],
  ['stale proof', input => { input.proof.capturedAt = '2020-01-01T00:00:00Z'; }],
  ['empty browser matrix', input => { input.proof.browser.expected = 0; }],
  ['flaky browser', input => { input.proof.browser.flaky = 1; }],
  ['missing consumer', input => { input.proof.checks.pop(); }],
  ['empty SQL matrix', input => { input.proof.sql = 0; }],
  ['catalog drift', input => { input.proof.catalogDiff = 1; }],
  ['clinical discrepancy', input => { input.recovery.clinicalMatched = false; }],
  ['recovery exposure', input => { input.recovery.restoredRlsIsolation = false; }],
  ['empty storage restore', input => { input.recovery.storageObjectsCompared = 0; }],
  ['RPO over budget', input => { input.recovery.rpoMs = 900001; }],
  ['production data in QA', input => { input.recovery.productionData = true; }],
  ['monitor gap', input => { input.proof.budget.coverageGap = true; }],
  ['rollback not exercised', input => { delete input.rollback; }],
  ['migration rollback damaged rows', input => { input.rollback.migration.originalRowsMatched = false; }],
  ['analytics silent', input => { input.proof.analytics.probeCount = 0; }],
  ['duplicate finding', input => { input.findings[1].id = input.findings[0].id; }],
  ['owner absent', input => { delete input.findings[0].responsible; }],
  ['accepted without evidence', input => { input.findings[0].status = 'DECISION_APPROVED'; input.findings[0].evidence = []; }],
])('blocks certification with %s', (_, corrupt) => {
  const input = fixture(); corrupt(input); expect(() => certifySystem(input)).toThrow('Certification blocked');
});

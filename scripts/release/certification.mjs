import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requiredChecks = [
  'edge-results/results.json', 'edge-boundary-results/result.json',
  'storage-results/result.json', 'realtime-results/result.json',
  'forward-results/result.json', 'auth-onboarding-results/result.json',
  'auth-captcha-results/result.json', 'wave09-results/result.json',
  'wave10-results/pdf.json', 'wave12-results/performance.json',
  'wave13-results/performance.json', 'fault-results/result.json',
  'fault-results/css-gate/result.json',
];
const requireGate = (condition, name) => { if (!condition) throw Error(`Certification blocked: ${name}`); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// Technical evidence is assembled from the downloaded, exact-SHA provider
// artifacts. This final gate does not turn an accepted risk into a fixed defect.
export function certifySystem({ sha, proof, workflows, recovery, rollback, findings, provenance }, now = Date.now()) {
  requireGate(/^[a-f0-9]{40}$/.test(sha) && proof?.sha === sha && proof.passed === true, 'release SHA');
  const age = now - Date.parse(proof.capturedAt);
  requireGate(Number.isFinite(age) && age >= -60000 && age <= 30 * 60000, 'fresh production proof');
  requireGate(workflows?.sha === sha && Array.isArray(workflows.runs), 'workflow provenance');
  for (const name of ['Quality gate', 'Backend reconstruction', 'Production observation']) {
    const run = workflows.runs.find(item => item.name === name && item.sha === sha && item.conclusion === 'success');
    requireGate(run?.status === 'completed' && Number.isSafeInteger(run.id)
      && run.jobs?.length > 0 && run.jobs.every(job => job.status === 'completed' && job.conclusion === 'success'
        && job.steps?.length > 0 && job.steps.every(step => step.status === 'completed' && step.conclusion === 'success')), name);
    requireGate(proof.workflows?.some(item => item.id === run.id && item.name === name && item.conclusion === 'success'), `${name} proof binding`);
  }
  requireGate(workflows.runs.every(run => run.sha === sha && run.status === 'completed' && run.conclusion === 'success'), 'all workflows');
  requireGate(provenance?.backendSha === sha && provenance.observationSha === sha
    && provenance.backendArtifact === `backend-reconstruction-${sha}`
    && /^[a-f0-9]{64}$/.test(provenance.backendArchiveSha256)
    && /^[a-f0-9]{64}$/.test(provenance.observationArchiveSha256), 'artifact provenance');
  requireGate(proof.catalogDiff === 0 && proof.sql >= 49 && proof.mathCases >= 208, 'database and clinical references');
  requireGate(proof.browser?.expected >= 109 && proof.browser.unexpected === 0
    && proof.browser.flaky === 0 && proof.browser.skipped === 0, 'complete browser matrix');
  requireGate(requiredChecks.every(check => proof.checks?.includes(check)), 'V3–V6 consumer evidence');
  requireGate(recovery?.passed === true && recovery.productionData === false
    && ['clinicalMatched', 'catalogPoliciesGrantsFunctionsMatched', 'authIdentityAndPasswordsMatched',
      'actualAuthLogin', 'actualSessionValidation', 'actualRestRead', 'restoredRlsIsolation',
      'databaseOutageDetected', 'encryptedBackupIntegrity', 'wrongKeyRejected'].every(key => recovery[key] === true)
    && recovery.publicTablesCompared > 0 && recovery.storageObjectsCompared > 0
    && Number.isFinite(recovery.rtoMs) && recovery.rtoMs >= 0 && recovery.rtoMs <= 60 * 60000
    && Number.isFinite(recovery.rpoMs) && recovery.rpoMs >= 0 && recovery.rpoMs <= 15 * 60000, 'synthetic recovery RTO/RPO');
  requireGate(rollback?.passed === true && rollback.productionData === false
    && rollback.functions?.actualEdgeHttp === true && rollback.functions.baselineVerified === true
    && rollback.functions.incompatibleVersionDetected === true && rollback.functions.restoredVersionVerified === true
    && rollback.migration?.clonedDatabase === true && rollback.migration.applied === true
    && rollback.migration.reverted === true && rollback.migration.originalRowsMatched === true, 'Edge and compatible schema rollback');
  requireGate(/^dpl_[a-zA-Z0-9]+$/.test(proof.deployment) && proof.smoke === true
    && proof.observation?.passed === true && proof.observation.environment === 'production', 'canonical production smoke');
  requireGate(proof.analytics?.release === sha && proof.analytics.state === 'ingestion_verified'
    && proof.analytics.probeCount > 0 && proof.analytics.invalidReleaseCount === 0
    && Array.isArray(proof.analytics.signals) && proof.analytics.signals.length === 0, 'analytics pipeline');
  requireGate(proof.budget?.state === 'covered' && proof.budget.fresh === true && proof.budget.coverageGap === false
    && Array.isArray(proof.budget.alerts) && proof.budget.alerts.length === 0, 'availability budget');
  requireGate(Array.isArray(findings) && findings.length >= 158
    && new Set(findings.map(item => item.id)).size === findings.length, 'complete finding inventory');
  const statuses = ['CORRECTED', 'MITIGATED', 'DECISION_APPROVED', 'OPEN'];
  requireGate(findings.every(item => nonempty(item.id) && ['critical', 'high', 'medium', 'low'].includes(item.severity)
    && statuses.includes(item.status) && nonempty(item.responsible)
    && Number.isInteger(item.ownerWave) && item.ownerWave >= 0 && item.ownerWave <= 16), 'finding ownership');
  requireGate(findings.filter(item => item.status !== 'OPEN').every(item => nonempty(item.decision)
    && Array.isArray(item.evidence) && item.evidence.length > 0 && item.evidence.every(nonempty)), 'finding closure evidence');
  const blockingFindings = findings.filter(item => ['critical', 'high'].includes(item.severity)
    && !['CORRECTED', 'DECISION_APPROVED'].includes(item.status)).map(item => item.id);
  return {
    schemaVersion: 1, sha, deployment: proof.deployment, capturedAt: new Date(now).toISOString(),
    technicalPassed: true, certified: blockingFindings.length === 0, blockingFindings,
    layers: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'],
    findingCounts: Object.fromEntries(statuses.map(status => [status, findings.filter(item => item.status === status).length])),
    syntheticRecovery: { rtoMs: recovery.rtoMs, rpoMs: recovery.rpoMs, storageObjects: recovery.storageObjectsCompared },
    limitations: ['Synthetic recovery does not certify production PITR or provider retention',
      'Short-window availability does not certify the 30-day SLO', 'Synthetic journeys do not prove external adoption'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  const result = certifySystem(input);
  writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.certified) process.exitCode = 1;
}

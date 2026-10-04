// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { COPY_SCOPES, clinicalCustodyDate, reviewPrivacyEvidence } from './privacy-evidence.mjs';
const now = Date.parse('2026-10-04T18:00:00Z');
const requestId = '10000000-0000-4000-8000-000000000018';
const fixture = () => {
  const files = new Map();
  const copies = COPY_SCOPES.map(scope => {
    const file = `${scope}.json`;
    const receipt = Buffer.from(JSON.stringify({ requestId, scope, environment: 'synthetic', verifiedAt: new Date(now).toISOString(),
      operationId: 'synthetic-check', source: 'isolated-fixture', kind: 'post_operation_check', liveCount: 0, backupState: 'retired', recoveryExclusionVerified: true, accessRestricted: true, clinicalInventoryPreserved: true }));
    files.set(file, receipt);
    return { scope, classification: 'non_clinical', action: 'erase', legalBasis: 'Synthetic erasure decision', receipt: { file, sha256: createHash('sha256').update(receipt).digest('hex') } };
  });
  copies[0] = { ...copies[0], scope: 'database', classification: 'clinical', action: 'retain', legalBasis: 'Lei 13.787/2018 art. 6', lastClinicalRecordDate: '2026-10-04', retainUntil: '2046-10-04' };
  return { manifest: { schemaVersion: 1, environment: 'synthetic', requestId, copies }, read: file => files.get(file), files };
};
describe('Cross-provider erasure evidence rehearsal', () => {
  it('preserves clinical custody and cannot certify real provider deletion using fictitious receipts', () => {
    const { manifest, read } = fixture();
    const result = reviewPrivacyEvidence(manifest, read, now);
    expect(result.evidenceComplete).toBe(true);
    expect(result.providerDeletionCertified).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.results[0]).toMatchObject({ state: 'receipt_checked', minimumCustodyDate: '2046-10-04', automaticPurge: false });
  });
  it('does not infer erasure when a provider receipt is absent', () => {
    const { manifest, read } = fixture(); delete manifest.copies[4].receipt;
    expect(reviewPrivacyEvidence(manifest, read, now).evidenceComplete).toBe(false);
  });
  it('blocks clinical and mixed copy erasure regardless of receipt', () => {
    const { manifest, read } = fixture(); manifest.copies[2].classification = 'mixed';
    expect(() => reviewPrivacyEvidence(manifest, read, now)).toThrow('custody');
  });
  it('rejects a shorter custody period and invalid calendar dates', () => {
    const { manifest, read } = fixture(); manifest.copies[0].retainUntil = '2046-10-03';
    expect(() => reviewPrivacyEvidence(manifest, read, now)).toThrow('minimum');
    expect(() => clinicalCustodyDate('2026-02-30')).toThrow('Invalid');
    expect(clinicalCustodyDate('2080-02-29')).toBe('2100-02-28');
  });
  it.each(['foreign', 'future', 'stale', 'corrupt', 'accepted_only', 'backup_pending'])('rejects false completion: %s', kind => {
    const { manifest, read, files } = fixture(); const copy = manifest.copies[3];
    const receipt = JSON.parse(read(copy.receipt.file).toString());
    if (kind === 'foreign') receipt.environment = 'production';
    if (kind === 'future') receipt.verifiedAt = new Date(now + 1).toISOString();
    if (kind === 'stale') receipt.verifiedAt = new Date(now - 86400001).toISOString();
    if (kind === 'accepted_only') receipt.kind = 'api_accepted';
    if (kind === 'backup_pending') receipt.backupState = 'expiration_pending';
    files.set(copy.receipt.file, Buffer.from(JSON.stringify(receipt)));
    if (kind !== 'corrupt') copy.receipt.sha256 = createHash('sha256').update(read(copy.receipt.file)).digest('hex');
    else files.set(copy.receipt.file, Buffer.from('modified'));
    if (['accepted_only', 'backup_pending'].includes(kind)) expect(reviewPrivacyEvidence(manifest, read, now).evidenceComplete).toBe(false);
    else expect(() => reviewPrivacyEvidence(manifest, read, now)).toThrow();
  });
  it('requires every copy scope exactly once, including private backups', () => {
    const { manifest, read } = fixture(); manifest.copies[7] = manifest.copies[6];
    expect(() => reviewPrivacyEvidence(manifest, read, now)).toThrow('duplicate');
  });
  it('does not leak private malformed input through CLI diagnostics', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nello-privacy-synthetic-'));
    try {
      const file = join(directory, 'synthetic.json');
      writeFileSync(file, '{"PRIVATE_SENTINEL": invalid');
      const result = spawnSync(process.execPath, ['scripts/operations/privacy-evidence.mjs', file, join(directory, 'report.json')], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).not.toContain('PRIVATE_SENTINEL');
      expect(result.stderr).toContain('No operation executed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

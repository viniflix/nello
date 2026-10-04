import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COPY_SCOPES, reviewPrivacyEvidence } from './privacy-evidence.mjs';
import { planStorageRecovery } from './storage-recovery.mjs';

export function rehearsePrivacy(privateDirectory, now = Date.now()) {
  const directory = resolve(privateDirectory);
  mkdirSync(directory, { mode: 0o700 }); // Never overwrite an earlier trial.
  const save = (file, value) => writeFileSync(resolve(directory, file), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  const requestId = '10000000-0000-4000-8000-000000000018';
  const copies = COPY_SCOPES.map(scope => {
    const file = `${scope}.synthetic.json`;
    save(file, { requestId, scope, environment: 'synthetic', verifiedAt: new Date(now).toISOString(),
      operationId: 'fictitious-operation', source: 'synthetic-fixture-only', kind: 'post_operation_check',
      liveCount: 0, backupState: 'retired', recoveryExclusionVerified: true, accessRestricted: true, clinicalInventoryPreserved: true });
    return { scope, classification: 'non_clinical', action: 'erase', legalBasis: 'Synthetic rehearsal only',
      receipt: { file, sha256: createHash('sha256').update(readFileSync(resolve(directory, file))).digest('hex') } };
  });
  copies[0] = { ...copies[0], classification: 'clinical', action: 'retain', legalBasis: 'Lei 13.787/2018 art. 6',
    lastClinicalRecordDate: '2026-10-04', retainUntil: '2046-10-04' };
  const manifest = { schemaVersion: 1, environment: 'synthetic', requestId, copies };
  const reader = file => readFileSync(resolve(directory, file));
  save('manifest.synthetic.json', manifest);
  const complete = reviewPrivacyEvidence(manifest, reader, now);
  assert.equal(complete.evidenceComplete, true);
  assert.equal(complete.providerDeletionCertified, false);
  save('complete.synthetic.json', complete);
  const incomplete = structuredClone(manifest);
  delete incomplete.copies.find(copy => copy.scope === 'provider_backups').receipt;
  assert.equal(reviewPrivacyEvidence(incomplete, reader, now).evidenceComplete, false);
  save('incomplete.synthetic.json', reviewPrivacyEvidence(incomplete, reader, now));
  const unsafe = structuredClone(manifest);
  unsafe.copies[0].action = 'erase';
  assert.throws(() => reviewPrivacyEvidence(unsafe, reader, now), /custody/);
  const erased = { bucket_id: 'avatars', object_path: 'synthetic-user/erased.png' };
  const retained = { bucket_id: 'clinical-attachments', object_path: 'synthetic-record/retained.pdf' };
  const sourceProjectRef = 'x'.repeat(20); // Fictional project, never a network destination.
  const recovery = planStorageRecovery([erased, retained], { sourceProjectRef, capturedAt: new Date(now).toISOString(), complete: true, exclusions: [erased] }, sourceProjectRef, now);
  assert.deepEqual(recovery.allowed, [retained]);
  assert.deepEqual(recovery.excluded, [erased]);
  save('recovery.synthetic.json', recovery);
  const result = { capturedAt: new Date(now).toISOString(), passed: true, environment: 'synthetic', checks: 4,
    productionData: false, remoteCalls: 0, clinicalErasure: false, providerDeletionCertified: false };
  save('result.synthetic.json', result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error('Usage: privacy-rehearsal.mjs new-private-directory');
  console.log(JSON.stringify(rehearsePrivacy(process.argv[2])));
}

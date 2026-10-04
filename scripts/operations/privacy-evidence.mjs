import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export const COPY_SCOPES = ['database', 'auth', 'storage', 'sentry', 'posthog', 'email', 'provider_backups', 'private_backups'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;

// Minimum custody date is a calendar boundary, not permission to purge.
export function clinicalCustodyDate(lastRecordAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastRecordAt || '')) throw Error('Clinical record date required');
  const date = new Date(`${lastRecordAt}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== lastRecordAt) throw Error('Invalid clinical record date');
  const year = date.getUTCFullYear() + 20;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Receipt validation is evidence organization, not remote deletion or legal certification. */
export function reviewPrivacyEvidence(manifest, readEvidence, now = Date.now()) {
  if (manifest?.schemaVersion !== 1 || !UUID.test(manifest.requestId || '')
    || !['synthetic', 'production'].includes(manifest.environment)
    || !Array.isArray(manifest.copies) || manifest.copies.length !== COPY_SCOPES.length) throw Error('Complete privacy copy inventory required');
  const seen = new Set();
  const results = manifest.copies.map(copy => {
    if (!COPY_SCOPES.includes(copy.scope) || seen.has(copy.scope)) throw Error('Unknown or duplicate copy scope');
    seen.add(copy.scope);
    if (!['clinical', 'non_clinical', 'mixed'].includes(copy.classification)) throw Error('Copy classification required');
    if (['clinical', 'mixed'].includes(copy.classification) && copy.action === 'erase') throw Error('Clinical custody cannot enter erasure');
    if (!['retain', 'erase', 'not_applicable'].includes(copy.action)) throw Error('Explicit copy decision required');
    if (!copy.legalBasis?.trim()) throw Error('Copy legal basis required');
    let minimumCustodyDate;
    if (copy.action === 'retain' && ['clinical', 'mixed'].includes(copy.classification)) {
      minimumCustodyDate = clinicalCustodyDate(copy.lastClinicalRecordDate);
      clinicalCustodyDate(copy.retainUntil);
      if (copy.retainUntil < minimumCustodyDate) throw Error('Clinical custody shorter than minimum');
    }
    if (!copy.receipt || !HASH.test(copy.receipt.sha256 || '')) return { scope: copy.scope, state: 'evidence_missing' };
    const bytes = readEvidence(copy.receipt.file);
    if (createHash('sha256').update(bytes).digest('hex') !== copy.receipt.sha256) throw Error('Evidence checksum mismatch');
    const receipt = JSON.parse(bytes.toString());
    const verifiedAt = Date.parse(receipt.verifiedAt);
    if (receipt.requestId !== manifest.requestId || receipt.scope !== copy.scope || receipt.environment !== manifest.environment
      || !Number.isFinite(verifiedAt) || verifiedAt > now || now - verifiedAt > 24 * 60 * 60 * 1000) throw Error('Foreign, stale or future copy evidence');
    if (!receipt.operationId || !receipt.source || receipt.kind !== 'post_operation_check') return { scope: copy.scope, state: 'evidence_missing' };
    // A provider policy, accepted API call or elapsed deadline is never a negative search.
    if (copy.action === 'erase' && (receipt.liveCount !== 0 || receipt.backupState !== 'retired'
      || receipt.recoveryExclusionVerified !== true)) return { scope: copy.scope, state: 'verification_pending' };
    if (copy.action === 'not_applicable' && receipt.observedCount !== 0) return { scope: copy.scope, state: 'verification_pending' };
    if (copy.action === 'retain' && receipt.accessRestricted !== true) return { scope: copy.scope, state: 'verification_pending' };
    if (minimumCustodyDate && receipt.clinicalInventoryPreserved !== true) return { scope: copy.scope, state: 'verification_pending' };
    return { scope: copy.scope, state: 'receipt_checked', ...(minimumCustodyDate ? { minimumCustodyDate, automaticPurge: false } : {}) };
  });
  return { schemaVersion: 1, environment: manifest.environment, generatedAt: new Date(now).toISOString(),
    evidenceComplete: results.every(item => ['retained', 'receipt_checked'].includes(item.state)),
    providerDeletionCertified: false, executed: false, results,
    limitation: 'Local checks validate inventory and receipt integrity. Authenticity and provider backup retirement require independent provider verification. No clinical data is deleted.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: privacy-evidence.mjs private-manifest.json private-report.json');
  const directory = realpathSync(resolve(input, '..'));
  const readEvidence = file => {
    if (typeof file !== 'string' || isAbsolute(file) || file.includes('\\')) throw Error('Relative evidence file required');
    const path = realpathSync(resolve(directory, file)), local = relative(directory, path);
    if (local === '..' || local.startsWith('../') || local.startsWith('..\\') || isAbsolute(local)) throw Error('Evidence outside private bundle');
    return readFileSync(path);
  };
  const report = reviewPrivacyEvidence(JSON.parse(readFileSync(input, 'utf8')), readEvidence);
  writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ evidenceComplete: report.evidenceComplete, providerDeletionCertified: false, executed: false }));
  if (!report.evidenceComplete) process.exitCode = 1;
}

# Copy retention and erasure evidence

Clinical custody and account erasure are different operations. `copy-policy.json` records public sources and conservative boundaries. Custody dates are minimum calendar dates, never automatic permission to destroy a record; legal holds and professional requirements may extend them.

The existing administrative RPC requires a legal basis for a final response and keeps immutable request events. Its Storage queue targets approved avatars only. `storage-maintenance` removes bytes through the provider API; `finish_storage_erasure_work` verifies metadata absence. Backup acknowledgment requires an operator-provided evidence hash. This **does not prove** erasure of Auth, database relations, Sentry, PostHog, email, hosting logs or provider backups.

The UI therefore keeps erasure/anonymization in progress until operational verification is available, while permitting justified legal-custody responses. This UI guard is not an authorization boundary: direct privileged RPC calls remain governed by existing server controls. Full cross-provider server enforcement and independently verified provider receipts remain an open requirement. Do not claim AL-18 closed.

## Private evidence bundle

Run `node scripts/operations/privacy-evidence.mjs private-manifest.json private-report.json`. The command performs no remote call and no deletion. It refuses overwriting the report and outputs only aggregate state.

Manifest: `schemaVersion:1`, UUID `requestId`, `environment:synthetic|production`, and exactly one entry per scope in `COPY_SCOPES`. Each entry has `scope`, `classification:clinical|non_clinical|mixed`, `action:retain|erase|not_applicable` and `legalBasis`. Clinical retention requires `lastClinicalRecordDate` and `retainUntil`. Other entries require `receipt:{file,sha256}` pointing inside the private bundle.

Receipts bind `requestId`, `scope`, `environment`, `verifiedAt` (at most 24 hours old), `operationId`, `source`, and `kind:post_operation_check`. Erasure requires `liveCount:0`, `backupState:retired`, `recoveryExclusionVerified:true`; not-applicable requires `observedCount:0`; nonclinical retention requires `accessRestricted:true`. An accepted API request, missing receipt, pending backup expiry or policy screenshot cannot complete the evidence set. Recheck when a provider finishes asynchronously.

Clinical retention also requires a post-operation receipt with `accessRestricted:true` and `clinicalInventoryPreserved:true`; a proposed custody date alone does not prove preservation.

Checksums detect changed evidence, **not forged receipts**. An operator must independently verify receipts with the provider. Reports always set `providerDeletionCertified:false` and `executed:false`. Synthetic receipts never prove production deletion. Keep manifests, identities, receipt bodies and reports outside Git and outside synced public directories.

## Synthetic rehearsal

Run `node scripts/operations/privacy-rehearsal.mjs new-private-directory`. It creates a fresh bundle of explicitly fictitious receipts and checks clinical preservation, missing-provider evidence, blocked clinical erasure and recovery exclusion. It makes no remote calls, deletes no data and cannot certify a provider. Actual provider trials must use dedicated synthetic identities, separate approved operations and independently retrieved receipts; never reuse clinical accounts.

For recovery, reuse `scripts/operations/storage-recovery.mjs` with a fresh authoritative exclusion export obtained independently of the old backup. Preserve clinical bytes and omit erased nonclinical objects.

Recipients' inboxes cannot be remotely recalled or certified erased by Nello. Public contractual retention and backups must be recorded separately from a completed deletion operation.

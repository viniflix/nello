import { expect, it } from 'vitest';
import { documentFailurePresentation } from './documentFailure';

it('requires the exact server contract for identity guidance', () => {
  expect(documentFailurePresentation({ code: '23514', message: 'responsible_document_identity_required' }).identityRequired).toBe(true);
  expect(documentFailurePresentation({ code: '23514', message: 'responsible_document_identity_required PRIVATE' }).identityRequired).toBeUndefined();
  expect(documentFailurePresentation({ message: 'responsible_document_identity_required' }).identityRequired).toBeUndefined();
});
it('offers actionable conflict and signature feedback without exposing database text', () => {
  expect(documentFailurePresentation({ code: '23505', message: 'meal_plan_document_already_exists' }).message).toContain('já possui');
  expect(documentFailurePresentation({ message: 'document_artifact_revision_conflict' }).message).toContain('outra sessão');
  expect(documentFailurePresentation({ message: 'document_signature_requires_current_verified_crn' }).message).toContain('CRN');
  expect(documentFailurePresentation({ message: 'PRIVATE_PATIENT token=secret' }).message).not.toContain('PRIVATE');
});

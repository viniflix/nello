import { describe, expect, it } from 'vitest';
import { privacyTransitionError } from './requestTransition';

const request = { requestType: 'deletion', status: 'fulfilled', reason: 'Resposta ao titular.', legalBasis: 'Lei 13.787/2018, art. 6', retentionDecision: 'retain_legal_obligation' };
describe('Privacy completion reflects the existing server contract', () => {
  it('allows justified legal custody without claiming erasure', () => expect(privacyTransitionError(request)).toBeNull());
  it.each(['access', 'portability', 'correction', 'deletion', 'revocation', 'objection'])('requires legal basis to close %s', requestType => {
    expect(privacyTransitionError({ ...request, requestType, legalBasis: ' ' })).toContain('base legal');
  });
  it.each(['anonymize', 'delete_non_clinical'])('does not claim provider erasure for %s', retentionDecision => {
    expect(privacyTransitionError({ ...request, retentionDecision })).toContain('comprovação');
    expect(privacyTransitionError({ ...request, retentionDecision, status: 'in_progress' })).toBeNull();
  });
  it('permits a legally justified restricted response', () => expect(privacyTransitionError({ ...request, status: 'rejected' })).toBeNull());
  it('requires a legal basis before queuing operational nonclinical erasure', () => {
    expect(privacyTransitionError({ ...request, status: 'in_progress', retentionDecision: 'delete_non_clinical', legalBasis: '' })).toContain('base legal');
  });
});

import { describe, expect, it } from 'vitest';
import { getVerificationCapabilities } from './verificationState';

describe('getVerificationCapabilities', () => {
  it('keeps a non-submitted professional in simulation-only mode', () => {
    expect(getVerificationCapabilities({ status: 'not_submitted' })).toMatchObject({
      canUseRealPatients: false,
      canCreateSimulation: true,
      canSubmitVerification: true,
      isRealClinicalReadOnly: true
    });
  });

  it('accepts server-authorized alpha migration capacity', () => {
    expect(getVerificationCapabilities({
      status: 'approved',
      verification_method: 'approved_by_migration',
      has_clinical_capacity: true
    })).toMatchObject({
      canUseRealPatients: true,
      isLegacyApproval: true,
      isRealClinicalReadOnly: false
    });
  });

  it('does not trust approved status when the server denies current capacity', () => {
    expect(getVerificationCapabilities({
      status: 'approved',
      has_clinical_capacity: false
    }).canUseRealPatients).toBe(false);
  });

  it('requires supervision for an approved student without capacity', () => {
    expect(getVerificationCapabilities({
      professional_role: 'student',
      status: 'approved',
      has_clinical_capacity: false
    })).toMatchObject({
      requiresSupervisor: true,
      canUseRealPatients: false,
      canCreateSimulation: true
    });
  });

  it.each(['needs_information', 'rejected', 'expired'])(
    'allows a %s verification to be resubmitted',
    (status) => expect(getVerificationCapabilities({ status }).canSubmitVerification).toBe(true)
  );

  it.each(['pending', 'approved', 'suspended'])(
    'does not allow a %s verification to be submitted again directly',
    (status) => expect(getVerificationCapabilities({ status }).canSubmitVerification).toBe(false)
  );
});

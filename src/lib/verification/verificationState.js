const RESUBMITTABLE_STATUSES = new Set([
  'not_submitted',
  'needs_information',
  'rejected',
  'expired'
]);

export function getVerificationCapabilities(verification = {}) {
  const status = verification?.status || 'not_submitted';
  const hasClinicalCapacity = verification?.has_clinical_capacity === true;
  const isStudent = verification?.professional_role === 'student';

  return {
    status,
    canUseRealPatients: hasClinicalCapacity,
    canCreateSimulation: true,
    canSubmitVerification: RESUBMITTABLE_STATUSES.has(status),
    isRealClinicalReadOnly: !hasClinicalCapacity,
    requiresSupervisor: isStudent && status === 'approved' && !hasClinicalCapacity,
    isLegacyApproval: verification?.verification_method === 'approved_by_migration'
  };
}

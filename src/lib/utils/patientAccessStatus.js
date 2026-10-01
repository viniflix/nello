// Credential-change reminders are independent of account activation.
export function isPatientAccessPending(patient) {
  if (patient?.is_active === false || patient?.arquivadoHistorico) return false;
  if (patient?.access_status) return ['offline', 'awaiting_email_confirmation'].includes(patient.access_status);
  return Boolean(patient?.patient_invite_code);
}

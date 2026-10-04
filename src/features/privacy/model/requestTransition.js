export function privacyTransitionError({ requestType, status, reason, retentionDecision, legalBasis }) {
  if ((reason || '').trim().length < 10) return 'Informe uma justificativa com pelo menos 10 caracteres.';
  const closing = ['fulfilled', 'rejected'].includes(status);
  const operationalDecision = requestType === 'deletion' && status === 'in_progress' && retentionDecision;
  if ((closing || operationalDecision) && !(legalBasis || '').trim()) return 'Informe a base legal antes de registrar a decisão.';
  if (requestType === 'deletion' && closing && !retentionDecision) return 'Informe a decisão de retenção.';
  if (requestType === 'deletion' && status === 'fulfilled'
    && ['anonymize', 'delete_non_clinical'].includes(retentionDecision)) {
    return 'A exclusão exige comprovação operacional das cópias e dos provedores. Mantenha em atendimento até a verificação.';
  }
  return null;
}

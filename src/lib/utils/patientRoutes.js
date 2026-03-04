/**
 * Utilitários para URLs legíveis de pacientes (slug em vez de UUID)
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(str) {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
}

/**
 * Retorna a URL do hub do paciente usando slug quando disponível
 * @param {Object} patient - Objeto paciente com id e opcionalmente slug
 * @param {string} [subPath] - Subcaminho (hub, anthropometry, etc.)
 * @returns {string}
 */
export function patientRoute(patient, subPath = 'hub') {
  if (!patient?.id) return '/nutritionist/patients';
  const identifier = patient.slug || patient.id;
  return `/nutritionist/patients/${identifier}/${subPath}`;
}

/**
 * Retorna a URL de uma subpágina do paciente
 */
export function patientSubRoute(patient, subPath) {
  return patientRoute(patient, subPath);
}

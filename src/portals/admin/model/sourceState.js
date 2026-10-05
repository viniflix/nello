export function sourceFreshness(data, now = Date.now(), cadenceMs = 120000) {
  const timestamp = Date.parse(data?.data_through || data?.generated_at || '');
  if (!Number.isFinite(timestamp) || timestamp > now + 5000) return { state: 'unknown', label: 'Atualização desconhecida' };
  return now - timestamp > cadenceMs * 2
    ? { state: 'stale', label: 'Dados atrasados' }
    : { state: 'fresh', label: 'Consulta recente' };
}
export function operationalCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('pt-BR') : '—';
}
export function operationalDate(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : 'Não informado';
}
export function validateBriefing(value) {
  if (value?.schema_version !== 1 || !Array.isArray(value.queues) || !Array.isArray(value.invariants)
    || !value.counts || !Number.isFinite(Date.parse(value.generated_at))) throw new Error('invalid_admin_briefing');
  for (const q of value.queues) {
    if (!['privacy', 'verifications', 'incidents'].includes(q.key) || operationalCount(q.count) === '—'
      || !['/admin/privacy', '/admin/verifications', '/admin/bugs'].includes(q.route)) throw new Error('invalid_admin_queue');
  }
  return value;
}

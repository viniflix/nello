export function parseSentryRequest(body = {}) {
  const action = body.action || 'issues';
  if (!['issues', 'issues_page', 'latest_event', 'sources', 'product_analytics'].includes(action)) throw Error('invalid_action');
  const issueId = String(body.issue_id || '');
  const cursor = String(body.cursor || '');
  const release = String(body.release || '');
  const environment = body.environment || (action === 'issues_page' ? 'production' : 'all');
  const hours = body.hours == null ? 24 : Number(body.hours);
  const limit = body.limit == null ? 25 : Number(body.limit);
  const correlation = String(body.correlation_id || '');
  if (!['all', 'production', 'development', 'test'].includes(environment)
    || !Number.isInteger(hours) || hours < 1 || hours > 336
    || !Number.isInteger(limit) || limit < 1 || limit > 100
    || (cursor && !/^[0-9:]{1,100}$/.test(cursor))
    || (release && !/^[a-f0-9]{7,40}$/.test(release))
    || (correlation && !/^[a-zA-Z0-9-]{1,80}$/.test(correlation))
    || (action === 'latest_event' && !/^\d{1,30}$/.test(issueId))) throw Error('invalid_sentry_filter');
  return { action, issueId, cursor, release, environment, hours, limit, correlation };
}
export function nextSentryCursor(link) {
  const next = (link || '').split(',').find(part => /rel="next"/.test(part) && /results="true"/.test(part));
  const cursor = next?.match(/cursor="([0-9:]{1,100})"/)?.[1];
  return cursor || null;
}
const identifier = (value, fallback = 'Não informado') => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : fallback;
export function safeSentryIssue(issue) {
  if (!issue || !/^\d{1,30}$/.test(String(issue.id))) throw Error('invalid_sentry_response');
  return {
    id: String(issue.id), shortId: identifier(issue.shortId),
    title: `${identifier(issue.type, 'Erro')} · ${identifier(issue.metadata?.type, 'Exceção da aplicação')}`,
    culprit: 'Detalhes sensíveis omitidos',
    firstSeen: issue.firstSeen, lastSeen: issue.lastSeen,
    count: /^\d+$/.test(String(issue.count)) ? String(issue.count) : null,
    userCount: /^\d+$/.test(String(issue.userCount)) ? String(issue.userCount) : null,
    level: ['error', 'warning', 'fatal', 'info', 'debug'].includes(issue.level) ? issue.level : 'error',
    status: ['unresolved', 'resolved', 'ignored'].includes(issue.status) ? issue.status : 'unknown',
    type: identifier(issue.type, 'error'),
  };
}
export function safeSentryEvent(data) {
  if (!data || !Array.isArray(data.entries)) throw Error('invalid_sentry_response');
  const values = data.entries.find(entry => entry.type === 'exception')?.data?.values || [];
  return {
    event_id: identifier(data.eventID), date_created: data.dateCreated,
    exceptions: values.slice(0, 10).map(exception => ({
      type: identifier(exception.type, 'Exceção'), value: 'Mensagem livre omitida para proteger dados pessoais.',
      frames: (exception.stacktrace?.frames || []).filter(f => f.inApp).slice(-30).map(frame => ({
        filename: typeof frame.filename === 'string' && /^\/?(?:assets|src)\/[a-zA-Z0-9_./-]+\.(?:js|jsx|ts|tsx)$/.test(frame.filename) ? frame.filename : 'arquivo da aplicação',
        line: Number.isSafeInteger(frame.lineNo) ? frame.lineNo : null, in_app: true,
      })),
    })),
    tags: (data.tags || []).filter(tag => ['environment', 'release', 'error.code', 'error.module'].includes(tag.key))
      .map(tag => ({ key: tag.key, value: identifier(tag.value) })),
  };
}

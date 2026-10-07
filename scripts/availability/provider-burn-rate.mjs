import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export { readProviderChecks, assessChecks } from '../../supabase/functions/sentry-proxy/monitor.js';
import { readProviderChecks, assessChecks } from '../../supabase/functions/sentry-proxy/monitor.js';

export async function deliverAlert(kind, { dsn, fetcher = fetch, controlled = false } = {}) {
  if (!dsn) return false;
  const url = new URL(dsn), project = url.pathname.split('/').at(-1), eventId = randomUUID().replaceAll('-', '');
  const endpoint = new URL(`/api/${project}/envelope/`, url);
  endpoint.username = ''; endpoint.password = '';
  endpoint.searchParams.set('sentry_key', url.username); endpoint.searchParams.set('sentry_version', '7');
  const event = { event_id: eventId, timestamp: Date.now() / 1000, platform: 'javascript', environment: 'production', level: 'warning',
    fingerprint: ['availability-budget', controlled ? 'controlled-validation' : kind], message: 'Availability budget monitor signal',
    tags: { source: controlled ? 'controlled_probe' : 'external-budget-monitor', 'monitor.signal': kind, 'error.code': controlled ? 'OBS_PROBE' : 'AVAILABILITY_BUDGET' } };
  try {
    const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: JSON.stringify({ event_id: eventId }) + '\n' + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(event), signal: AbortSignal.timeout(10000) });
    return response.ok;
  } catch { return false; }
}

export async function checkBudget({ token, dsn, previous = {}, now = Date.now(), fetcher = fetch, controlled = false } = {}) {
  let samples = [], assessment;
  try { samples = await readProviderChecks({ token, now, fetcher }); assessment = assessChecks(samples, now); }
  catch { assessment = { state: 'provider_unavailable', coverageGap: true, alerts: [], assessedAt: new Date(now).toISOString() }; }
  const active = assessment.state === 'provider_unavailable' ? ['provider_unavailable'] : [...assessment.alerts, ...(assessment.coverageGap ? ['coverage_gap'] : [])];
  const deliveries = { ...(previous.deliveries || {}) };
  const attempts = [];
  for (const kind of active) {
    if (!controlled && previous.active?.includes(kind) && now - (deliveries[kind] || 0) < 30 * 60000) continue;
    const delivered = await deliverAlert(kind, { dsn, fetcher, controlled });
    attempts.push({ kind, delivered });
    if (delivered) deliveries[kind] = now; // Failed deliveries are retried on the next run.
  }
  return { schemaVersion: 1, monitorId: '10435462', assessment, samples, active, deliveries, attempts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let previous = {};
  try { previous = JSON.parse(readFileSync('previous-budget/production-budget.json', 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = await checkBudget({ token: process.env.SENTRY_MONITOR_READ_TOKEN, dsn: process.env.SENTRY_DSN, previous });
  writeFileSync('production-budget.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ state: result.assessment.state, signals: result.active, attempts: result.attempts }));
}

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { evaluateBurnRate } from './monitor.mjs';

const checksPath = '/api/0/projects/nello/javascript-react/uptime/10435462/checks/';
const apiOrigin = 'https://us.sentry.io';
const staleAfterMs = 150000;

// Fetch only the known provider; pagination cannot forward credentials elsewhere.
export async function readProviderChecks({ token, now = Date.now(), fetcher = fetch } = {}) {
  if (!token) throw Error('monitor_read_token_missing');
  const metadataResponse = await fetcher(new URL('/api/0/organizations/nello/detectors/10435462/', apiOrigin), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!metadataResponse.ok) throw Error('monitor_provider_unavailable');
  const metadataText = await metadataResponse.text();
  if (metadataText.length > 512000) throw Error('provider_response_oversized');
  const metadata = JSON.parse(metadataText);
  const config = metadata.dataSources?.find(source => source.type === 'uptime_subscription')?.queryObj;
  if (metadata.id !== '10435462' || metadata.enabled !== true || metadata.config?.environment !== 'production'
    || config?.url !== 'https://nellonutri.com.br/api/health' || config.method !== 'GET' || config.intervalSeconds !== 60
    || config.body || config.headers?.length || config.traceSampling !== false || config.responseCaptureEnabled !== false) throw Error('monitor_configuration_changed');
  let url = new URL(checksPath, apiOrigin);
  url.searchParams.set('start', new Date(now - 362 * 60000).toISOString());
  url.searchParams.set('end', new Date(now).toISOString());
  url.searchParams.set('per_page', '100');
  const samples = [], visited = new Set();
  for (let page = 0; url && page < 6; page++) {
    if (url.origin !== apiOrigin || url.pathname !== checksPath || visited.has(url.href)) throw Error('invalid_provider_pagination');
    visited.add(url.href);
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('monitor_provider_unavailable');
    const text = await response.text();
    if (text.length > 512000) throw Error('provider_response_oversized');
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length > 100) throw Error('invalid_provider_checks');
    for (const row of rows) {
      const timestamp = Date.parse(row.scheduledCheckTime);
      if (!Number.isFinite(timestamp) || timestamp > now + 10000 || !['success', 'failure', 'failure_incident', 'missed_window'].includes(row.checkStatus)) throw Error('invalid_provider_check');
      // Explicit allowlist: do not retain raw responses, assertions, traces or URLs.
      samples.push({ timestamp, ok: row.checkStatus === 'success' && row.httpStatusCode === 200 });
    }
    const next = (response.headers.get('link') || '').split(',').find(part => /rel="next"/.test(part) && /results="true"/.test(part));
    url = next ? new URL(next.match(/<([^>]+)>/)?.[1] || '', apiOrigin) : null;
  }
  if (url) throw Error('provider_pagination_incomplete');
  return samples.sort((a, b) => a.timestamp - b.timestamp);
}

export function assessChecks(samples, now = Date.now()) {
  const latest = samples.at(-1)?.timestamp;
  const fresh = Number.isFinite(latest) && now - latest <= staleAfterMs;
  const evaluation = evaluateBurnRate(samples, fresh ? latest : now);
  const observedSpan = samples.length ? latest - samples[0].timestamp : 0;
  const coverageGap = !fresh || [5, 30, 60, 360].some(minutes => observedSpan >= minutes * 60000 && !evaluation.windows[minutes].covered);
  return { ...evaluation, fresh, coverageGap, assessedAt: new Date(now).toISOString(), latestCheckAt: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
    state: coverageGap ? 'coverage_gap' : evaluation.alerts.length ? 'budget_burning' : evaluation.windows[360].covered ? 'covered' : 'warming_up' };
}

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

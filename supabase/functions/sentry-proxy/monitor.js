import { boundedReleaseJson as boundedProviderJson } from './contracts.js';

export function evaluateBurnRate(samples, now = Date.now(), availabilityPercent = 99.9) {
  if (!(availabilityPercent > 0 && availabilityPercent < 100)) throw Error('Invalid availability target');
  const budget = 1 - availabilityPercent / 100;
  const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  function window(minutes) {
    const span = minutes * 60000;
    const rows = ordered.filter(row => row.timestamp >= now - span && row.timestamp <= now);
    const covered = rows.length >= Math.max(2, Math.floor(span / 60000) - 1)
      && rows[0].timestamp <= now - span + 60000 && rows.at(-1).timestamp >= now - 90000
      && rows.every((row, index) => typeof row.ok === 'boolean' && Number.isFinite(row.timestamp)
        && (!index || row.timestamp - rows[index - 1].timestamp >= 45000
          && row.timestamp - rows[index - 1].timestamp <= 90000));
    return { covered, samples: rows.length, burnRate: covered ? rows.filter(row => !row.ok).length / rows.length / budget : null };
  }
  const windows = Object.fromEntries([5, 30, 60, 360].map(minutes => [minutes, window(minutes)]));
  const alerts = [[5, 60, 14.4, 'fast'], [30, 360, 6, 'sustained']]
    .filter(([short, long, threshold]) => windows[short].covered && windows[long].covered
      && windows[short].burnRate >= threshold && windows[long].burnRate >= threshold)
    .map(([, , , name]) => name);
  return { availabilityPercent, windows, alerts };
}


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
  const metadata = await boundedProviderJson(metadataResponse);
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
    const rows = await boundedProviderJson(response);
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
  // The provider may return multiple regional/retried checks for one scheduled
  // minute. Count that slot once, conservatively retaining any failed result.
  // Missing minutes remain missing; evaluateBurnRate still rejects real gaps.
  const slots = new Map();
  for (const sample of samples) {
    const previous = slots.get(sample.timestamp);
    slots.set(sample.timestamp, { timestamp: sample.timestamp, ok: sample.ok && (previous?.ok ?? true) });
  }
  return [...slots.values()].sort((a, b) => a.timestamp - b.timestamp);
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


// Cache only provider aggregates, never an administrative authorization result.
let cachedContinuity = null;
let pendingContinuity = null;
export async function readContinuity({ token, fetcher = fetch, now = Date.now() } = {}) {
  const base = { schema_version: 1, source: 'Sentry · monitor independente de produção', generated_at: new Date(now).toISOString(), data_through: null };
  if (!token) return { ...base, state: 'not_configured', assessment: null };
  if (cachedContinuity?.token === token && now - cachedContinuity.at < 120000 && now >= cachedContinuity.at) return cachedContinuity.value;
  if (pendingContinuity?.token === token) return pendingContinuity.promise;
  const promise = (async () => {
    const signal = AbortSignal.timeout(20000);
    try {
      const samples = await readProviderChecks({ token, now, fetcher: (url, options) => fetcher(url, { ...options, signal: AbortSignal.any([signal, options.signal]) }) });
      const assessment = assessChecks(samples, now);
      const value = { ...base, state: 'available', data_through: assessment.latestCheckAt, assessment };
      cachedContinuity = { token, at: now, value };
      return value;
    } catch {
      return { ...base, state: 'unavailable', assessment: null };
    }
  })();
  pendingContinuity = { token, promise };
  try { return await promise; } finally { if (pendingContinuity?.promise === promise) pendingContinuity = null; }
}

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const api = 'https://us.posthog.com/api/projects/341310/query/';
const ingestion = 'https://us.i.posthog.com/capture/';
const timeout = () => AbortSignal.timeout(15000);

class PipelineFailure extends Error {
  constructor(reason, httpStatus) {
    super(reason);
    this.reason = reason;
    if (Number.isInteger(httpStatus)) this.httpStatus = httpStatus;
  }
}

async function json(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, redirect: 'error', signal: timeout() });
  if (!response.ok) throw new PipelineFailure('http_error', response.status);
  const text = await response.text();
  if (text.length > 65536) throw new PipelineFailure('invalid_provider_response');
  try { return JSON.parse(text); }
  catch { throw new PipelineFailure('invalid_provider_response'); }
}

// A dedicated fictitious probe checks ingestion even with no opted-in users.
// No clinical data, account identity, cookies or device data is read or sent.
export async function assessPipeline({ readToken, captureKey, previous = {}, fetcher = fetch, now = Date.now() } = {}) {
  const result = { schemaVersion: 1, checkedAt: new Date(now).toISOString(), signals: [], probeCount: null, invalidReleaseCount: null, silentChecks: 0 };
  let stage = 'configuration';
  try {
    if (!readToken || !/^phc_[a-z0-9_]+$/i.test(captureKey || '')) throw new PipelineFailure('configuration_missing');
    // Compare the configured public capture key with the intended project without logging it.
    result.captureKeyFingerprint = createHash('sha256').update(captureKey).digest('hex');
    stage = 'release';
    const metadata = await json(fetcher, 'https://nellonutri.com.br/release.json');
    if (metadata.schemaVersion !== 1 || metadata.environment !== 'production' || !/^[a-f0-9]{40}$/i.test(metadata.release || '')) {
      result.signals.push('invalid_release');
      result.state = 'attention';
      return result;
    }
    result.release = metadata.release;
    stage = 'capture';
    await json(fetcher, ingestion, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      api_key: captureKey, event: 'analytics_pipeline_probe', timestamp: new Date(now).toISOString(), properties: {
        distinct_id: 'nello-pipeline-monitor-v1', $process_person_profile: false, $geoip_disable: true, audience: 'qa', source: 'external-pipeline-monitor',
        app_release: metadata.release, environment: 'production', event_schema_version: 1, correlation_id: randomUUID(),
      },
    }) });
    const query = `SELECT countIf(event = 'analytics_pipeline_probe' AND properties.source = 'external-pipeline-monitor'
      AND properties.app_release = '${metadata.release}'),
      countIf(toString(properties.event_schema_version) = '1' AND NOT match(ifNull(toString(properties.app_release), ''), '^[a-fA-F0-9]{40}$'))
      FROM events WHERE timestamp >= now() - INTERVAL 20 MINUTE AND properties.environment = 'production'`;
    stage = 'query';
    const data = await json(fetcher, api, { method: 'POST', headers: { Authorization: `Bearer ${readToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: 'force_blocking', query: { kind: 'HogQLQuery', query } }) });
    const values = data.results?.[0];
    if (!Array.isArray(values) || values.length !== 2 || values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new PipelineFailure('invalid_provider_response');
    [result.probeCount, result.invalidReleaseCount] = values;
    const priorAge = now - Date.parse(previous.checkedAt);
    result.silentChecks = result.probeCount ? 0 : (previous.release === metadata.release && priorAge >= 0 && priorAge < 10 * 60000 ? (previous.silentChecks || 0) : 0) + 1;
    // Three consecutive five-minute runs tolerate asynchronous ingestion.
    if (result.silentChecks >= 3) result.signals.push('ingestion_silent');
    if (result.invalidReleaseCount) result.signals.push('invalid_release');
  } catch (error) {
    result.signals.push('pipeline_unavailable');
    result.diagnostic = { stage, reason: error instanceof PipelineFailure ? error.reason : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'transport_error' };
    if (error instanceof PipelineFailure && Number.isInteger(error.httpStatus)) result.diagnostic.httpStatus = error.httpStatus;
  }
  result.state = result.signals.length ? 'attention' : result.probeCount ? 'ingestion_verified' : 'warming_up';
  return result;
}

export async function monitorPipeline({ dsn, previous = {}, fetcher = fetch, now = Date.now(), ...options } = {}) {
  const assessment = await assessPipeline({ ...options, previous, fetcher, now });
  const deliveries = { ...(previous.deliveries || {}) }, attempts = [];
  for (const kind of assessment.signals) {
    if (previous.signals?.includes(kind) && Number.isFinite(deliveries[kind]) && now >= deliveries[kind] && now - deliveries[kind] < 30 * 60000) continue;
    let delivered = false;
    try {
      if (!dsn) throw Error('monitoring_not_configured');
      const url = new URL(dsn), id = randomUUID().replaceAll('-', '');
      const endpoint = new URL(`/api/${url.pathname.split('/').at(-1)}/envelope/`, url);
      endpoint.username = ''; endpoint.password = '';
      endpoint.searchParams.set('sentry_key', url.username); endpoint.searchParams.set('sentry_version', '7');
      const event = { event_id: id, timestamp: now / 1000, platform: 'javascript', environment: 'production', level: 'error',
        fingerprint: ['analytics-pipeline-monitor', kind], message: 'Analytics pipeline monitor signal', tags: { 'error.source': 'analytics', 'error.reason': kind } };
      const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: timeout(), headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: `${JSON.stringify({ event_id: id })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}` });
      delivered = response.ok;
      if (delivered) deliveries[kind] = now;
    } catch { /* A failed alert delivery is retried next run. */ }
    attempts.push({ kind, delivered });
  }
  return { ...assessment, deliveries, attempts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let previous = {};
  try { previous = JSON.parse(readFileSync('previous-budget/production-analytics.json', 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = await monitorPipeline({ previous, readToken: process.env.POSTHOG_MONITOR_READ_TOKEN, captureKey: process.env.POSTHOG_MONITOR_CAPTURE_KEY, dsn: process.env.SENTRY_DSN });
  writeFileSync('production-analytics.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ state: result.state, signals: result.signals, diagnostic: result.diagnostic, attempts: result.attempts }));
}

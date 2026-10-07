import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validHealth } from '../../src/lib/utils/healthContract.js';
export { validHealth } from '../../src/lib/utils/healthContract.js';

export async function probeHealth(origin, { fetcher = fetch, now = Date.now } = {}) {
  const started = now();
  try {
    const response = await fetcher(new URL('/api/health', origin), {
      headers: { Accept: 'application/json' }, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(6000),
    });
    if (![200, 503].includes(response.status) || !/^application\/json\b/i.test(response.headers.get('content-type') || '')) throw new Error();
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 32768) throw new Error();
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally { await reader.cancel(); }
    const body = JSON.parse(text);
    if (!validHealth(body, now()) || (response.status === 200) !== (body.status === 'operational')) throw new Error();
    return { timestamp: started, ok: response.status === 200, latencyMs: now() - started, status: body.status };
  } catch {
    return { timestamp: started, ok: false, latencyMs: now() - started, status: 'unverifiable' };
  }
}

export { evaluateBurnRate } from '../../supabase/functions/sentry-proxy/monitor.js';
import { evaluateBurnRate } from '../../supabase/functions/sentry-proxy/monitor.js';

export async function monitor({ origin, journal, once = false, signal } = {}) {
  const url = new URL(origin);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !['https:', 'http:'].includes(url.protocol)
    || url.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Invalid monitor origin');
  mkdirSync(dirname(journal), { recursive: true });
  let samples = [];
  try { samples = readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (samples.some(row => row.origin !== url.origin || typeof row.ok !== 'boolean'
    || !Number.isFinite(row.timestamp) || row.timestamp > Date.now() + 10000)) throw Error('Invalid journal or monitor origin changed');
  let previousAlerts = '';
  try {
    const previous = JSON.parse(readFileSync(`${journal}.status.json`, 'utf8'));
    if (previous.origin !== url.origin) throw Error('Monitor origin changed');
    previousAlerts = previous.alerts.join(',');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  do {
    const sample = { ...await probeHealth(url.origin), origin: url.origin };
    appendFileSync(journal, `${JSON.stringify(sample)}\n`);
    samples.push(sample);
    samples = samples.filter(row => row.timestamp > Date.now() - 360 * 60000);
    const result = evaluateBurnRate(samples);
    writeFileSync(`${journal}.status.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin: url.origin, sample, ...result }, null, 2));
    const alerts = result.alerts.join(',');
    if (alerts && alerts !== previousAlerts) console.error(`Availability budget alert: ${alerts}`);
    previousAlerts = alerts;
    if (once || signal?.aborted) break;
    await new Promise(resolve => {
      const abort = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.max(0, 60000 - (Date.now() - sample.timestamp)));
      signal?.addEventListener('abort', abort, { once: true });
    });
  } while (!signal?.aborted);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  process.on('SIGINT', () => controller.abort());
  process.on('SIGTERM', () => controller.abort());
  await monitor({ origin: process.argv[2], journal: process.argv[3] || '.codex/local/availability.jsonl',
    once: process.argv.includes('--once'), signal: controller.signal });
}

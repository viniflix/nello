import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../../operations/release-policy.json', import.meta.url), 'utf8'));
const origin = process.env.NELLO_SMOKE_ORIGIN || policy.canonicalOrigin;
const parsed = new URL(origin);
if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
  throw new Error('Smoke origin must be a credential-free HTTPS origin.');
}
const results = [];
const hash = body => createHash('sha256').update(body).digest('hex');
async function request(path, expectedType) {
  const url = new URL(path, origin);
  const started = performance.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Nello-Release-Smoke/1.0' } });
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') || '';
  const headers = Object.fromEntries(['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'cache-control'].map(k => [k, response.headers.get(k)]));
  const passed = response.status === 200 && type.includes(expectedType) && new URL(response.url).origin === parsed.origin;
  results.push({ path, status: response.status, type, bytes: bytes.length, sha256: hash(bytes), durationMs: Math.round(performance.now() - started), headers, passed });
  if (!passed) throw new Error('Unexpected response for ' + path + ': ' + response.status + ' ' + type);
  return bytes.toString('utf8');
}
let error;
try {
  const html = await request('/login', 'text/html');
  if (!html.includes('id="root"')) throw new Error('SPA root is missing.');
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m => m[1]))];
  if (!assets.some(p => p.endsWith('.js'))) throw new Error('No application JavaScript found.');
  for (const asset of assets) await request(asset, asset.endsWith('.css') ? 'text/css' : 'javascript');
  const headers = results[0].headers;
  if (!headers['content-security-policy'] || !headers['strict-transport-security'] || headers['x-content-type-options'] !== 'nosniff' || headers['x-frame-options'] !== 'DENY') throw new Error('Required production security headers missing.');
} catch (e) { error = e.message; process.exitCode = 1; }
const report = { capturedAt: new Date().toISOString(), origin: parsed.origin, passed: !error, error, results };
if (process.env.NELLO_SMOKE_REPORT) writeFileSync(process.env.NELLO_SMOKE_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

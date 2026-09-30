import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
  throw Error('Edge boot smoke requires an isolated GitHub runner; no local services are allowed.');
}
// Credentials belong exclusively to the unlinked, disposable runner. Do not log
// the status output, token, response headers or function request/response bodies.
const status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status',
  '--workdir', '.backend-ci', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const api = new URL(status.API_URL);
if (api.origin !== 'http://127.0.0.1:54321' || !status.ANON_KEY) throw Error('Unexpected isolated API endpoint');
const baseline = JSON.parse(readFileSync('operations/backend/baseline.json', 'utf8'));
const retired = new Set(['sentry-issues', 'sentry-test']);
const results = [];
for (const fn of baseline.functions) {
  const expected = retired.has(fn.slug) ? 410 : 405;
  const started = Date.now();
  const response = await fetch(new URL(`/functions/v1/${fn.slug}`, api), {
    // GET reaches the worker (OPTIONS could be answered by gateway CORS). Each
    // active handler rejects GET before any clinical write or business API call.
    method: 'GET',
    headers: { Authorization: `Bearer ${status.ANON_KEY}`, apikey: status.ANON_KEY,
      Origin: 'https://nellonutri.com.br' },
    signal: AbortSignal.timeout(90000),
  });
  await response.arrayBuffer();
  const result = { function: fn.slug, method: 'GET', status: response.status,
    expectedStatus: expected, passed: response.status === expected, durationMs: Date.now() - started };
  results.push(result);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} Edge startup: ${fn.slug} (${response.status})`);
}
mkdirSync('.backend-ci/edge-results', { recursive: true });
writeFileSync('.backend-ci/edge-results/results.json', JSON.stringify({
  scope: 'Imports, worker initialization and method rejection. No clinical/financial mutations or external business integrations.',
  capturedAt: new Date().toISOString(), results,
}, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;

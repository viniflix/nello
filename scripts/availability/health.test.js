// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectHealth } from '../../operations/availability/health.mjs';
import { evaluateBurnRate, probeHealth, validHealth } from './monitor.mjs';

const servers = [];
afterEach(async () => { for (const server of servers.splice(0)) {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
} });
async function fixture(handler) {
  const server = createServer(handler); servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const payloads = { '/auth/v1/settings': { external: { email: true } }, '/rest/v1/foods?select=id&limit=0': [], '/storage/v1/health': { healthy: true } };

describe('dependency health over real HTTP', () => {
  it('verifies both dependencies without requesting any clinical rows or exposing credentials', async () => {
    const paths = [];
    const origin = await fixture((request, response) => {
      paths.push(request.url); expect(request.headers.apikey).toBe('synthetic-anon');
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(payloads[request.url]));
    });
    const result = await inspectHealth({ env: { NELLO_LOCAL_QA: 'isolated', VITE_SUPABASE_URL: origin, VITE_SUPABASE_ANON_KEY: 'synthetic-anon' } });
    expect(result.status).toBe('operational'); expect(paths.sort()).toEqual(Object.keys(payloads).sort());
    expect(JSON.stringify(result)).not.toContain(origin); expect(JSON.stringify(result)).not.toContain('synthetic-anon');
  });
  it.each(['html', 'malformed', 'wrong-schema', 'denied', 'oversized', 'redirect', 'timeout'])('fails closed for %s', async mode => {
    const origin = await fixture((request, response) => {
      if (!request.url.startsWith('/rest/v1/')) {
        response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify(payloads[request.url]));
      }
      if (mode === 'timeout') return;
      response.setHeader('Content-Type', mode === 'html' ? 'text/html' : 'application/json');
      response.statusCode = mode === 'denied' ? 401 : mode === 'redirect' ? 302 : 200;
      if (mode === 'redirect') response.setHeader('Location', '/auth/v1/settings');
      response.end(mode === 'oversized' ? 'x'.repeat(1100000) : mode === 'malformed' ? '{' : mode === 'wrong-schema' ? '{}' : '<html>SPA</html>');
    });
    const result = await inspectHealth({ timeoutMs: 100, env: { NELLO_LOCAL_QA: 'isolated', SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'synthetic' } });
    expect(result.status).toBe('degraded'); expect(result.checks.database).toBe('unavailable');
  });
  it('rejects missing credentials and insecure production origins before network access', async () => {
    for (const env of [{}, { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'synthetic' },
      { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_synthetic' },
      { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: `a.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.c` }]) {
      expect((await inspectHealth({ env, fetcher: () => { throw Error('must not fetch'); } })).status).toBe('unavailable');
    }
  });
});

describe('monitor response contract and burn rate', () => {
  it('rejects a successful SPA fallback instead of reporting healthy', async () => {
    const origin = await fixture((_, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<html>Nello</html>'); });
    expect((await probeHealth(origin)).ok).toBe(false);
  });
  it('accepts fresh coherent health and rejects stale or contradictory responses', () => {
    const body = { schemaVersion: 1, checkedAt: new Date().toISOString(), status: 'operational', checks: { auth: 'operational', database: 'operational', storage: 'operational' } };
    expect(validHealth(body)).toBe(true);
    expect(validHealth({ ...body, status: 'degraded' })).toBe(false);
    expect(validHealth({ ...body, checkedAt: new Date(Date.now() - 120000).toISOString() })).toBe(false);
    expect(validHealth({ ...body, checks: { ...body.checks, secret: 'operational' } })).toBe(false);
  });
  it('requires both windows and continuous samples to alert, while recording budget consumption', () => {
    const now = Date.now();
    const samples = Array.from({ length: 361 }, (_, index) => ({ timestamp: now - index * 60000, ok: index >= 5 }));
    expect(evaluateBurnRate(samples, now).alerts).toEqual(['fast', 'sustained']);
    expect(evaluateBurnRate(samples.slice(0, 5), now).alerts).toEqual([]);
    expect(evaluateBurnRate(samples.filter((_, index) => index !== 3), now).alerts).toEqual([]);
    expect(evaluateBurnRate(samples.map(row => ({ ...row, ok: true })), now).alerts).toEqual([]);
  });
});

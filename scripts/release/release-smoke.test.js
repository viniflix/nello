// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { createReleaseSmoke } from './release-smoke.mjs';

let server;
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = null; } });
async function fixture({ brokenHealth = false, false404 = false } = {}) {
  const paths = [];
  server = createServer((request, response) => {
    paths.push(request.url);
    response.setHeader('content-type', 'text/html');
    if (['/login', '/status'].includes(request.url)) return response.end('<title>Nello</title><div id="root"></div><script src="/assets/boot.js"></script><link href="/assets/boot.css">');
    if (request.url === '/assets/boot.js') { response.setHeader('content-type', 'application/javascript'); return response.end('export {};'); }
    if (request.url === '/assets/boot.css') { response.setHeader('content-type', 'text/css'); return response.end('body {}'); }
    if (request.url === '/api/health') {
      if (brokenHealth) return response.end('<html>SPA fallback</html>');
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ schemaVersion: 1, status: 'operational', checkedAt: new Date().toISOString(),
        checks: { auth: 'operational', database: 'operational', storage: 'operational' }, incidents: [] }));
    }
    if (request.url === '/robots.txt') { response.setHeader('content-type', 'text/plain'); return response.end('User-agent: *\nDisallow: /'); }
    response.statusCode = false404 ? 200 : 404; response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, paths };
}
it('keeps the old rollback contract usable while rejecting a candidate with a false healthy HTML response', async () => {
  const { origin, paths } = await fixture({ brokenHealth: true });
  const smoke = createReleaseSmoke({ requireHeaders: false });
  await expect(smoke(origin, { stage: 'rollback-target' })).resolves.toMatchObject({ passed: true });
  expect(paths).not.toContain('/api/health');
  await expect(smoke(origin, { stage: 'canary' })).rejects.toThrow('Health');
});
it('verifies the entire new contract and blocks swallowed 404s after promotion', async () => {
  const { origin } = await fixture({ false404: true });
  await expect(createReleaseSmoke({ requireHeaders: false })(origin, { stage: 'production' })).rejects.toThrow('404');
});
it('accepts coherent dependencies, real 404s, public status and private robots policy', async () => {
  const { origin } = await fixture();
  await expect(createReleaseSmoke({ requireHeaders: false })(origin)).resolves.toMatchObject({ passed: true });
});

import { probeHealth } from './monitor.mjs';
import { smokeDeployment } from '../release/smoke.mjs';

export async function smokeAvailability(origin, { fetcher = fetch, requireHeaders = true } = {}) {
  const app = await smokeDeployment(origin, { fetcher, requireHeaders });
  const health = await probeHealth(origin, { fetcher });
  if (!health.ok) throw Error('Health status, content type, body, freshness or dependencies failed');
  const checks = [];
  for (const path of ['/pagina-inexistente-wave03', '/patient/pagina-inexistente-wave03', '/api/inexistente-wave03', '/assets/inexistente-wave03.js', '/sitemap.xml']) {
    const response = await fetcher(new URL(path, origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (response.status !== 404) throw Error(`Unknown resource did not return 404: ${path}`);
    checks.push({ path, status: response.status });
  }
  const robots = await fetcher(new URL('/robots.txt', origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (robots.status !== 200 || !robots.headers.get('content-type')?.includes('text/plain') || !/Disallow:\s*\//.test(await robots.text())) throw Error('Private application robots policy failed');
  const status = await fetcher(new URL('/status', origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (status.status !== 200 || !status.headers.get('content-type')?.includes('text/html') || !/id=["']root["']/.test(await status.text())) throw Error('Public status route failed');
  return { passed: true, capturedAt: new Date().toISOString(), app, health, checks };
}

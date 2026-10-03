import { probeHealth } from './monitor.mjs';
import { smokeDeployment } from '../release/smoke.mjs';

export async function smokeAvailability(origin, { fetcher = fetch, requireHeaders = true } = {}) {
  const app = await smokeDeployment(origin, { fetcher, requireHeaders });
  const health = await probeHealth(origin, { fetcher });
  if (!health.ok) throw Error('Health status, content type, body, freshness or dependencies failed');
  const checks = [];
  for (const path of ['/pagina-inexistente-wave03', '/patient/pagina-inexistente-wave03', '/api/inexistente-wave03', '/assets/inexistente-wave03.js']) {
    const response = await fetcher(new URL(path, origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (response.status !== 404) throw Error(`Unknown resource did not return 404: ${path}`);
    checks.push({ path, status: response.status });
  }
  const sitemap = await fetcher(new URL('/sitemap.xml', origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const sitemapBody = await sitemap.text();
  const publicPages = ['/', '/ajuda', '/termos', '/privacidade', '/seguranca'];
  const locations = [...sitemapBody.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => match[1].trim());
  if (sitemap.status !== 200 || !/xml/i.test(sitemap.headers.get('content-type') || '') || !sitemapBody.includes('<urlset')
      || locations.length !== publicPages.length || new Set(locations).size !== publicPages.length
      || locations.some(location => { try { const url = new URL(location); return url.origin !== 'https://nellonutri.com.br' || !publicPages.includes(url.pathname) || Boolean(url.search || url.hash || url.username || url.password); } catch { return true; } })) throw Error('Public sitemap policy failed');
  checks.push({ path: '/sitemap.xml', status: sitemap.status });
  const robots = await fetcher(new URL('/robots.txt', origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const robotsBody = await robots.text();
  const privatePaths = ['/patient', '/nutritionist', '/admin', '/f/', '/convite', '/auth/', '/verificar-documento', '/api/'];
  if (robots.status !== 200 || !robots.headers.get('content-type')?.includes('text/plain')
      || privatePaths.some(path => !robotsBody.split(/\r?\n/).some(line => line.trim() === `Disallow: ${path}`))
      || !robotsBody.includes('Sitemap: https://nellonutri.com.br/sitemap.xml')) throw Error('Private application robots policy failed');
  const status = await fetcher(new URL('/status', origin), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (status.status !== 200 || !status.headers.get('content-type')?.includes('text/html') || !/id=["']root["']/.test(await status.text())) throw Error('Public status route failed');
  return { passed: true, capturedAt: new Date().toISOString(), app, health, checks };
}

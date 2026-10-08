import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

for (const mobile of [false, true]) test(`public landing bounds work after new assets on ${mobile ? 'slow mobile' : 'desktop'}`, async ({ page, context }) => {
  await page.setViewportSize(mobile ? { width: 320, height: 640 } : { width: 1440, height: 900 });
  const errors = [], scripts = [];
  page.on('pageerror', () => errors.push('pageerror'));
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 });
  await page.addInitScript(() => {
    window.__wave13 = { lcp: 0, interactions: [] };
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__wave13.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.interactionId) window.__wave13.interactions.push(entry.duration); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('O cuidado não termina');
  // Text can exist before its first paint. Keyboard input ends LCP collection,
  // so wait for the observer's first delivered entry before exercising focus.
  await expect.poll(() => page.evaluate(() => window.__wave13.lcp), {
    timeout: mobile ? 10000 : 6000,
    message: 'LCP observer must report a paint before the first keyboard input',
  }).toBeGreaterThan(0);
  const introduction = page.getByRole('region', { name: 'O cuidado não termina na consulta.', exact: true });
  await introduction.getByRole('link', { name: mobile ? 'Criar conta' : 'Começar com o Nello', exact: true }).focus();
  await page.keyboard.press('Tab');
  const nextAction = introduction.getByRole('link', { name: mobile ? 'Ver o Nello' : 'Ver as telas do Nello', exact: true });
  await expect(nextAction).toBeFocused();
  await expect(nextAction).toHaveAttribute('href', '#nello-em-acao');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => ({ ...window.__wave13, heap: performance.memory?.usedJSHeapSize || 0 }));
  expect(metrics.lcp).toBeGreaterThan(0);
  expect(metrics.lcp).toBeLessThan(mobile ? 8000 : 5000);
  expect(Math.max(0, ...metrics.interactions)).toBeLessThanOrEqual(200);
  expect(metrics.heap).toBeLessThan(80 * 1024 * 1024);
  expect(scripts.some(url => /posthog|replay|jspdf|html2canvas|recharts|AdminLayout/.test(url))).toBe(false);
  expect(errors).toEqual([]);
  const output = '.backend-ci/wave13-results/performance.json';
  mkdirSync('.backend-ci/wave13-results', { recursive: true });
  const observations = mobile && existsSync(output) ? JSON.parse(readFileSync(output)).observations : [];
  observations.push({ device: mobile ? 'mobile_cpu4' : 'desktop', ...metrics });
  writeFileSync(output, JSON.stringify({ capturedAt: new Date().toISOString(), synthetic: true, observations }, null, 2));
});

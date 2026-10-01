import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('real public health checks Auth, database and Storage without disclosing provider details', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  expect(body.status).toBe('operational');
  expect(body.checks).toEqual({ auth: 'operational', database: 'operational', storage: 'operational' });
  expect(Object.keys(body).sort()).toEqual(['checkedAt', 'checks', 'incidents', 'schemaVersion', 'status']);
  expect(JSON.stringify(body)).not.toMatch(/supabase\.co|apikey|service_role|localhost|Bearer/i);
  expect((await request.head('/api/health')).status()).toBe(200);
  const unsupported = await request.post('/api/health');
  expect(unsupported.status()).toBe(405);
  expect(unsupported.headers().allow).toBe('GET, HEAD');
});

test('unknown pages, APIs and assets return real 404 while deep links and robots keep their content types', async ({ request }) => {
  for (const path of ['/pagina-inexistente-wave03', '/patient/pagina-inexistente-wave03', '/api/inexistente', '/assets/inexistente.js']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  for (const path of ['/login', '/update-password?mode=invite', '/auth/v1/verify?token=synthetic', '/f/synthetic', '/verificar-documento/synthetic']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  }
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Disallow: /');
});

for (const width of [390, 1440]) {
  test(`public status remains accessible with Auth requests unavailable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/auth/v1/**', route => route.abort());
    await page.goto('/status');
    await expect(page.getByRole('heading', { name: 'Status do Nello' })).toBeVisible();
    await expect(page.getByText('Arquivos: Operacional')).toBeVisible();
    await expect(page.getByText('Nenhum incidente comunicado.')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.backend-ci/browser-results/status-${width}.png`, fullPage: true });
  });
}

test('public status refuses a 200 HTML fallback', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Nello SPA</html>' }));
  await page.goto('/status');
  await expect(page.getByRole('heading', { name: 'Não foi possível verificar a disponibilidade' })).toBeVisible();
  await expect(page.getByText('Autenticação: Operacional')).toHaveCount(0);
});

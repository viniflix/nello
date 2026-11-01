import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');

async function indicators(page, { failure } = {}) {
  const calls = [];
  const rows = {
    growth_records: [{ id: 91001, weight: 70, record_date: '2026-10-20', created_at: '2026-10-20T10:00:00Z', status: 'active', is_latest_revision: true }],
    patient_progress_measurements: [{ id: 91002, weight: 71, record_date: '2026-10-21', created_at: '2026-10-21T10:00:00Z' }],
    glycemia_records: [{ id: '00000000-0000-4000-8000-000000091003', value: 99, date: '2026-10-21T12:00:00Z', created_at: '2026-10-21T12:00:00Z', condition: 'fasting' }],
  };
  for (const table of Object.keys(rows)) await page.route('**/rest/v1/' + table + '?**', route => {
    calls.push({ table, method: route.request().method() });
    const status = table === 'growth_records' ? failure?.() : null;
    return route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(status ? { message: 'Synthetic indicator failure' } : rows[table]) });
  });
  return calls;
}
async function login(page) {
  await page.goto('/login');
  await page.locator('#email').fill(fixture.personas['patient-a'].email);
  await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/patient\/?$/);
}

for (const width of [320, 768, 1440]) test('patient indicators share values, keyboard navigation and reflow at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.name));
  const calls = await indicators(page);
  await login(page);
  const link = page.getByRole('link', { name: 'Meus Indicadores', exact: true });
  await expect(link).toHaveCount(1);
  await expect(link.getByText('71', { exact: true })).toBeVisible();
  await expect(link.getByText('99', { exact: true })).toBeVisible();
  await expect(link.getByText('Autorregistro', { exact: true })).toBeVisible();
  await expect(link.getByText('Em jejum', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect((await new AxeBuilder({ page }).include('a[href="/patient/progresso"][aria-labelledby]').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/patient\/progresso$/);
  await expect(page.getByRole('button', { name: /ver detalhes de peso/i })).toContainText('71.0 kg');
  await expect(page.getByRole('button', { name: /ver detalhes de glicemia/i })).toContainText('99 mg/dL');
  expect(calls.every(call => call.method === 'GET')).toBe(true);
  expect(errors).toEqual([]);
});

test('a failed weight source preserves independent glucose and supports retry without inviting or saving', async ({ page }) => {
  let failure = 503; const calls = await indicators(page, { failure: () => failure });
  await login(page);
  const link = page.getByRole('link', { name: 'Meus Indicadores', exact: true });
  const card = link.locator('..');
  await expect(link.getByText('99', { exact: true })).toBeVisible();
  await expect(card.getByRole('alert')).toContainText('indisponível');
  failure = null; await card.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(link.getByText('71', { exact: true })).toBeVisible();
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';

assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Disposable loopback stack required');

test('profile outage offers retry and logout without granting private access', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(fixture.personas['patient-a'].email);
  await page.getByLabel('Senha', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/patient$/);
  await expect(page.getByRole('link', { name: 'Plano', exact: true })).toBeVisible();
  const profileRoute = '**/rest/v1/user_profiles?*';
  let requests = 0;
  await page.route(profileRoute, route => {
    requests++;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"QA_PROFILE_UNAVAILABLE"}' });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar seu perfil');
  await expect(page.getByText('Verificando sessão...')).toHaveCount(0);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair da conta', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  const previous = requests;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(previous);
  await page.unroute(profileRoute);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await page.route(profileRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"QA_PROFILE_UNAVAILABLE"}' }));
  await page.reload();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});

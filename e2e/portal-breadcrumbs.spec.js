import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { seed } from './helpers/mealPlanFixture';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Disposable loopback stack required');
async function login(page, persona) {
  await page.goto('/login');
  await page.locator('#email').fill(fixture.personas[persona].email);
  await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(persona.startsWith('patient') ? /\/patient/ : /\/nutritionist/);
}
async function auditBreadcrumb(page) {
  const nav = page.getByRole('navigation', { name: 'Navegação estrutural' });
  await expect(nav).toHaveCount(1);
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page }).include('nav[aria-label="Navegação estrutural"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
}
test('all nutritionist route patterns render breadcrumbs and card surface opens the patient', async ({ page }) => {
  test.setTimeout(180000);
  const sample = seed();
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, 'nutritionist-a');
  const source = readFileSync('src/app/router/nutritionistRoutes.jsx', 'utf8');
  const routes = [...source.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
  for (const pattern of routes) {
    const path = pattern.replace(':patientId', sample.patient).replace(':planId', String(sample.plan))
      .replace(/:(anamnesisId|templateId|id)/g, '00000000-0000-0000-0000-000000000001').replace(':type','diet');
    await page.goto(path);
    await auditBreadcrumb(page);
  }
  await page.goto('/nutritionist/patients');
  await page.getByPlaceholder('Procurar paciente (Nome, Email, CPF...)').fill(`${sample.patient}@example.invalid`);
  // Locate this fixture by its route, independently of any other synthetic patient with the same name.
  const cardLink = page.locator(`a[href="/nutritionist/patients/${sample.patient}/hub"]`).filter({ hasText: 'QA Meal Module' }).first();
  await cardLink.waitFor();
  const card = cardLink.locator('xpath=ancestor::div[contains(@class,"isolate")][1]');
  const box = await card.boundingBox();
  await test.info().attach('patient-card-mobile', { body: await page.screenshot(), contentType: 'image/png' });
  await page.mouse.click(box.x + 8, box.y + box.height - 8);
  await expect(page).toHaveURL(new RegExp(`/patients/${sample.patient}/hub`));
  await page.setViewportSize({ width: 1440, height: 900 });
  await auditBreadcrumb(page);
  await test.info().attach('nutritionist-breadcrumb-desktop', { body: await page.screenshot(), contentType: 'image/png' });
  await page.goto('/nutritionist/patients');
  await page.getByPlaceholder('Procurar paciente (Nome, Email, CPF...)').fill(`${sample.patient}@example.invalid`);
  const actions = page.getByRole('button', { name: 'Ações de QA Meal Module' }).first();
  await actions.click();
  await expect(page.getByRole('menuitem', { name: 'Abrir Prontuário' })).toBeVisible();
  await expect(page).toHaveURL(/\/nutritionist\/patients$/);
  await page.keyboard.press('Escape');
  await cardLink.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/patients/${sample.patient}/hub`));
});
test('all patient routes including full-screen pages render responsive breadcrumbs', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 320, height: 900 });
  await login(page, 'patient-a');
  const source = readFileSync('src/app/router/patientRoutes.jsx', 'utf8');
  for (const [,pattern] of source.matchAll(/path="([^"]+)"/g)) {
    const path = pattern.replace('/:mealId?', '').replace(':sessionId','00000000-0000-0000-0000-000000000001');
    await page.goto(path); await auditBreadcrumb(page);
  }
  await page.goto('/patient/editar-perfil');
  const profileLink = page.getByRole('navigation', { name: 'Navegação estrutural' }).getByRole('link', { name: 'Meu perfil' });
  await profileLink.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/patient\/perfil$/);
  await auditBreadcrumb(page);
  await test.info().attach('patient-breadcrumb-mobile', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await auditBreadcrumb(page);
});

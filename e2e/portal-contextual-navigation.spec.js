import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(process.env.NELLO_FINANCIAL_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');

async function login(page, persona) {
  await page.goto('/login');
  await page.locator('#email').fill(fixture.personas[persona].email);
  await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(persona === 'patient-a' ? /\/patient/ : /\/nutritionist/);
}

for (const width of [320, 820, 1440]) test(`contextual navigation and ancestor menu at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page, 'nutritionist-a');
  for (const root of ['financial', 'agenda', 'templates']) {
    await page.goto(`/nutritionist/${root}`);
    await expect(page.locator('main').getByRole('heading', { name: root === 'agenda' ? 'Agenda de Consultas' : root === 'templates' ? 'Protocolos' : 'Financeiro', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegação estrutural' })).toHaveCount(0);
  }
  await page.goto('/nutritionist/templates/forms/new');
  const nav = page.getByRole('navigation', { name: 'Navegação estrutural' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Nova anamnese');
  await expect(nav.getByRole('link', { name: 'Protocolos' })).toHaveAttribute('href', '/nutritionist/templates?group=forms&ftab=forms');
  await nav.getByRole('link', { name: 'Protocolos' }).click();
  await expect(page).toHaveURL(/templates\?group=forms&ftab=forms/);
  let releaseHub;
  let hubReadRequested = false;
  const hubResponse = new Promise(resolve => { releaseHub = resolve; });
  const hubReadPattern = '**/rest/v1/rpc/get_patient_record_foundation';
  await page.route(hubReadPattern, async route => {
    hubReadRequested = true;
    await hubResponse;
    await route.continue();
  });
  try {
    await page.goto(`/nutritionist/patients/${fixture.personas['patient-a'].id}/anamnese`);
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Anamneses');
    await nav.getByRole('button', { name: 'Ver níveis anteriores' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Prontuário', exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Prontuário', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Prontuário');
    await expect.poll(() => hubReadRequested).toBe(true);
    const hubAreas = page.getByRole('navigation', { name: 'Áreas do prontuário' });
    await expect(page.getByRole('region', { name: 'Resumo clínico do paciente' })).toBeVisible();
    await expect(hubAreas).toHaveCount(0);
    const audit = await new AxeBuilder({ page }).include('nav[aria-label="Navegação estrutural"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    releaseHub();
    await expect(hubAreas).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    releaseHub();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('patient primary navigation and direct-entry forms retain deterministic return paths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'patient-a');
  await expect(page.getByRole('navigation', { name: 'Navegação estrutural' })).toHaveCount(0);
  await page.goto('/patient/add-food');
  await page.getByRole('button', { name: 'Voltar ao diário' }).click();
  await expect(page).toHaveURL(/\/patient\/diario$/);
  await page.goto('/patient/editar-perfil');
  const nav = page.getByRole('navigation', { name: 'Navegação estrutural' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Editar perfil');
  await nav.getByRole('link', { name: 'Meu perfil' }).click();
  await expect(page).toHaveURL(/\/patient\/perfil$/);
});

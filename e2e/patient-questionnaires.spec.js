import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function login(page) {
  await page.route('https://**/*', route => route.abort('blockedbyclient'));
  await page.goto('/login');
  await page.locator('#email').fill(fixture.personas['patient-a'].email);
  await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/patient/);
}
test('profile links to private questionnaires and both reads target the current patient', async ({ page }) => {
  const reads = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/rest/v1/checkin_sessions') reads.push(url.searchParams); });
  await login(page);
  await page.goto('/patient/perfil');
  const link = page.getByRole('link', { name: /Meus Questionários/ });
  await expect(link).toHaveAttribute('href', '/patient/questionarios');
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Meus Questionários', exact: true })).toBeVisible();
  await expect(page.getByText('Nenhum questionário pendente.')).toBeVisible();
  await expect(page.getByText('Você ainda não respondeu a questionários.')).toBeVisible();
  expect(reads.some(params => params.get('status') === 'eq.pending')).toBe(true);
  expect(reads.some(params => params.get('status') === 'eq.completed')).toBe(true);
  expect(reads.every(params => params.get('patient_id') === 'eq.' + fixture.personas['patient-a'].id)).toBe(true);
  for (const [width, height, size] of [[320, 900, 32], [900, 390, 16]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(size => { document.documentElement.style.fontSize = size + 'px'; }, size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(axe.violations.map(v => v.id)).toEqual([]);
  }
  await page.getByRole('link', { name: 'Voltar ao perfil' }).click();
  await expect(page).toHaveURL(/\/patient\/perfil$/);
});
test('failed questionnaire reads stay distinct from empty and recover through explicit retry', async ({ page }) => {
  await login(page);
  let failing = true;
  await page.route('**/rest/v1/checkin_sessions?**', route => failing
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic unavailable check-in read' }) })
    : route.continue());
  await page.goto('/patient/questionarios');
  await expect(page.getByText('Não foi possível verificar seus check-ins.')).toBeVisible();
  await expect(page.getByText('Não foi possível carregar o histórico de check-ins.')).toBeVisible();
  await expect(page.getByText('Nenhum questionário pendente.')).toHaveCount(0);
  await expect(page.getByText('Você ainda não respondeu a questionários.')).toHaveCount(0);
  failing = false;
  await page.getByText('Não foi possível verificar seus check-ins.').locator('..').locator('..').getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.getByText('Não foi possível carregar o histórico de check-ins.').locator('..').locator('..').getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('Nenhum questionário pendente.')).toBeVisible();
  await expect(page.getByText('Você ainda não respondeu a questionários.')).toBeVisible();
});

test('loaded questionnaires keep long titles, actions and neutral scores inside their cards at320/text200', async ({ page }, testInfo) => {
  await login(page);
  const title = 'Acompanhamento nutricional semanal com orientações de rotina';
  await page.route('**/rest/v1/checkin_sessions?**', route => {
    const completed = new URL(route.request().url()).searchParams.get('status') === 'eq.completed';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: completed ? '3136fdd3-7209-49fe-bfa6-9305ab73169f' : '9f51b15a-a066-401e-916e-01618107c738', completed_at: completed ? '2026-11-01T12:00:00Z' : null, adherence_percentage: null, checkin_templates: { name: title, checkin_fields: [] } }]) });
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/patient/questionarios');
  await expect(page.getByRole('button', { name: 'Responder Agora' })).toBeVisible();
  await expect(page.getByText('Sem pontuação')).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  const clipping = await page.locator('main').evaluate(main => {
    const problems = [];
    for (const element of main.querySelectorAll('button,p,h1,h2,h3,h4,span')) {
      if (element.closest('.sr-only')) continue;
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue;
      const name = element.textContent.trim().slice(0, 100);
      if (rect.left < -1 || rect.right > innerWidth + 1) problems.push({ name, reason: 'viewport' });
      for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
        const bounds = parent.getBoundingClientRect();
        if (['hidden','clip'].includes(getComputedStyle(parent).overflowX) && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) { problems.push({ name, reason: 'ancestor clipping' }); break; }
      }
      for (const child of element.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(child);
        if ([...range.getClientRects()].some(r => r.left < rect.left - 1 || r.right > rect.right + 1)) problems.push({ name, reason: 'text overlap' });
      }
    }
    return problems;
  });
  await testInfo.attach('loaded-questionnaire-clipping', { body: JSON.stringify(clipping), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('loaded-questionnaires.png'), fullPage: true, animations: 'disabled' });
  expect(clipping).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
});

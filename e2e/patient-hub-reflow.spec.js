import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
const longName = 'Maria Aparecida de Albuquerque e Vasconcelos';
for (const [width, fontSize, loadedPlan, planReadError] of [[320, 32, false, false], [768, 16, false, false], [1440, 16, false, false], [320, 32, true, false], [320, 32, true, true]]) {
  test('loaded patient hub keeps content and controls reachable at ' + width + '/' + fontSize + (planReadError ? ' with plan read error' : loadedPlan ? ' with plan' : ''), async ({ page }, testInfo) => {
    await page.route('https://**/*', route => route.abort('blockedbyclient'));
    // Exercise a long synthetic name without changing the disposable profile or other visual fixtures.
    await page.route('**/rest/v1/**', async route => {
      if (loadedPlan && new URL(route.request().url()).pathname === '/rest/v1/meal_plans') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 900000001, name: 'Plano alimentar sintético de acompanhamento semanal', is_active: true, is_draft: false, prescription_status: 'finalized', daily_calories: 1800, daily_protein: 120, daily_carbs: 200, daily_fat: 60 }]) });
      }
      if (planReadError && new URL(route.request().url()).pathname === '/rest/v1/meal_plan_meals') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic unavailable plan meals' }) });
      }
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replaceAll('QA patient-a', longName) });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto('/nutritionist/patients/' + fixture.personas['patient-a'].id + '/hub');
    const identity = page.getByRole('button', { name: 'Editar informações de ' + longName, exact: true });
    await expect(identity).toBeVisible();
    await expect(page.getByText('60 kg', { exact: true })).toBeVisible();
    if (loadedPlan) await expect(page.getByText('Plano alimentar sintético de acompanhamento semanal', { exact: true })).toBeVisible();
    await page.evaluate(size => { document.documentElement.style.fontSize = size + 'px'; }, fontSize);
    await page.evaluate(async () => { await document.fonts.ready; });
    const clipping = await page.locator('main').evaluate(main => {
      const problems = [];
      const controls = [...main.querySelectorAll('button,a')];
      const summary = main.querySelector('h1')?.closest('.shadow-card');
      const plan = [...main.querySelectorAll('h2')].find(el => el.textContent === 'Plano alimentar')?.closest('section');
      const elements = [...new Set([...controls, ...main.querySelectorAll('h2,p:not(.truncate)'), ...(plan ? plan.querySelectorAll('p') : []), ...(summary ? summary.querySelectorAll('p,h1,span') : [])])];
      for (const element of elements) {
        if (element.closest('.sr-only,[role="tooltip"]')) continue;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue;
        const name = (element.getAttribute('aria-label') || element.textContent).trim().slice(0, 100);
        if (rect.left < -1 || rect.right > innerWidth + 1) problems.push({ name, reason: 'viewport', left: rect.left, right: rect.right });
        for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
          const bounds = parent.getBoundingClientRect();
          if (['hidden', 'clip'].includes(getComputedStyle(parent).overflowX) && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) {
            problems.push({ name, reason: 'ancestor clips horizontal content' }); break;
          }
        }
        for (const child of element.childNodes) {
          if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(child);
          for (const textRect of range.getClientRects()) {
            if (textRect.left < rect.left - 1 || textRect.right > rect.right + 1 || textRect.top < rect.top - 1 || textRect.bottom > rect.bottom + 1) {
              problems.push({ name, reason: 'text outside control or label' }); break;
            }
          }
        }
      }
      return problems;
    });
    await testInfo.attach('hub-clipping', { body: JSON.stringify(clipping), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('hub-loaded.png'), fullPage: true, animations: 'disabled' });
    expect(clipping).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const help = page.getByRole('button', { name: 'Entenda esta recomendação', exact: true });
    await help.focus(); await page.keyboard.press('Enter');
    const details = page.getByRole('dialog', { name: 'Detalhes da recomendação' });
    await expect(details).toBeVisible();
    const bounds = await details.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape'); await expect(details).not.toBeVisible();
    await expect(help).toBeFocused();
    await identity.focus(); await expect(identity).toBeFocused();
    await page.keyboard.press('Enter');
    const profile = page.getByRole('dialog', { name: 'Editar perfil do paciente', exact: true });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Alterar foto do paciente', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(identity).toBeFocused();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(axe.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([]);
  });
}

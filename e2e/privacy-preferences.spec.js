import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));

for (const width of [320, 768, 1440]) {
  test(`privacy choice survives reload and logout without a floating saved panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ajuda');
    const preferences = page.getByRole('complementary', { name: 'Preferências de cookies' });
    await preferences.getByRole('button', { name: width === 768 ? 'Aceitar todos' : 'Recusar não essenciais' }).click();
    await expect(preferences).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ajuda para acessar o Nello', exact: true })).toBeVisible();
    await expect(preferences).toHaveCount(0);
    await page.goto('/login');
    await expect(preferences).toHaveCount(0);
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto('/privacidade');
    await preferences.getByRole('button', { name: 'Preferências de privacidade' }).click();
    await expect(preferences.getByRole('checkbox')).toBeChecked();
    await preferences.getByRole('button', { name: 'Sem analytics', exact: true }).click();
    await expect(preferences.getByRole('status')).toHaveText('Preferências salvas.');
    expect(await preferences.evaluate(node => getComputedStyle(node).position)).toBe('static');
    await page.goto('/ajuda');
    await expect(page.getByRole('heading', { name: 'Ajuda para acessar o Nello', exact: true })).toBeVisible();
    await expect(preferences).toHaveCount(0);
    await page.reload(); await expect(preferences).toHaveCount(0);
    await page.goto('/nutritionist');
    await page.getByRole('button', { name: 'Abrir menu da conta', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(preferences).toHaveCount(0);
    await page.reload(); await expect(preferences).toHaveCount(0);
    await page.goto('/privacidade');
    await preferences.getByRole('button', { name: 'Preferências de privacidade' }).click();
    await expect(preferences.getByText('Analytics de navegação é opcional e está desligado. A recusa não bloqueia o Nello.')).toBeVisible();
    await preferences.getByRole('button', { name: 'Fechar preferências' }).click();
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(audit.violations.map(v => v.id)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

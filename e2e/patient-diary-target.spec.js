import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Disposable loopback stack required');

test('patient without prescription keeps the diary without a fabricated clinical target at all layouts', async ({ page }) => {
  const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status', '--workdir', '.backend-ci', '--output', 'json']), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (status.API_URL !== 'http://127.0.0.1:54321') throw Error('Disposable Auth required');
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${randomUUID()}@example.invalid`;
  const identity = await admin.auth.admin.createUser({ email, password: fixture.password, email_confirm: true, user_metadata: { name: 'QA Sem prescrição', user_type: 'nutritionist', legal_version: '2026-10-01.2', terms_accepted: true, analytics_allowed: false } });
  expect(identity.error).toBeNull();
  const id = identity.data.user.id;
  try {
    expect((await admin.auth.admin.updateUserById(id, { app_metadata: { nello_role: 'patient' } })).error).toBeNull();
    expect((await admin.from('user_profiles').update({ user_type: 'patient', is_admin: false }).eq('id', id)).error).toBeNull();
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/patient$/);
    await page.getByRole('link', { name: 'Plano', exact: true }).click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByText('Meta não definida', { exact: true })).toHaveCount(4);
      await expect(page.getByText('0 kcal', { exact: true })).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Registrar Outra Refeição', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.waitForFunction(() => [...document.querySelectorAll('.patient-page-content p')].every(node => {
        for (let parent = node; parent; parent = parent.parentElement) if (Number(getComputedStyle(parent).opacity) < 1) return false;
        return true;
      }));
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await test.info().attach(`no-prescription-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    await page.reload();
    await expect(page.getByText('Meta não definida', { exact: true })).toHaveCount(4);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const trigger = page.getByRole('button', { name: 'Configurar lembretes', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Preferências de Lembrete', exact: true });
      for (const name of ['Lembrete de diário', 'Lembrete de medidas', 'Canal in-app']) {
        await expect(dialog.getByRole('switch', { name, exact: true })).toBeVisible();
      }
      // Reload also restarts the diary's entrance animation behind the dialog.
      // Contrast must be measured after both surfaces reach their final opacity.
      await page.waitForFunction(() => [...document.querySelectorAll('.patient-page-content p, [role="dialog"]')].every(node => {
        for (let parent = node; parent; parent = parent.parentElement) if (Number(getComputedStyle(parent).opacity) < 1) return false;
        return true;
      }));
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
    const notificationTrigger = page.getByRole('button', { name: 'Abrir notificações', exact: true });
    await notificationTrigger.click();
    const notifications = page.getByRole('dialog', { name: 'Notificações', exact: true });
    await expect(notifications).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notifications).not.toBeVisible();
    await expect(notificationTrigger).toBeFocused();
  } finally {
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

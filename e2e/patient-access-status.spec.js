import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));

test('confirmed patient with optional password reminder remains in active treatment filter', async ({ page }) => {
  const patient = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = fixture.personas['patient-a'];
  expect((await patient.auth.signInWithPassword({ email: identity.email, password: fixture.password })).error).toBeNull();
  expect((await patient.from('user_profiles').update({ needs_password_reset: true }).eq('id', identity.id)).error).toBeNull();
  try {
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto('/nutritionist/patients');
    await expect(page.getByText('QA patient-a', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Convite Pendente', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Filtros Avançados' }).click();
    await page.getByRole('menuitemradio', { name: 'Em Tratamento (Ativos)', exact: true }).click();
    await expect(page.getByText('QA patient-a', { exact: true }).first()).toBeVisible();
    const profile = await patient.from('user_profiles').select('needs_password_reset').eq('id', identity.id).single();
    expect(profile.data.needs_password_reset).toBe(true);
  } finally {
    expect((await patient.from('user_profiles').update({ needs_password_reset: false }).eq('id', identity.id)).error).toBeNull();
    await patient.auth.signOut();
  }
});

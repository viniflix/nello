import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { seed } from './helpers/mealPlanFixture';
import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from '../scripts/qa/isolated-runtime.mjs';
import { assertSyntheticRecoveryIdentities } from '../scripts/qa/recovery-identities.mjs';
import { inspectPdf } from '../scripts/qa/pdf-content.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Disposable loopback stack required');

test('official meal-plan document recovers lookup, guides identity and preserves real issuance across screen sizes', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Dedicated synthetic professional; no dependency on other journeys' identities.
  const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status', '--workdir', '.backend-ci', '--output', 'json']), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  if (status.API_URL !== 'http://127.0.0.1:54321') throw Error('Disposable service required');
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${randomUUID()}@example.invalid`;
  const account = await admin.auth.admin.createUser({ email, password: fixture.password, email_confirm: true, user_metadata: { user_type: 'nutritionist', name: 'QA Documentos', legal_version: '2026-10-01.2', terms_accepted: true, analytics_allowed: false } });
  expect(account.error).toBeNull();
  const persona = { id: account.data.user.id, email: `${account.data.user.id}@example.invalid` };
  const registered = await admin.auth.admin.updateUserById(persona.id, { email: persona.email, email_confirm: true });
  expect(registered.error).toBeNull();
  const inventory = JSON.parse(execFileSync('docker', ['exec', '-i', 'supabase_db_nello-reconstruction', 'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: 'SELECT json_agg(json_build_object(\'id\',id,\'email\',email)) FROM auth.users;', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  expect(assertSyntheticRecoveryIdentities(inventory, fixture.personas)).toBeGreaterThanOrEqual(10);
  execFileSync('docker', ['exec', '-i', 'supabase_db_nello-reconstruction', 'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `UPDATE public.professional_verifications SET status='approved',professional_role='nutritionist',crn_region='CRN-3',crn_number='QA-'||user_id::text,normalized_crn='QA'||user_id::text,verification_method='approved_by_migration',valid_until=now()+interval '1 year' WHERE user_id='${persona.id}';`, stdio: ['pipe', 'pipe', 'pipe'] });
  const sample = seed(persona.id);
  await page.goto('/login'); await page.locator('#email').fill(persona.email); await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(/\/nutritionist/);
  let calls = 0, release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/rest/v1/rpc/list_document_artifacts', async route => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic temporary outage' }) });
    if (calls === 2) { const response = await route.fetch(); await waiting; return route.fulfill({ response }); }
    return route.continue();
  });
  const path = `/nutritionist/patients/${sample.patient}/meal-plan`;
  await page.goto(path);
  const retry = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  await expect(retry).toBeVisible(); await expect(page.getByRole('button', { name: 'Preparar', exact: true })).toHaveCount(0);
  await retry.click(); await expect(page.getByText('Consultando documentos…', { exact: true })).toBeVisible();
  await expect(retry).toBeDisabled(); release();
  await expect(page.getByRole('button', { name: 'Preparar', exact: true })).toBeEnabled();
  const missingIdentity = page.waitForResponse(response => response.url().endsWith('/rpc/create_document_artifact_from_meal_plan'));
  await page.getByRole('button', { name: 'Preparar', exact: true }).click();
  expect((await (await missingIdentity).json()).message).toBe('responsible_document_identity_required');
  await expect(page.getByText('Configure os dados da identidade documental do profissional responsável antes de emitir.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Configurar identidade documental' }).click(); await expect(page).toHaveURL(/profile\?tab=documents/);
  await page.locator('#document-professional-name').fill('QA Documento Plano');
  const saved = page.waitForResponse(response => response.url().endsWith('/rpc/save_my_document_identity'));
  await page.getByRole('button', { name: 'Salvar identidade documental', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Notifications (F8)' }).getByText(/Versão \d+ preservada no histórico\./)).toBeVisible();
  await page.goto(path); await page.getByRole('button', { name: 'Preparar', exact: true }).click();
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await page.getByRole('button', { name: 'Assinar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PDF oficial', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'PDF oficial', exact: true }).click();
  const downloaded = await download;
  expect(await downloaded.failure()).toBeNull();
  const officialPdf = await inspectPdf(readFileSync(await downloaded.path()));
  expect(officialPdf.pages).toBeGreaterThan(0);
  for (const value of ['Nello', '100 kcal', 'QA Alimento do café', 'não contabilizada', 'Status: Assinado']) expect(officialPdf.text).toContain(value);
  for (const field of ['professional_confirmation', 'source_snapshot', 'responsible_id', 'prepared_by']) expect(officialPdf.text).not.toContain(field);
  // Exercise the real toast keyboard path; then audit the persistent workspace.
  // Active notifications receive a separate full Axe audit in toast-accessibility.
  await page.keyboard.press('F8');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="region"]')?.getAttribute('aria-label'))).toBe('Notifications (F8)');
  for (let count = 0; count < 3 && await page.getByRole('button', { name: 'Fechar aviso', exact: true }).count(); count++) {
    await page.getByRole('button', { name: 'Fechar aviso', exact: true }).last().click();
  }
  await expect(page.getByRole('button', { name: 'Fechar aviso', exact: true })).toHaveCount(0);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'PDF oficial', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const violations = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(violations.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary, html: node.html })) }))).toEqual([]);
    await test.info().attach(`official-document-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});

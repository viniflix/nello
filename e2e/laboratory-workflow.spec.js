import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

test.use({ timezoneId: 'America/Fortaleza' });

const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback laboratory fixture required');
const owner = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const prefix = `QA RC01 ${randomUUID().slice(0, 8)}`;
const patient = fixture.personas['patient-a'].id;
const created = new Set();

test.beforeEach(async ({ page }) => {
  // Refuse hosted Supabase requests even if someone builds with the wrong env.
  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, route => route.abort('blockedbyclient'));
});

test.beforeAll(async () => {
  const signed = await owner.auth.signInWithPassword({ email: fixture.personas['nutritionist-a'].email, password: fixture.password });
  expect(signed.error).toBeNull();
  for (let start = 0; start < 51; start += 4) {
    await Promise.all(Array.from({ length: Math.min(4, 51 - start) }, async (_, offset) => {
      const result = await owner.rpc('create_lab_result_record', { p_payload: {
        patient_id: patient, test_name: `${prefix} ${start + offset}`, test_value: '5.5', test_unit: 'mg/dL',
        reference_min: 5.2, reference_max: 6, test_date: '2026-10-01', status: 'normal',
      } });
      expect(result.error).toBeNull(); created.add(result.data.id);
    }));
  }
});

test.afterAll(async () => {
  if (created.size) {
    const active = await owner.from('lab_results').select('id').in('id', [...created]).eq('is_latest_revision', true).eq('record_status', 'active');
    expect(active.error).toBeNull();
    for (const row of active.data || []) {
      const result = await owner.rpc('invalidate_lab_result_record', { p_result_id: row.id, p_reason: 'Encerramento dos registros sintéticos próprios da regressão RC01' });
      expect(result.error).toBeNull();
    }
  }
  await owner.auth.signOut();
});

async function open(page) {
  await page.goto('/login');
  await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
  await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/nutritionist/);
  await page.goto(`/nutritionist/patients/${patient}/lab-results`);
  await expect(page.getByRole('heading', { name: 'Exames Laboratoriais', exact: true })).toBeVisible();
  await expect(page.getByText(/Histórico carregado:/)).toBeVisible();
}

test('searches a real synthetic history beyond 50 results', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByLabel('Buscar exame').fill(`${prefix} 0`);
  await expect(page.getByRole('heading', { name: `${prefix} 0`, exact: true })).toBeVisible();
  const card = page.locator('.hover\\:shadow-md').filter({ has: page.getByRole('heading', { name: `${prefix} 0`, exact: true }) });
  await expect(card.getByText('01/10/2026', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('laboratory-mobile.png'), fullPage: true });
});

test('decimal preview, persistence and revision preserve the prior record', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole('button', { name: 'Adicionar Exame', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const name = `${prefix} decimal`;
  await dialog.getByLabel(/Nome do Exame/).fill(name);
  await dialog.getByLabel('Valor do Resultado').fill('5,5');
  await dialog.getByLabel('Unidade', { exact: true }).fill('mg/dL');
  await dialog.getByLabel('Referência Mínima').fill('5,2');
  await dialog.getByLabel('Referência Máxima').fill('6');
  await expect(dialog.getByText('Normal', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(dialog).toBeHidden();
  const first = await owner.from('lab_results').select('id,test_value,reference_min,reference_max,status,reference_snapshot').eq('patient_id', patient).eq('test_name', name).eq('is_latest_revision', true).single();
  expect(first.error).toBeNull(); created.add(first.data.id);
  expect(first.data).toMatchObject({ test_value: '5.5', reference_min: 5.2, reference_max: 6, status: 'normal' });
  await page.getByLabel('Buscar exame').fill(name);
  const card = page.locator('.hover\\:shadow-md').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await card.getByTitle('Editar').click();
  await dialog.getByLabel('Valor do Resultado').fill('6,5');
  await expect(dialog.getByText('Alto', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(dialog).toBeHidden();
  const revised = await owner.from('lab_results').select('id,test_value,status').eq('patient_id', patient).eq('test_name', name).eq('is_latest_revision', true).single();
  expect(revised.error).toBeNull(); created.add(revised.data.id);
  expect(revised.data).toMatchObject({ test_value: '6.5', status: 'high' });
  expect(revised.data.id).not.toBe(first.data.id);
  const original = await owner.from('lab_results').select('test_value,is_latest_revision,reference_snapshot').eq('id', first.data.id).single();
  expect(original.error).toBeNull();
  expect(original.data).toEqual({ test_value: '5.5', is_latest_revision: false, reference_snapshot: first.data.reference_snapshot });
});

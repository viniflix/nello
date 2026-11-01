import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
async function login(page, role = 'patient-a') {
  await page.goto('/login'); await page.locator('#email').fill(fixture.personas[role].email);
  await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(role === 'patient-a' ? /\/patient\/?$/ : /\/nutritionist\/?$/);
}
async function editProfile(page) {
  await login(page); await page.goto('/patient/perfil');
  await page.getByRole('button', { name: 'Editar Informações' }).click();
  await expect(page.getByRole('heading', { name: 'Editar Perfil', exact: true })).toBeVisible();
  const field = page.getByLabel('Nome Completo *'); const original = await field.inputValue();
  await field.fill('QA unconfirmed navigation draft'); return { field, original };
}

test('profile button and real browser Back share one confirmation and keep cancelled edits', async ({ page }) => {
  const native = []; page.on('dialog', async dialog => { native.push(dialog.type()); await dialog.dismiss(); });
  const { field } = await editProfile(page);
  await page.getByRole('button', { name: 'Voltar ao perfil' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(field).toHaveValue('QA unconfirmed navigation draft');
  await expect(page.getByRole('button', { name: 'Voltar ao perfil' })).toBeFocused();
  await page.goBack(); await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page).toHaveURL(/\/patient\/editar-perfil$/);
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(field).toHaveValue('QA unconfirmed navigation draft');
  await page.getByRole('button', { name: 'Voltar ao perfil' }).click();
  await page.getByRole('button', { name: 'Sair sem confirmação' }).click();
  await expect(page).toHaveURL(/\/patient\/perfil$/); expect(native).toEqual([]);
});

test('an unconfirmed profile edit warns before reload and is not persisted in browser storage', async ({ page }) => {
  const { field, original } = await editProfile(page);
  const origin = await page.evaluate(() => performance.timeOrigin);
  expect(await page.evaluate(() => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => value.includes('QA unconfirmed navigation draft'))))).toBe(false);
  const cancelledReload = page.waitForEvent('dialog');
  await page.evaluate(() => { setTimeout(() => window.location.reload(), 0); });
  const cancelledDialog = await cancelledReload; expect(cancelledDialog.type()).toBe('beforeunload'); await cancelledDialog.dismiss();
  await expect(field).toHaveValue('QA unconfirmed navigation draft');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  const reloadedDocument = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  const acceptedReload = page.waitForEvent('dialog');
  await page.evaluate(() => { setTimeout(() => window.location.reload(), 0); });
  const acceptedDialog = await acceptedReload; expect(acceptedDialog.type()).toBe('beforeunload'); await acceptedDialog.accept();
  await reloadedDocument;
  await expect(page.getByLabel('Nome Completo *')).toHaveValue(original);
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
});

test('an obsolete chunk never reloads an open draft automatically and recovery requires explicit consent', async ({ page }) => {
  const { field } = await editProfile(page); const origin = await page.evaluate(() => performance.timeOrigin);
  const failedChunk = '**/assets/PatientProgressPage-*.js';
  await page.route(failedChunk, route => route.abort('failed'));
  await page.locator('a[href="/patient/progresso"]:visible').first().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(field).toHaveValue('QA unconfirmed navigation draft');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.locator('a[href="/patient/progresso"]:visible').first().click();
  await page.getByRole('button', { name: 'Sair sem confirmação' }).click();
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar esta área' })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Atualizar página' }).click();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin);
  await page.unroute(failedChunk); page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Atualizar página' }).click();
  await expect(page.getByRole('heading', { name: /Progresso|Evolução/i }).first()).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(origin);
});

test('a forbidden month response removes an already open real agenda transaction detail', async ({ page }) => {
  await login(page, 'nutritionist-a');
  await page.addInitScript(({ owner }) => {
    if (location.pathname === '/nutritionist/financial') history.replaceState({ ...history.state, usr: { agendaReturn: { userId: owner, date: '2026-11-01', view: 'today' }, agendaTransactionId: 91071 } }, '', location.href);
  }, { owner: fixture.personas['nutritionist-a'].id });
  let release; const ready = new Promise(resolve => { release = resolve; });
  const row = { id: 91071, nutritionist_id: fixture.personas['nutritionist-a'].id, description: 'QA private financial detail', type: 'income', amount: 17, status: 'paid', transaction_date: '2026-11-01' };
  await page.route('**/rest/v1/financial_transactions?**', async route => {
    expect(route.request().method()).toBe('GET');
    if (new URL(route.request().url()).searchParams.has('id')) return route.fulfill({ json: row });
    await ready; return route.fulfill({ status: 403, json: { code: '42501', message: 'Synthetic denied read' } });
  });
  try {
    await page.goto('/nutritionist/financial');
    await expect(page.getByRole('dialog', { name: 'Detalhes da transação' })).toBeVisible();
    release();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Gestão financeira' })).toHaveCount(0);
    await expect(page.getByText('QA private financial detail', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  } finally { release(); }
});

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
const fixture = JSON.parse(readFileSync(process.env.NELLO_FINANCIAL_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
// Keep mutation journeys away from the owner used by the shared visual baselines.
const financePersona = fixture.url === 'http://localhost:54321' ? 'nutritionist-b' : 'nutritionist-a';
async function login(page, persona = 'nutritionist-a') {
    await page.goto('/login'); await page.locator('#email').fill(fixture.personas[persona].email); await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto('/nutritionist/financial'); await expect(page.getByRole('heading', { name: 'Financeiro', exact: true })).toBeVisible();
}
async function pending() {
    const client = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email: fixture.personas[financePersona].email, password: fixture.password })).error).toBeNull();
    const description = 'Synthetic cascade ' + randomUUID(), date = new Date().toISOString().slice(0, 10), actor = fixture.personas[financePersona].id;
    const patient = fixture.personas[financePersona === 'nutritionist-b' ? 'patient-b' : 'patient-a'].id;
    const saved = await client.rpc('mutate_record_idempotently', { p_table: 'financial_transactions', p_values: { nutritionist_id: actor, patient_id: patient, type: 'income', category: 'consulta', description, amount: 17.25, status: 'pending', transaction_date: date, due_date: date }, p_id: null, p_expected: null, p_nonce: randomUUID(), p_actor: actor });
    expect(saved.error).toBeNull(); await client.auth.signOut(); return description;
}
async function expandPending(page) {
    const details = page.locator('#pending-payments details');
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}
test('monthly payment confirmation refreshes global pending, and global confirmation refreshes monthly history', async ({ page }) => {
    const first = await pending(), second = await pending(); await login(page, financePersona); await expandPending(page);
    const table = page.getByRole('table', { name: 'Histórico de transações' });
    const row = table.getByRole('row').filter({ hasText: first }); await expect(row).toBeVisible();
    const revised = first + ' revised';
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Descrição *', { exact: true }).fill(revised);
    await page.getByRole('dialog').getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); await expect(row.getByText(revised, { exact: true })).toBeVisible();
    await expandPending(page); await expect(page.locator('#pending-payments').getByText(revised, { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Mais ações da transação' }).click(); await page.getByRole('menuitem', { name: 'Confirmar recebimento', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(row.getByText('Pago', { exact: true })).toBeVisible(); await expandPending(page);
    await expect(page.locator('#pending-payments').getByText(revised, { exact: true })).toHaveCount(0);
    const charge = page.locator('#pending-payments li').filter({ hasText: second }); await expect(charge).toBeVisible();
    await charge.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
    await expect(table.getByRole('row').filter({ hasText: second }).getByText('Pago', { exact: true })).toBeVisible();
    await expect(page.locator('#pending-payments').getByText(second, { exact: true })).toHaveCount(0);
    await table.getByRole('row').filter({ hasText: second }).getByRole('button', { name: second, exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Detalhes da transação'); await expect(page.getByRole('dialog')).toContainText('R$ 17,25');
    await page.keyboard.press('Escape');
    await page.locator('summary').filter({ hasText: 'Dados do fluxo de caixa' }).click();
    await expect(page.getByRole('table', { name: 'Dados do fluxo de caixa', exact: true })).toContainText('Recebimentos');
});
test('unlinking a service retains manual values and a failed save retains the form for recovery', async ({ page }) => {
    const client = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email: fixture.personas[financePersona].email, password: fixture.password })).error).toBeNull();
    const name = 'Synthetic unlink ' + randomUUID(), actor = fixture.personas[financePersona].id;
    const saved = await client.rpc('mutate_record_idempotently', { p_table: 'services', p_values: { nutritionist_id: actor, name, price: 80, category: 'consulta', active: true }, p_id: null, p_expected: null, p_nonce: randomUUID(), p_actor: actor });
    expect(saved.error).toBeNull(); await client.auth.signOut(); await login(page, financePersona);
    await page.getByRole('button', { name: 'Nova Transação', exact: true }).click(); const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Serviço (opcional)', exact: true }).click(); await page.getByRole('option').filter({ hasText: name }).click();
    await dialog.getByLabel('Descrição *', { exact: true }).fill('Synthetic manually edited');
    await dialog.getByLabel('Valor Total (R$) *', { exact: true }).fill('91');
    await dialog.getByRole('combobox', { name: 'Serviço (opcional)', exact: true }).click(); await page.getByRole('option', { name: 'Nenhum', exact: true }).click();
    await expect(dialog.getByLabel('Descrição *', { exact: true })).toHaveValue('Synthetic manually edited'); await expect(dialog.getByLabel('Valor Total (R$) *', { exact: true })).toHaveValue('91');
    await page.route('**/rest/v1/rpc/mutate_record_idempotently', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SYNTHETIC_QA_UNAVAILABLE' }) }));
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Não foi possível confirmar');
    await expect(dialog.getByLabel('Descrição *', { exact: true })).toHaveValue('Synthetic manually edited'); await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeEnabled();
});
test('dark financial workspace preserves legibility and has no page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 }); await login(page, financePersona);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(page.locator('#pending-payments').getByRole('status')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('CSV export retains the complete month while the table has an active search', async ({ page }) => {
    const first = await pending(), second = await pending(); await login(page, financePersona);
    await page.getByRole('textbox', { name: 'Buscar transações' }).fill(first);
    const table = page.getByRole('table', { name: 'Histórico de transações' });
    await expect(table.getByText(first, { exact: true })).toBeVisible(); await expect(table.getByText(second, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Exportar mês', exact: true }).click();
    const downloaded = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Exportar CSV', exact: true }).click();
    const file = await downloaded; const text = readFileSync(await file.path(), 'utf8');
    expect(text).toContain(first); expect(text).toContain(second); expect(text).toContain('17,25');
});
test('failed pending read is visible and can recover without calling it an empty result', async ({ page }) => {
    const blocker = async route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SYNTHETIC_QA_UNAVAILABLE' }) });
    const match = url => url.pathname.endsWith('/financial_transactions') && url.searchParams.get('status') === 'in.(pending,overdue)';
    await page.route(match, blocker); await login(page);
    const panel = page.locator('#pending-payments'); await expect(panel.getByRole('alert')).toContainText('Isso não significa');
    await expect(panel.getByText(/Nenhuma cobrança/)).toHaveCount(0);
    await page.unroute(match, blocker); await panel.getByRole('button', { name: 'Tentar carregar cobranças' }).click();
    await expect(panel.getByRole('alert')).toHaveCount(0); await expect(panel.getByRole('status')).toHaveCount(0);
});
for (const width of [390, 820, 1440]) test(`financial workspace hierarchy, accessibility, details and reduced motion ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await login(page);
    await expect(page.locator('#pending-payments').getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nova Transação', exact: true })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Navegação estrutural' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Resumo financeiro do mês' })).toBeVisible();
    await page.getByRole('button', { name: 'Exportar mês' }).click(); await expect(page.getByRole('menu')).toContainText(/Mês completo/); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Nova Transação', exact: true }).click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    expect((await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    const save = await dialog.getByRole('button', { name: 'Salvar', exact: true }).boundingBox(); expect(save.y + save.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

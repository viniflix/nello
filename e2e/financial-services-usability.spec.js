import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const fixture = JSON.parse(readFileSync(process.env.NELLO_FINANCIAL_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
async function login(page) {
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/nutritionist/);
}

test('service details survive creation, edits from both screens, and deactivation preserves history', async ({ page }) => {
    const client = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email: fixture.personas['nutritionist-a'].email, password: fixture.password })).error).toBeNull();
    const name = `Synthetic financial UX service ${Date.now()}`;
    try {
        await login(page);
        await page.goto('/nutritionist/financial');
        await page.getByRole('button', { name: 'Gerenciar Serviços', exact: true }).click();
        await page.getByRole('button', { name: 'Novo Serviço', exact: true }).click();
        const form = page.getByRole('dialog', { name: 'Novo Serviço', exact: true });
        await form.getByLabel('Nome do Serviço *', { exact: true }).fill(name);
        await form.getByLabel('Descrição', { exact: true }).fill('Synthetic persisted description');
        await form.getByLabel('Preço (R$) *', { exact: true }).fill('80');
        await form.getByRole('combobox').click();
        await page.getByRole('option', { name: 'Plano Mensal', exact: true }).click();
        await form.getByRole('button', { name: 'Salvar', exact: true }).click();
        const row = page.getByRole('table', { name: 'Serviços', exact: true }).getByRole('row').filter({ hasText: name });
        await expect(row).toContainText('Synthetic persisted description');
        await expect(row).toContainText('Plano Mensal');
        await row.getByRole('button', { name: `Editar serviço ${name}`, exact: true }).click();
        const edit = page.getByRole('dialog', { name: 'Editar Serviço', exact: true });
        await edit.getByLabel('Preço (R$) *', { exact: true }).fill('90');
        const updated = page.waitForResponse(r => r.url().includes('/rpc/mutate_record_idempotently'));
        await edit.getByRole('button', { name: 'Atualizar', exact: true }).click();
        expect((await updated).ok()).toBe(true);
        await expect(row).toContainText('90,00');
        await page.goto('/nutritionist/profile?tab=financial');
        const profileRow = page.getByRole('table', { name: 'Serviços do consultório', exact: true }).getByRole('row').filter({ hasText: name });
        await profileRow.getByRole('button', { name: `Editar serviço ${name}`, exact: true }).click();
        const profileEdit = page.getByRole('dialog', { name: 'Editar Serviço', exact: true });
        await profileEdit.getByLabel('Descrição', { exact: true }).fill('Synthetic revised description');
        const revised = page.waitForResponse(r => r.url().includes('/rpc/mutate_record_idempotently'));
        await profileEdit.getByRole('button', { name: 'Salvar', exact: true }).click();
        expect((await revised).ok()).toBe(true);
        await expect(profileRow).toContainText('Synthetic revised description');
        await page.goto('/nutritionist/financial');
        await page.getByRole('button', { name: 'Gerenciar Serviços', exact: true }).click();
        await row.getByRole('button', { name: `Desativar serviço ${name}`, exact: true }).click();
        const confirmation = page.getByRole('alertdialog');
        await expect(confirmation).toContainText('histórico permanece preservado');
        await confirmation.getByRole('button', { name: 'Desativar', exact: true }).click();
        await expect(row).toHaveCount(0);
        const stored = await client.from('services').select('price,description,category,active').eq('nutritionist_id', fixture.personas['nutritionist-a'].id).eq('name', name).single();
        expect(stored.error).toBeNull();
        expect(stored.data).toMatchObject({ price: 90, description: 'Synthetic revised description', category: 'plano_mensal', active: false });
    } finally { await client.auth.signOut(); }
});

test('settings save makes one scoped write and retains unrelated profile and agenda fields', async ({ page }) => {
    const client = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await client.auth.signInWithPassword({ email: fixture.personas['nutritionist-a'].email, password: fixture.password })).error).toBeNull();
    const before = await client.from('user_profiles').select('name,crn,clinic_settings,preferences').eq('id', fixture.personas['nutritionist-a'].id).single();
    expect(before.error).toBeNull();
    await login(page);
    await page.goto('/nutritionist/profile?tab=agenda');
    await expect(page.getByRole('tab', { name: /Agenda/ })).toHaveAttribute('data-state', 'active');
    await page.getByRole('tab', { name: /Financeiro/ }).click();
    await page.getByLabel('Meta Financeira Mensal (R$)', { exact: true }).fill('0');
    let writes = 0;
    const count = r => { if (r.method() === 'PATCH' && r.url().includes('/rest/v1/user_profiles')) writes++; };
    page.on('request', count);
    const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().includes('/user_profiles'));
    await page.getByRole('button', { name: 'Salvar Configurações', exact: true }).click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect(Object.keys(await response.json()).sort()).toEqual(['clinic_settings', 'id', 'preferences']);
    await expect(page.getByRole('button', { name: 'Salvar Configurações', exact: true })).toBeEnabled();
    expect(writes).toBe(1);
    page.off('request', count);
    const after = await client.from('user_profiles').select('name,crn,clinic_settings,preferences').eq('id', fixture.personas['nutritionist-a'].id).single();
    expect(after.error).toBeNull();
    expect(after.data.name).toBe(before.data.name);
    expect(after.data.crn).toBe(before.data.crn);
    expect(after.data.preferences).toEqual(before.data.preferences);
    const beforeSettings = before.data.clinic_settings || before.data.preferences?.clinic_settings || {};
    for (const [key, value] of Object.entries(beforeSettings)) if (!['monthlyFinancialGoal', 'defaultPixKey', 'defaultFeePercentage'].includes(key)) expect(after.data.clinic_settings[key]).toEqual(value);
    await client.auth.signOut();
    await page.getByRole('tab', { name: /Dados/ }).click();
    await expect(page.getByLabel('Nome Completo *', { exact: true })).not.toHaveValue('');
    await page.getByRole('tab', { name: /Agenda/ }).click();
    await expect(page.getByRole('tab', { name: /Agenda/ })).toHaveAttribute('data-state', 'active');
});

test('failed settings and services loads offer recovery instead of editable defaults or false empty states', async ({ page }) => {
    await login(page);
    let fail = true;
    await page.route('**/rest/v1/user_profiles?*', route => {
        const query = new URL(route.request().url()).searchParams.get('select');
        return fail && query === 'clinic_settings,preferences' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"synthetic unavailable"}' }) : route.continue();
    });
    await page.goto('/nutritionist/profile?tab=financial');
    await expect(page.getByRole('alert').filter({ hasText: 'Nada foi alterado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar Configurações', exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salvar Configurações', exact: true })).toBeEnabled();
    await page.goto('/nutritionist/financial');
    let servicesFail = true;
    await page.route('**/rest/v1/services?*', route => servicesFail ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"synthetic unavailable"}' }) : route.continue());
    await page.getByRole('button', { name: 'Gerenciar Serviços', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Gerenciar Serviços', exact: true });
    await expect(manager.getByRole('alert')).toBeVisible();
    await expect(manager.getByRole('button', { name: 'Novo Serviço', exact: true })).toBeDisabled();
    servicesFail = false;
    await manager.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(manager.getByRole('button', { name: 'Novo Serviço', exact: true })).toBeEnabled();
    await manager.press('Escape');
    let monthFail = true;
    await page.route('**/rest/v1/financial_transactions?*', route => {
        const select = new URL(route.request().url()).searchParams.get('select') || '';
        return monthFail && select.includes('attachment_url') ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"synthetic unavailable"}' }) : route.continue();
    });
    await page.goto('/nutritionist/financial');
    // ResourceStatus normalizes transport errors. Scope recovery to the monthly
    // history: the independent projection may fail on the same table as well.
    const monthlyError = page.getByRole('alert').filter({ hasText: 'Histórico indisponível.' });
    await expect(monthlyError).toBeVisible();
    await expect(page.getByText('Histórico indisponível.', { exact: false })).toBeVisible();
    await expect(page.getByText('Nenhuma transação registrada neste mês.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Caixa recebido líquido', { exact: true })).toHaveCount(0);
    monthFail = false;
    await monthlyError.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(monthlyError).toHaveCount(0);
    await expect(page.getByText('Caixa recebido líquido', { exact: true })).toBeVisible();
});

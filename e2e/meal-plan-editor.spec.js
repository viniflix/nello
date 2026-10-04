import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { seed } from './helpers/mealPlanFixture';
import { createClient } from '@supabase/supabase-js';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function openEditor(page, sample) {
    await page.goto('/login');
    await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);
    await page.locator('#password').fill(fixture.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto(`/nutritionist/patients/${sample.patient}/meal-plan`);
    await page.getByRole('button', { name: 'Editar Plano', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Editar plano alimentar', exact: true })).toBeVisible();
}
async function client() {
    const client = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: fixture.personas['nutritionist-a'].email, password: fixture.password });
    expect(error).toBeNull();
    return client;
}
async function audit(page) {
    // Radix keeps exiting dialogs in the DOM until their closing animation finishes.
    // Audit the settled, visible UI rather than sampling a fade at near-zero opacity.
    await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
    await expect.poll(() => page.locator('[role="dialog"][data-state="open"]').evaluateAll(nodes => nodes.every(node => Number(getComputedStyle(node).opacity) === 1))).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({target: node.target, html: node.html, summary: node.failureSummary})) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
for (const screen of [{ width: 320, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 900 }, { width: 1440, height: 1000 }, { width: 320, height: 800, zoom: true }]) {
    test(`meal editor workspace reflow, real actions and accessible layouts ${screen.width}${screen.zoom ? ' text200' : ''}`, async ({ page }, info) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width: screen.width, height: screen.height });
        const sample = seed();
        await openEditor(page, sample);
        if (screen.zoom) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await expect(page.getByRole('button', { name: 'Editar configurações' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'QA Meal Module', exact: true })).toHaveAttribute('href', `/nutritionist/patients/${sample.patient}/hub?tab=nutrition`);
        await page.getByRole('button', { name: 'Expandir QA Café da manhã com nome longo', exact: true }).click();
        await audit(page);
        await page.evaluate(() => window.scrollTo({top: 0, left: 0, behavior: 'instant'}));
        const photo = await page.screenshot({ fullPage: true });
        await info.attach('meal-editor-workspace', { body: photo, contentType: 'image/png' });
        if ([390, 768, 1440].includes(screen.width)) await page.screenshot({ path: `.codex/local/meal-editor-${screen.width}-final-proof.png`, fullPage: true });
        await page.getByRole('button', { name: 'Editar configurações' }).click();
        await expect(page.getByLabel('Nome do Plano *', { exact: true })).toHaveValue('QA Plano completo com nome longo para testar leitura e navegação');
        await audit(page);
        await page.getByRole('button', { name: 'Concluir configurações' }).click();
        await page.getByRole('button', { name: 'Histórico de recuperação', exact: true }).click();
        const history = page.getByRole('dialog', { name: 'Histórico de recuperação' });
        await expect(history).toBeVisible();
        await audit(page);
        await history.getByRole('button', { name: 'Fechar', exact: true }).click();
        await page.getByRole('button', { name: 'Importar refeições', exact: true }).click();
        await expect(page.getByRole('dialog', { name: /Importar/ })).toBeVisible();
        await audit(page);
        await page.getByRole('dialog', { name: /Importar/ }).getByRole('button', { name: 'Fechar', exact: true }).click();
        await page.getByRole('button', { name: 'Editar alimento QA Alimento do café', exact: true }).click();
        const food = page.getByRole('dialog', { name: 'Editar Alimento', exact: true });
        await expect(food).toBeVisible();
        await audit(page);
        await info.attach('meal-editor-food', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        expect(errors).toEqual([]);
    });
}
test('explicit draft preserves the active prescription and later publishes through the existing draft promotion', async ({ page }) => {
    const sample = seed();
    await openEditor(page, sample);
    await page.getByLabel('Fator de ajuste', { exact: true }).fill('1.2');
    await page.getByRole('button', { name: 'Simular ajuste', exact: true }).click();
    await expect(page.getByText('100 kcal → 120 kcal', { exact: true })).toBeVisible();
    const api = await client();
    expect((await api.from('meal_plans').select('daily_calories').eq('id', sample.plan).single()).data.daily_calories).toBe(100);
    await page.getByRole('button', { name: 'Aplicar ajuste ao plano', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Rascunhos (1)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar plano alimentar' })).not.toBeVisible();
    const plans = await api.from('meal_plans').select('id,is_active,is_draft,daily_calories').eq('patient_id', sample.patient);
    expect(plans.error).toBeNull();
    expect(plans.data.find(plan => plan.id === sample.plan)).toMatchObject({ is_active: true, is_draft: false, daily_calories: 100 });
    const draft = plans.data.find(plan => plan.is_draft);
    expect(draft).toMatchObject({ is_active: false, daily_calories: 120 });
    await page.getByRole('tabpanel', { name: 'Rascunhos (1)' }).getByRole('button', { name: 'Retomar edição', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aplicar plano alimentar', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Aplicar plano alimentar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Editar Plano', exact: true })).toBeVisible();
    const applied = await api.from('meal_plans').select('id,is_active,is_draft,daily_calories').eq('patient_id', sample.patient);
    expect(applied.data.find(plan => plan.id === draft.id)).toMatchObject({ is_active: true, is_draft: false, daily_calories: 120 });
    expect(applied.data.find(plan => plan.id === sample.plan).is_active).toBe(false);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Editar Plano', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar plano alimentar' })).not.toBeVisible();
});
test('failed draft save retains the editor and retries the same draft without replacing the active plan', async ({ page }) => {
    const sample = seed();
    await openEditor(page, sample);
    const api = await client();
    await page.route('**/rest/v1/rpc/upsert_full_meal_plan', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA temporary outage' }) }));
    for (let attempt = 0; attempt < 2; attempt++) {
        await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Salvar rascunho', exact: true })).toBeEnabled();
        await expect(page.getByRole('heading', { name: 'Editar plano alimentar' })).toBeVisible();
    }
    const pending = await api.from('meal_plans').select('id,is_active,is_draft').eq('patient_id', sample.patient);
    expect(pending.data.filter(plan => plan.is_draft)).toHaveLength(1);
    expect(pending.data.find(plan => plan.id === sample.plan).is_active).toBe(true);
    await page.unroute('**/rest/v1/rpc/upsert_full_meal_plan');
    await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Rascunhos (1)' })).toBeVisible();
});

test('autosave keeps the pending food editor mounted and restores its exact portion after reload', async ({ page }) => {
    const sample = seed();
    await openEditor(page, sample);
    await page.getByRole('button', {name: 'Expandir QA Café da manhã com nome longo', exact: true}).click();
    await page.getByRole('button', {name: 'Editar alimento QA Alimento do café', exact: true}).click();
    const food = page.getByRole('dialog', {name: 'Editar Alimento', exact: true});
    await food.getByRole('spinbutton', {name: 'Quantidade', exact: true}).fill('135');
    await expect(food.getByRole('status')).toHaveText('Salvo no servidor', {timeout: 15000});
    await expect(food.getByRole('spinbutton', {name: 'Quantidade', exact: true})).toHaveValue('135');
    await page.reload();
    await expect(food).toBeVisible();
    await expect(food.getByRole('spinbutton', {name: 'Quantidade', exact: true})).toHaveValue('135');
    await food.getByRole('spinbutton', {name: 'Quantidade', exact: true}).fill('145');
    await expect(food.getByRole('status')).toHaveText('Salvo no servidor', {timeout: 15000});
    await expect(food.getByRole('spinbutton', {name: 'Quantidade', exact: true})).toHaveValue('145');
    const api = await client();
    expect((await api.from('meal_plans').select('daily_calories').eq('id', sample.plan).single()).data.daily_calories).toBe(100);
});

test('failed draft promotion keeps the active plan and permits a successful retry', async ({page}) => {
    const sample = seed();
    await openEditor(page, sample);
    await page.getByRole('button', {name: 'Salvar rascunho', exact: true}).click();
    await page.getByRole('tabpanel', {name: 'Rascunhos (1)'}).getByRole('button', {name: 'Retomar edição', exact: true}).click();
    const api = await client();
    await page.route('**/rest/v1/rpc/promote_draft_to_active', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({message: 'QA temporary outage'})}));
    await page.getByRole('button', {name: 'Aplicar plano alimentar', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Aplicar plano alimentar', exact: true})).toBeEnabled();
    const failed = await api.from('meal_plans').select('id,is_active,is_draft').eq('patient_id', sample.patient);
    expect(failed.data.find(plan => plan.id === sample.plan).is_active).toBe(true);
    expect(failed.data.find(plan => plan.id !== sample.plan)).toMatchObject({is_active: false, is_draft: true});
    await page.unroute('**/rest/v1/rpc/promote_draft_to_active');
    await page.getByRole('button', {name: 'Aplicar plano alimentar', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Editar Plano', exact: true})).toBeVisible();
    expect((await api.from('meal_plans').select('is_active').eq('id', sample.plan).single()).data.is_active).toBe(false);
});

test('zero portions replace old meal totals without resurrecting calories after save', async ({page}) => {
    const sample = seed();
    await openEditor(page, sample);
    await page.getByRole('button', {name: 'Expandir QA Café da manhã com nome longo', exact: true}).click();
    await page.getByRole('button', {name: 'Editar alimento QA Alimento do café', exact: true}).click();
    const food = page.getByRole('dialog', {name: 'Editar Alimento', exact: true});
    await food.getByRole('spinbutton', {name: 'Quantidade', exact: true}).fill('0');
    await food.getByRole('button', {name: 'Atualizar', exact: true}).click();
    await page.getByRole('dialog', {name: 'Editar Refeição', exact: true}).getByRole('button', {name: 'Atualizar Refeição', exact: true}).click();
    await page.getByRole('button', {name: 'Aplicar alterações', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Editar Plano', exact: true})).toBeVisible();
    const api = await client();
    expect((await api.from('meal_plans').select('daily_calories').eq('id', sample.plan).single()).data.daily_calories).toBe(0);
    const meals = await api.from('meal_plan_meals').select('name,total_calories').eq('meal_plan_id', sample.plan);
    expect(meals.error).toBeNull();
    expect(meals.data.find(meal => meal.name === 'Café da Manhã').total_calories).toBe(0);
});

test('meal cards duplicate, reorder, exclude and remove through contextual actions without publishing', async ({page}) => {
    const sample = seed();
    await openEditor(page, sample);
    await page.getByRole('button', {name: 'Duplicar QA Café da manhã com nome longo', exact: true}).click();
    const copyName = 'QA Café da manhã com nome longo (cópia)';
    const copy = page.getByRole('article', {name: `Refeição ${copyName}`, exact: true});
    await expect(copy).toBeVisible();
    await copy.getByRole('button', {name: `Expandir ${copyName}`, exact: true}).click();
    await copy.getByRole('checkbox', {name: 'Contabilizar esta refeição na análise nutricional', exact: true}).uncheck();
    await expect(copy.getByText('Opção alternativa · fora dos totais nutricionais', {exact: true})).toBeVisible();
    await copy.getByRole('button', {name: `Mover ${copyName} para cima`, exact: true}).click();
    await expect(copy).toHaveAttribute('data-meal-sort-index', '1');
    await copy.getByRole('button', {name: `Remover refeição ${copyName}`, exact: true}).click();
    await page.getByRole('alertdialog', {name: 'Remover refeição?'}).getByRole('button', {name: 'Remover', exact: true}).click();
    await expect(copy).toHaveCount(0);
    expect((await (await client()).from('meal_plans').select('daily_calories').eq('id', sample.plan).single()).data.daily_calories).toBe(100);
});

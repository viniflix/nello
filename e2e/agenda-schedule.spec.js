import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const fixture = JSON.parse(readFileSync(process.env.NELLO_AGENDA_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
const pro = fixture.personas['nutritionist-a'];
test('temporal grid proposes a reviewed move, preserves billing, and has responsive alternatives', async ({ page }) => {
  const api = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await api.auth.signInWithPassword({ email: pro.email, password: fixture.password })).error).toBeNull();
  let id;
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  try {
    const created = await api.rpc('perform_clinical_operation', { p_operation: 'appointment', p_arguments: { p_appointment: { nutritionist_id: pro.id, unregistered_patient_name: 'Synthetic schedule ' + randomUUID(), appointment_time: `${date}T12:00:00Z`, start_time: `${date}T12:00:00Z`, duration: 60, status: 'scheduled' }, p_financial: { custom_price: 175.50 }, p_appointment_id: null }, p_expected: null, p_nonce: randomUUID(), p_actor: pro.id });
    expect(created.error).toBeNull(); id = created.data.appointment.id;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/login'); await page.locator('#email').fill(pro.email); await page.locator('#password').fill(fixture.password); await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(/\/nutritionist/); await page.goto('/nutritionist/agenda');
    const view = page.getByRole('group', { name: 'Visualização da agenda' });
    await view.getByRole('button', { name: 'Semana', exact: true }).click();
    await page.getByRole('button', { name: `Agendar ${date} às 17:30`, exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Hora *', { exact: true })).toHaveValue('17:30');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Semana', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await view.getByRole('button', { name: 'Dia', exact: true }).click();
    await page.locator(`[data-schedule-appointment="${id}"]`).dragTo(page.getByRole('button', { name: `Agendar ${date} às 10:30`, exact: true }));
    const form = page.getByRole('dialog'); await expect(form).toContainText('Confira o reagendamento'); await expect(form.getByLabel('Hora *', { exact: true })).toHaveValue('10:30');
    const unchanged = await api.from('appointments').select('appointment_time').eq('id', id).single(); expect(new Date(unchanged.data.appointment_time).toISOString()).toBe(`${date}T12:00:00.000Z`);
    await form.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await expect(form).toHaveCount(0);
    const empty = page.locator('.agenda-time-slot').first(); await empty.click(); await expect(form.getByLabel('Hora *', { exact: true })).not.toHaveValue(''); await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    for (const width of [320, 390, 768, 820, 1440]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const axe = await new AxeBuilder({ page }).include('.agenda-workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(axe.violations.map(row => row.id)).toEqual([]);
    const charge = await api.from('financial_transactions').select('amount,status,due_date').eq('appointment_id', id).single(); expect(charge.error).toBeNull(); expect(Number(charge.data.amount)).toBe(175.50); expect(charge.data.status).toBe('pending'); expect(charge.data.due_date).toBe(date);
  } finally { if (id) expect((await api.rpc('delete_appointment_with_finance', { p_appointment_id: id })).error).toBeNull(); await api.auth.signOut(); }
});

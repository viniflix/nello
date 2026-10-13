import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const fixture = JSON.parse(readFileSync(process.env.NELLO_AGENDA_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
const pro = fixture.personas['nutritionist-a'];
async function login(page) {
  await page.goto('/login'); await page.locator('#email').fill(pro.email); await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(/\/nutritionist/);
  await page.goto('/nutritionist/agenda'); await expect(page.getByRole('heading', { name: 'Agenda de Consultas', exact: true })).toBeVisible();
}
test('mobile form preserves edited draft after cancel and closes patient options outside the picker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page);
  await page.getByRole('button', { name: 'Novo Agendamento', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Paciente *', exact: true }).fill('Synthetic interface draft');
  await dialog.getByLabel('Observações', { exact: true }).fill('Synthetic multiline\nSecond line');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const discard = page.getByRole('alertdialog');
  await expect(discard).toContainText('ainda não foram salvas');
  await discard.getByRole('button', { name: 'Continuar editando', exact: true }).click();
  await expect(dialog.getByLabel('Observações', { exact: true })).toHaveValue('Synthetic multiline\nSecond line');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await discard.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('future month navigation drills into the correct civil day and preserves context through settings', async ({ page }) => {
  await login(page);
  await page.getByRole('group', { name: 'Visualização da agenda' }).getByRole('button', { name: 'Mês', exact: true }).click();
  const prior = await page.locator('.agenda-period p').textContent();
  await page.getByRole('button', { name: 'Próximo período', exact: true }).click();
  await expect(page.locator('.agenda-period p')).not.toHaveText(prior);
  const next = await page.locator('.agenda-period p').textContent();
  await page.getByRole('button', { name: 'Configurar agenda', exact: true }).first().click();
  await page.getByRole('button', { name: 'Voltar à agenda', exact: true }).click();
  await expect(page.locator('.agenda-period p')).toHaveText(next);
  await page.locator('.agenda-month button:not([disabled])').first().click();
  await expect(page.getByRole('group', { name: 'Visualização da agenda' }).getByRole('button', { name: 'Dia', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('an appointment read failure is an error with retry and never an empty-success state', async ({ page }) => {
  await login(page);
  await page.route('**/rest/v1/appointments?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic Agenda outage' }) }));
  await page.getByRole('group', { name: 'Visualização da agenda' }).getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível atualizar os agendamentos' })).toBeVisible();
  await expect(page.getByText('Nenhum agendamento encontrado', { exact: true })).toHaveCount(0);
  await page.unroute('**/rest/v1/appointments?*');
  await page.getByRole('alert').filter({ hasText: 'Não foi possível atualizar os agendamentos' }).getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível atualizar os agendamentos' })).toHaveCount(0);
});

test('full synthetic day supports long identities, responsive actions, accessible layout and reduced motion', async ({ page }) => {
  const api = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await api.auth.signInWithPassword({ email: pro.email, password: fixture.password })).error).toBeNull();
  const marker = 'Synthetic agenda UI ' + randomUUID(), ids = [];
  try {
    for (let index = 0; index < 6; index++) {
      const instant = `2034-10-20T${String(11 + index).padStart(2, '0')}:00:00Z`;
      const result = await api.rpc('perform_clinical_operation', { p_operation: 'appointment', p_arguments: { p_appointment: { nutritionist_id: pro.id, unregistered_patient_name: marker + ' Nome composto extenso para legibilidade ' + index, start_time: instant, appointment_time: instant, duration: index === 0 ? 45 : 60, status: 'scheduled' }, p_financial: {}, p_appointment_id: null }, p_expected: null, p_nonce: randomUUID(), p_actor: pro.id });
      expect(result.error).toBeNull(); ids.push(result.data.appointment.id);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' }); await login(page);
    await page.getByLabel('Buscar agendamento pelo paciente', { exact: true }).fill(marker);
    await expect(page.locator('[data-appointment-id]')).toHaveCount(6);
    for (const width of [320, 360, 390, 430, 768, 820, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const row = page.locator('[data-appointment-id]').first();
      expect(await row.getByRole('button', { name: 'Abrir agendamento', exact: true }).evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await page.locator('.agenda-enter').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    }
    const axe = await new AxeBuilder({ page }).include('.agenda-workspace').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.locator('[data-appointment-id]').first().getByRole('button', { name: 'Abrir agendamento', exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Observações', { exact: true })).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(page.getByRole('dialog').getByLabel('Duração *', { exact: true })).toContainText('45 minutos');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('[data-appointment-id]').first().getByRole('button', { name: 'Abrir agendamento', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Observações', { exact: true }).fill('Synthetic temporary change');
    await page.getByRole('dialog').getByLabel('Observações', { exact: true }).fill('');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    for (const id of ids) expect((await api.rpc('delete_appointment_with_finance', { p_appointment_id: id })).error).toBeNull();
    await api.auth.signOut();
  }
});

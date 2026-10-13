import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const fixture = JSON.parse(readFileSync(process.env.NELLO_AGENDA_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
const pro = fixture.personas['nutritionist-a'], patient = fixture.personas['patient-a'];
async function client() {
  const api = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await api.auth.signInWithPassword({ email: pro.email, password: fixture.password })).error).toBeNull();
  return api;
}
async function login(page) {
  await page.goto('/login'); await page.locator('#email').fill(pro.email); await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).toHaveURL(/\/nutritionist/);
  await page.goto('/nutritionist/agenda'); await expect(page.getByRole('heading', { name: 'Agenda de Consultas', exact: true })).toBeVisible();
}
async function seed(api, registered = false) {
  const start = Date.now() + 35 * 3600000;
  const existing = await api.from('appointments').select('appointment_time,start_time,duration')
    .eq('nutritionist_id', pro.id).neq('status', 'cancelled')
    .gte('appointment_time', new Date(start - 24 * 3600000).toISOString())
    .lte('appointment_time', new Date(start + 13 * 3600000).toISOString()).limit(1000);
  expect(existing.error).toBeNull(); expect(existing.data.length).toBeLessThan(1000);
  const slot = Array.from({ length: 140 }, (_, index) => start + index * 5 * 60000).find(candidate =>
    existing.data.every(row => { const occupied = Date.parse(row.start_time || row.appointment_time); return candidate + 60000 <= occupied || candidate >= occupied + (row.duration || 60) * 60000; }));
  expect(slot).toBeDefined(); const time = new Date(slot).toISOString();
  const created = await api.rpc('perform_clinical_operation', { p_operation: 'appointment', p_arguments: { p_appointment: {
    nutritionist_id: pro.id, patient_id: registered ? patient.id : null,
    unregistered_patient_name: registered ? null : 'Synthetic notices ' + randomUUID(),
    appointment_time: time, start_time: time, duration: 1, status: 'scheduled', appointment_type: 'first_appointment', notes: 'Synthetic private note'
  }, p_financial: {}, p_appointment_id: null }, p_expected: null, p_nonce: randomUUID(), p_actor: pro.id });
  expect(created.error).toBeNull(); return created.data.appointment;
}
async function menu(page, id, name) {
  const card = page.locator(`[data-appointment-id="${id}"]`); await expect(card).toBeVisible();
  await card.getByRole('button', { name: /^Mais ações/ }).click(); await page.getByRole('menuitem', { name, exact: true }).click();
}
async function cleanup(api, appointment) {
  if (appointment) {
    // Use the same owner-authorized operation as the product, only on loopback
    // fixtures without a charge. Completed test bookings must not leak into
    // subsequent patient-history and visual-regression journeys.
    expect((await api.rpc('delete_appointment_with_finance', { p_appointment_id: appointment.id })).error).toBeNull();
    const remaining = await api.from('appointments').select('id').eq('id', appointment.id).eq('nutritionist_id', pro.id);
    expect(remaining.error).toBeNull(); expect(remaining.data).toEqual([]);
  }
  await api.auth.signOut();
}

test('internal availability is deduplicated, owner-scoped and readable on narrow screens', async ({ page }) => {
  const api = await client(); let appointment;
  try {
    appointment = await seed(api, true);
    const sync = () => api.rpc('sync_appointment_notification_schedule', { p_appointment_id: appointment.id, p_force_reschedule: true });
    const results = await Promise.all([sync(), sync(), sync()]); results.forEach(result => expect(result.error).toBeNull());
    const rows = await api.from('appointment_notifications').select('id,delivery_status,attempts').eq('appointment_id', appointment.id).eq('nutritionist_id', pro.id);
    expect(rows.error).toBeNull(); expect(rows.data).toHaveLength(1); expect(rows.data[0]).toMatchObject({ delivery_status: 'available', attempts: 1 });
    await login(page); await page.getByRole('group', { name: 'Visualização da agenda' }).getByRole('button', { name: 'Lista', exact: true }).click();
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await menu(page, appointment.id, 'Avisos da consulta'); const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Disponível no Nello', { exact: true })).toBeVisible();
      await expect(dialog).toContainText('não confirma leitura');
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const bounds = await dialog.boundingBox(); expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(width === 320 ? 568 : 900);
      const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa']).analyze(); expect(axe.violations).toEqual([]);
      await dialog.getByRole('button', { name: 'Fechar histórico', exact: true }).click();
    }
  } finally { await cleanup(api, appointment); }
});

test('return draft resolves the active patient and leaves clinical notes and billing behind', async ({ page }) => {
  const api = await client(); let appointment;
  try {
    appointment = await seed(api, true);
    for (const status of ['confirmed', 'completed']) {
      const changed = await api.rpc('perform_clinical_operation', { p_operation: 'appointment', p_arguments: { p_appointment: { ...appointment, status }, p_financial: {}, p_appointment_id: appointment.id }, p_expected: appointment.updated_at, p_nonce: randomUUID(), p_actor: pro.id });
      expect(changed.error).toBeNull(); appointment = changed.data.appointment;
    }
    await login(page); await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('group', { name: 'Visualização da agenda' }).getByRole('button', { name: 'Lista', exact: true }).click();
    let saves = 0; page.on('request', req => { if (req.url().includes('/rpc/perform_clinical_operation')) saves++; });
    await menu(page, appointment.id, 'Agendar retorno'); const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Tipo *', { exact: true })).toContainText('Retorno');
    await expect(dialog.getByLabel('Observações', { exact: true })).toHaveValue('');
    await expect(dialog.getByRole('combobox', { name: 'Paciente *', exact: true })).not.toHaveValue('');
    await expect(dialog.getByLabel('Serviço', { exact: true })).toContainText('Selecione um serviço'); expect(saves).toBe(0);
  } finally {
    await cleanup(api, appointment);
  }
});

test('guest notices explain account eligibility and a calendar download excludes private fields', async ({ page }) => {
  const api = await client(); let appointment;
  try {
    appointment = await seed(api); await login(page); await page.setViewportSize({ width: 320, height: 568 });
    await page.getByLabel('Buscar agendamento pelo paciente', { exact: true }).fill(appointment.unregistered_patient_name);
    await menu(page, appointment.id, 'Avisos da consulta');
    await expect(page.getByRole('dialog')).toContainText('precisa de uma conta');
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar histórico', exact: true }).click();
    await menu(page, appointment.id, 'Baixar para calendário (.ics)');
    const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('não atualizam automaticamente');
    const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Baixar .ics', exact: true }).click();
    const download = await downloaded; const text = readFileSync(await download.path(), 'utf8');
    expect(text).toContain('SUMMARY:Consulta Nello'); expect(text).not.toContain(appointment.unregistered_patient_name); expect(text).not.toContain(appointment.notes);
    await expect(dialog).toHaveCount(0);
  } finally { await cleanup(api, appointment); }
});

test('notice history failure allows read retry without another clinical save', async ({ page }) => {
  const api = await client(); let appointment;
  try {
    appointment = await seed(api); await login(page);
    await page.getByLabel('Buscar agendamento pelo paciente', { exact: true }).fill(appointment.unregistered_patient_name);
    let clinicalWrites = 0; page.on('request', req => { if (req.url().includes('/rpc/perform_clinical_operation')) clinicalWrites++; });
    await page.route('**/rest/v1/appointment_notifications?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic notice read failure"}' }));
    await menu(page, appointment.id, 'Avisos da consulta'); const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('alert')).toContainText('permanece salvo');
    await page.unroute('**/rest/v1/appointment_notifications?*'); await dialog.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(dialog).toContainText('Aviso não habilitado'); expect(clinicalWrites).toBe(0);
  } finally { await cleanup(api, appointment); }
});

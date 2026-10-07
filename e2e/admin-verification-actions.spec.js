import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { totp } from '../scripts/qa/totp.mjs';
import { createAdminWorkspaceFixture } from '../scripts/qa/admin-workspace-fixture.mjs';
import { relevantDiagnostic } from '../scripts/qa/diagnostic-policy.mjs';

test('admin verification: real role matrix, invalid date recovery, approval and stale-source privacy across responsive pages', async ({ page }) => {
  test.setTimeout(150000);
  const fixture = await createAdminWorkspaceFixture();
  const person = randomUUID();
  const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_nello-reconstruction', 'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input, stdio: ['pipe', 'ignore', 'pipe'] });
  sql(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values('${person}','authenticated','authenticated','${person}@example.invalid',now(),'{"name":"QA verification review","user_type":"nutritionist"}'); update public.professional_verifications set status='pending',submitted_at=now() where user_id='${person}';`);
  const diagnostics = [];
  page.on('pageerror', e => diagnostics.push(e.message));
  page.on('console', m => { if (relevantDiagnostic(m.type(), m.text())) diagnostics.push(m.text()); });
  await page.goto('/admin/verifications');
  await page.locator('#email').fill(fixture.email); await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/admin/verifications'); await page.locator('#admin-mfa-code').fill(totp(fixture.secret));
  await page.getByRole('button', { name: 'Verificar e entrar', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: `${person}@example.invalid` });
  await row.getByRole('button', { name: 'Analisar', exact: true }).click();
  await page.locator('#valid-until').fill(''); await page.locator('#decision-reason').fill('Synthetic official source review');
  await page.getByRole('button', { name: 'Registrar decisão', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('data de validade válida');
  await expect(page.getByRole('button', { name: 'Registrar decisão', exact: true })).toBeEnabled();
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await page.locator('#valid-until').fill(future);
  await page.getByRole('button', { name: 'Registrar decisão', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(row).toContainText('Aprovado');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/admin/verifications', '/admin/users', `/admin/users/${person}`]) {
      await page.goto(path); await expect(page.getByRole('button', { name: 'Atualizar', exact: true })).toBeVisible();
      await expect(page.getByText('Consultando fonte', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      if (axe.violations.length) await test.info().attach(`verification-accessibility-${width}`, { body: JSON.stringify(axe.violations), contentType: 'application/json' });
      expect(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    }
  }
  await page.goto('/admin/verifications'); await expect(row).toContainText('Aprovado');
  await page.route('**/rest/v1/rpc/admin_verification_queue', route => route.fulfill({ status: 503, json: { code: 'temporarily_unavailable' } }), { times: 1 });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText('Falha ao atualizar · última consulta preservada', { exact: true })).toBeVisible(); await expect(row).toContainText('Aprovado');
  sql(`update private.admin_operators set role='auditor' where user_id='${fixture.id}';`);
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await row.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText(/Seu perfil permite consultar/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar decisão', exact: true })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).last().click();
  try {
    sql(`update private.admin_operators set revoked_at=now() where user_id='${fixture.id}';`);
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(page.getByText('Fonte indisponível', { exact: true })).toBeVisible(); await expect(row).toHaveCount(0);
    await expect(page.getByText('Nenhuma verificação encontrada.', { exact: true })).toHaveCount(0);
  } finally { sql(`update private.admin_operators set revoked_at=null,role='owner' where user_id='${fixture.id}';`); }
  expect(diagnostics).toEqual([]);
});

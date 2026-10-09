import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { totp } from '../scripts/qa/totp.mjs';
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if (fixture.url !== 'http://localhost:54321') throw Error('Only disposable loopback fixtures');
async function login(page, key) {
  await page.goto('/login'); await page.locator('#email').fill(fixture.personas[key].email); await page.locator('#password').fill(fixture.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(key.startsWith('patient') || key.startsWith('admin') ? '/patient' : '/nutritionist'));
}
async function audit(page) {
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
  const overflow = await page.evaluate(() => [...document.querySelectorAll('#root *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1).map(el => ({ tag: el.tagName, classes: el.className, right: el.getBoundingClientRect().right, scroll: el.scrollWidth, client: el.clientWidth })).slice(-15));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow)).toBe(true);
}
async function uniqueMetadata(page, path) {
  for (const selector of ['link[rel="canonical"]', 'meta[name="description"]', 'meta[name="robots"]', ...['title', 'description', 'url', 'image'].map(key => `meta[property="og:${key}"]`), ...['card', 'title', 'description', 'image'].map(key => `meta[name="twitter:${key}"]`)]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }
  const privateRoute = /^\/(nutritionist|patient|admin)(\/|$)/.test(path);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://nellonutri.com.br' + (privateRoute ? '/' : path));
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', privateRoute ? 'noindex,nofollow' : 'index,follow');
}
for (const width of [320, 768, 1440]) test(`public landing, help and safe crawler metadata ${width}`, async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: width === 768 ? 480 : 900 });
  const response = await request.get('/'); const html = await response.text();
  expect(html.replace(/<[^>]+>/g, '')).toContain('O cuidado não termina'); expect(html).toContain('https://nellonutri.com.br/og-image.png');
  await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toContainText('O cuidado não termina');
  await uniqueMetadata(page, '/');
  for (const image of await page.locator('.landing-experience img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await page.keyboard.press('Control+Home');
  await audit(page); await expect(page).toHaveScreenshot(`landing-${width}.png`, { fullPage: true, animations: 'disabled' });
  for (const route of ['/ajuda', '/seguranca', '/privacidade']) { await page.goto(route); await expect(page.locator('main h1')).toBeVisible(); await uniqueMetadata(page, route); await audit(page); }
  const sitemap = await (await request.get('/sitemap.xml')).text(); expect(sitemap).not.toMatch(/patient|nutritionist|admin|convite/);
  const manifest = await (await request.get('/site.webmanifest')).json(); expect(manifest.display).toBe('browser');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect((await request.get('/og-image.png')).status()).toBe(200);
  await page.goto('/404.html'); await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible(); await audit(page);
});
for (const width of [320, 768, 1440]) test(`clinical chat, financial cards and 200% reflow ${width}`, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00Z'));
  await page.setViewportSize({ width, height: width === 768 ? 480 : 900 });
  const owner = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await owner.auth.signInWithPassword({ email: fixture.personas['nutritionist-a'].email, password: fixture.password })).error).toBeNull();
  const actor = fixture.personas['nutritionist-a'].id;
  const saved = await owner.rpc('mutate_record_idempotently', { p_table: 'financial_transactions', p_values: { nutritionist_id: actor, patient_id: fixture.personas['patient-a'].id, type: 'income', status: 'pending', description: `Synthetic Wave13 ${width}`, amount: 123.45, transaction_date: '2026-10-02' }, p_id: null, p_expected: null, p_nonce: randomUUID(), p_actor: actor });
  expect(saved.error).toBeNull();
  await login(page, 'nutritionist-a'); await page.goto('/nutritionist/financial');
  await uniqueMetadata(page, '/nutritionist/financial');
  const table = page.getByRole('table', { name: 'Histórico de transações' }); await expect(table.getByText(`Synthetic Wave13 ${width}`, { exact: true })).toBeVisible();
  await expect(table.getByText('+R$ 123,45', { exact: false }).first()).toBeVisible(); await audit(page);
  await expect(page).toHaveScreenshot(`financial-${width}.png`, { fullPage: true, animations: 'disabled', mask: [page.locator('svg.recharts-surface')] });
  await table.getByRole('row').filter({ hasText: `Synthetic Wave13 ${width}` }).getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); await audit(page); await page.keyboard.press('Escape');
  await page.goto(`/nutritionist/chat/${fixture.personas['patient-a'].id}`); await expect(page.getByRole('textbox', { name: 'Mensagem', exact: true })).toBeVisible(); await audit(page);
  await page.goto(`/nutritionist/patients/${fixture.personas['patient-a'].id}/energy-expenditure`);
  await expect(page).toHaveTitle('Cálculos nutricionais — Nello'); expect(await page.locator('head').textContent()).not.toContain(fixture.personas['patient-a'].id); await audit(page);
  // Desktop 200% text zoom and reflow: preserve all functional information.
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await page.setViewportSize({ width: Math.max(320, Math.floor(width / 2)), height: 900 }); await audit(page);
  for (const route of ['/nutritionist/financial', `/nutritionist/chat/${fixture.personas['patient-a'].id}`, `/nutritionist/patients/${fixture.personas['patient-a'].id}/meal-plan`, `/nutritionist/patients/${fixture.personas['patient-a'].id}/anamnese`]) {
    await page.goto(route);
    await (route.includes('/chat/') ? page.getByRole('textbox', { name: 'Mensagem', exact: true }) : page.locator('main h1').first()).waitFor();
    await page.waitForLoadState('networkidle');
    await uniqueMetadata(page, route);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await audit(page);
  }
});
test('patient food results are keyboard controls and the composer follows a reduced keyboard viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await login(page, 'patient-a'); await page.goto('/patient/add-food');
  await expect(page.getByRole('heading', { name: 'Adicionar Refeição' })).toBeVisible(); await page.locator('#search').fill('Salmão');
  const result = page.getByRole('button', { name: /salmão.*kcal por 100g/i }).first(); await expect(result).toBeVisible(); await result.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#quantity')).toBeVisible(); await audit(page);
  await page.goto('/patient/chat'); const composer = page.getByRole('textbox', { name: 'Mensagem', exact: true }); await expect(composer).toBeVisible();
  await page.setViewportSize({ width: 320, height: 360 }); await composer.focus();
  await expect.poll(async () => { const box = await composer.boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(360);
  await composer.fill('Synthetic keyboard draft');
  const tree = await page.locator('#root').ariaSnapshot(); expect(tree).toContain('textbox "Mensagem"'); expect(tree).toContain('button "Enviar mensagem"'); await audit(page);
});
test('admin with real MFA retains access to labelled mobile verification cards', async ({ page }) => {
  await login(page, 'admin-aal1'); await page.goto('/admin/dashboard');
  await page.getByRole('button', { name: 'Configurar autenticador', exact: true }).click();
  const manual = page.getByText(/Chave manual:/); await expect(manual).toBeVisible();
  const secret = (await manual.locator('span').textContent()).trim(); await page.locator('#admin-mfa-code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verificar e entrar', exact: true }).click(); await expect(page.getByText('Acesso administrativo protegido')).not.toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 768 ? 480 : 900 }); await page.goto('/admin/verifications');
    await expect(page.getByRole('table', { name: 'Verificações profissionais' })).toBeVisible(); await audit(page);
    await page.goto('/admin/users'); await expect(page.getByRole('heading', { name: 'Cadastros' })).toBeVisible(); await audit(page);
    await page.goto('/admin/financial'); await expect(page.getByRole('heading', { name: 'Cobrança da plataforma' })).toBeVisible(); await audit(page);
  }
});

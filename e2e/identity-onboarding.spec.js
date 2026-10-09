import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { supabaseCommand, supabaseArgs, assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();

test('production CSP permits the CAPTCHA script and frame without an intersecting HTML policy', async ({ page }) => {
  const script = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const frame = 'https://challenges.cloudflare.com/nello-synthetic-csp-check';
  await page.route(script, route => route.fulfill({ contentType: 'application/javascript', body: 'window.__qaCaptchaScriptLoaded = true;' }));
  await page.route(frame, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>QA CAPTCHA frame permitted</body></html>' }));
  await page.goto('/login');
  await page.addScriptTag({ url: script });
  expect(await page.evaluate(() => window.__qaCaptchaScriptLoaded)).toBe(true);
  await page.evaluate(url => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Synthetic CAPTCHA CSP check';
    iframe.src = url;
    document.body.append(iframe);
  }, frame);
  await expect(page.frameLocator('iframe[title="Synthetic CAPTCHA CSP check"]').getByText('QA CAPTCHA frame permitted')).toBeVisible();
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(0);
});

for (const width of [390, 1440]) {
  test(`public legal/help pages remain readable without Auth at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/auth/v1/**', route => route.abort());
    const errors=[]; page.on('pageerror', error => errors.push(error.message));
    for (const [path, title] of [['/termos','Termos de Uso do Nello'],['/privacidade','Aviso de Privacidade'],['/ajuda','Ajuda para acessar o Nello'],['/seguranca','Relatar uma falha de segurança']]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.locator('.site-document-contact').getByRole('link', { name: 'suporte@nellonutri.com.br', exact:true })).toBeVisible();
      const support = page.getByRole('contentinfo').getByRole('link', { name: 'Falar com o suporte por email: suporte@nellonutri.com.br', exact:true });
      await expect(support).toBeVisible();
      await expect(support).toHaveAttribute('href', 'mailto:suporte@nellonutri.com.br');
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
    await page.screenshot({path:`.backend-ci/browser-results/wave04-public-${width}.png`,fullPage:true});
  });
}

test('minimal professional signup requires legal choice, defaults analytics off and awaits confirmation', async ({ page }) => {
  const status=JSON.parse(execFileSync(supabaseCommand,supabaseArgs(['status','--workdir','.backend-ci','--output','json']),{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  let created;
  try {
    await page.goto('/register');
    await page.locator('#name').fill('QA browser professional');
    await page.locator('#email').fill(`wave04-browser-${randomUUID()}@example.invalid`);
    await page.getByRole('combobox').click(); await page.getByRole('option',{name:'Nutricionista',exact:true}).click();
    await expect(page.getByText(/verificação profissional/i)).toBeVisible();
    await page.locator('#password').fill('QA123456!browser'); await page.locator('#confirmPassword').fill('QA123456!browser');
    const submit=page.locator('button[type="submit"]'); await expect(submit).toBeDisabled();
    expect(await page.locator('input[type="date"],#height,#weight,#gender').count()).toBe(0);
    await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
    await page.getByRole('checkbox').nth(0).check();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/v1/signup');
    await submit.click();const result=await response;expect(result.ok()).toBe(true);created=(await result.json()).user?.id;
    // Supabase versions serialize either the user directly or as a user field.
    if(!created)created=(await result.json()).id;
    expect(created).toBeTruthy();
    await expect(page).toHaveURL(/\/confirm-signup/);
    const profile=await admin.from('user_profiles').select('user_type,is_admin,birth_date,height,weight').eq('id',created).single();
    expect(profile.data).toEqual({user_type:'nutritionist',is_admin:false,birth_date:null,height:null,weight:null});
    const verification=await admin.from('professional_verifications').select('status,verification_method,valid_until').eq('user_id',created).single();
    expect(verification.error).toBeNull();expect(verification.data.status).toBe('approved');
    expect(verification.data.verification_method).toBe('pre_paywall_auto_approval');expect(Date.parse(verification.data.valid_until)).toBeGreaterThan(Date.now());
  } finally { if(created)expect((await admin.auth.admin.deleteUser(created)).error).toBeNull(); }
});

test('patient signup requires an invitation and never asks for clinical fields', async ({ page }) => {
  await page.goto('/register'); await page.getByRole('combobox').click(); await page.getByRole('option',{name:'Paciente',exact:true}).click();
  await expect(page.getByLabel('Código de convite do profissional')).toBeVisible();
  await expect(page.getByText(/vínculo será confirmado/i)).toBeVisible();
  expect(await page.locator('input[type="date"],#height,#weight,#gender').count()).toBe(0);
  await expect(page.getByRole('button',{name:'Mostrar senha',exact:true})).toBeVisible();
});

test('application defers analytics initialization until explicit optional consent', async ({ page }) => {
  const calls = [];
  await page.route('**/array/**/config.js', async route => { calls.push('config'); await route.fulfill({ contentType: 'application/javascript', body: '' }); });
  await page.route('**/flags/**', async route => { calls.push('flags'); await route.fulfill({ contentType: 'application/json', body: '{"featureFlags":{}}' }); });
  await page.route('**/e/**', async route => { calls.push('event'); await route.fulfill({ contentType: 'application/json', body: '{"status":"Ok"}' }); });
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: 'Aviso de Privacidade', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preferências de privacidade' }).click();
  await expect(page.getByText(/opcional e está desligado/)).toBeVisible();
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Permitir analytics' }).click();
  await expect(page.getByRole('button', { name: 'Permitir analytics' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferências de privacidade' }).click();
  await expect(page.getByText(/opcional e está ligado/)).toBeVisible();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Sem analytics' }).click();
  await page.getByRole('button', { name: 'Preferências de privacidade' }).click();
  await expect(page.getByText(/opcional e está desligado/)).toBeVisible();
});

test('first-visit cookie banner remembers refusal and allows later configuration', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/privacidade');
  await expect(page.getByRole('button', { name: 'Aceitar todos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recusar não essenciais', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aceitar todos', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aviso de Privacidade', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceitar todos', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferências de privacidade', exact: true }).click();
  await expect(page.getByText('Necessários: sempre ativos para acesso e segurança.')).toBeVisible();
  await expect(page.getByText(/opcional e está desligado/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

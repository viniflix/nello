import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from './isolated-runtime.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

assertIsolatedRuntime();
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const original = JSON.parse(docker(['inspect', 'supabase_auth_nello-reconstruction']))[0];
assert.equal(original.Name, '/supabase_auth_nello-reconstruction');
const network = Object.keys(original.NetworkSettings.Networks).find(name => name.includes('nello-reconstruction'));
assert(network, 'Disposable QA network required');
const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status', '--workdir', '.backend-ci', '--output', 'json']), { encoding: 'utf8' }));
assert(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const name = 'nello-wave04-captcha-qa';
assert(!docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim(), 'Refusing to replace a preexisting container');
const created = [];
const checks = [];
const password = 'Qa1!' + randomBytes(24).toString('hex');
const email = () => `wave04-captcha-${randomUUID()}@example.invalid`;
const legal = { name: 'QA CAPTCHA', user_type: 'nutritionist', legal_version: '2026-10-01', terms_accepted: true, analytics_allowed: false };
const envFile = '.backend-ci/auth-captcha-results/auth.env.private';
mkdirSync('.backend-ci/auth-captcha-results', { recursive: true });
let running = false;
async function request(path, body) {
  const response = await fetch(`http://127.0.0.1:55325${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json() };
}
async function start(secret) {
  const env = new Map(original.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
  assert(/nello-reconstruction/.test(env.get('GOTRUE_DB_DATABASE_URL') || ''), 'Auth must use only the disposable database');
  env.set('GOTRUE_SECURITY_CAPTCHA_ENABLED', 'true'); env.set('GOTRUE_SECURITY_CAPTCHA_PROVIDER', 'turnstile');
  env.set('GOTRUE_SECURITY_CAPTCHA_SECRET', secret);
  writeFileSync(envFile, [...env].map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
  docker(['run', '-d', '--name', name, '--network', network, '-p', '127.0.0.1:55325:9999', '--env-file', envFile, original.Config.Image]);
  running = true;
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch('http://127.0.0.1:55325/health', { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Only wait for this newly created QA service. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('Disposable CAPTCHA Auth did not start');
}
function stop() { if (running) { docker(['rm', '-f', name]); running = false; } }
try {
  const account = await admin.auth.admin.createUser({ email: email(), password, email_confirm: true, user_metadata: legal });
  assert(!account.error); created.push(account.data.user.id);
  await start('1x0000000000000000000000000000000AA');
  for (const [path, body] of [
    ['/signup', { email: email(), password, data: legal }],
    ['/token?grant_type=password', { email: account.data.user.email, password }],
    ['/recover', { email: account.data.user.email }],
    ['/resend', { email: account.data.user.email, type: 'signup' }],
  ]) {
    const denied = await request(path, body);
    assert.equal(denied.status, 400); assert(/captcha/i.test(denied.body.msg || denied.body.error_description || denied.body.message || ''));
    checks.push({ operation: path, withoutTokenDenied: true });
    const accepted = await request(path, { ...body, gotrue_meta_security: { captcha_token: 'XXXX.DUMMY.TOKEN.XXXX' } });
    if (path === '/signup' && accepted.body.id) created.push(accepted.body.id);
    assert(accepted.status >= 200 && accepted.status < 300, `${path} with official test token must succeed; HTTP ${accepted.status}`);
    checks.push({ operation: path, withTestTokenAccepted: true });
  }
  stop();
  for (const [secret, reason] of [
    ['2x0000000000000000000000000000000AA', 'invalid'],
    ['3x0000000000000000000000000000000AA', 'spent'],
  ]) {
    await start(secret);
    const denied = await request('/token?grant_type=password', { email: account.data.user.email, password, gotrue_meta_security: { captcha_token: 'XXXX.DUMMY.TOKEN.XXXX' } });
    assert.equal(denied.status, 400); assert(/captcha/i.test(denied.body.msg || denied.body.error_description || denied.body.message || ''));
    checks.push({ operation: 'login', providerRejection: reason, denied: true });
    stop();
  }
  writeFileSync('.backend-ci/auth-captcha-results/result.json', JSON.stringify({ passed: true, capturedAt: new Date().toISOString(), productionData: false, syntheticData: true, realAuth: true, officialTestKeys: true, checks }, null, 2));
  console.log(`PASS: ${checks.length} real Auth CAPTCHA checks using official Cloudflare dummy keys; loopback only.`);
} finally {
  stop();
  try { unlinkSync(envFile); } catch { /* Preserve diagnostics if the temporary file was not created. */ }
  for (const id of created) assert(!(await admin.auth.admin.deleteUser(id)).error, 'Synthetic CAPTCHA account cleanup must succeed');
}

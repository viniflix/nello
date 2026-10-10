import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from './isolated-runtime.mjs';
import { assertForwardRestoration } from '../backend/forward-restoration.mjs';
import { candidateMigrations } from '../backend/candidate-migrations.mjs';
import { totp } from './totp.mjs';
import { provisionPatientInvitation } from '../../supabase/functions/create-patient/provision-invitation.js';

assertIsolatedRuntime();
assertForwardRestoration(JSON.parse(readFileSync('.backend-ci/restore-results/result.json', 'utf8')));
const database = 'nello_qa_wave02_940';
const container = 'nello-sec02-auth';
const output = '.backend-ci/password-authorization-results';
const envFile = `${output}/auth.private.env`;
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
const sql = (db, input) => execFileSync('docker', ['exec', '-i', 'supabase_db_nello-reconstruction', 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db], { input, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
assert.equal(sql('postgres', `select exists(select 1 from pg_database where datname='${database}');`).trim(), 'f', 'Refusing to replace an existing database');
assert.equal(docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']).trim(), '', 'Refusing to replace an existing service');
const original = JSON.parse(docker(['inspect', 'supabase_auth_nello-reconstruction']))[0];
// Optionally reproduce the confirmed hosted Auth release without upgrading the
// existing local stack. Only the disposable service uses this official image.
const authVersion = process.env.NELLO_QA_AUTH_VERSION;
assert(!authVersion || ['v2.192.0', 'v2.197.0'].includes(authVersion), 'Reviewed Auth version required');
const authImage = authVersion ? `public.ecr.aws/supabase/gotrue:${authVersion}` : original.Config.Image;
const network = Object.keys(original.NetworkSettings.Networks).find(name => name.includes('nello-reconstruction'));
assert(network);
const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status', '--workdir', '.backend-ci', '--output', 'json']), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
assert(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
const base = 'http://127.0.0.1:55327';
const legal = { name: 'QA password authorization', user_type: 'nutritionist', legal_version: '2026-10-01.2', terms_accepted: true, analytics_allowed: false };
const originalPassword = '010190'; // Approved DDMMAA remains a valid initial credential.
const nextPassword = 'QA1!' + randomBytes(24).toString('hex');
const email = `sec02-${randomUUID()}@example.invalid`;
const checks = [];
const mailboxes = new Set();
const ownedMessageIds = new Set();
const mailBase = new URL(status.INBUCKET_URL || status.LOCAL_SMTP_URL || 'http://127.0.0.1:54324');
assert(['127.0.0.1', 'localhost'].includes(mailBase.hostname));
let databaseCreated = false, running = false;
mkdirSync(output, { recursive: true });
async function request(path, body, token = status.ANON_KEY, method = 'POST') {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', apikey: status.ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: response.status, body: await response.json() };
}
async function start(requireCurrent) {
  const env = new Map(original.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
  const url = new URL(env.get('GOTRUE_DB_DATABASE_URL'));
  assert.equal(url.hostname, 'supabase_db_nello-reconstruction');
  assert.equal(url.pathname, '/postgres');
  url.pathname = '/' + database;
  env.set('GOTRUE_DB_DATABASE_URL', url.href);
  env.set('GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD', String(requireCurrent));
  writeFileSync(envFile, [...env].map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
  docker(['run', '-d', '--name', container, '--network', network, '-p', '127.0.0.1:55327:9999', '--env-file', envFile, authImage]);
  running = true;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Only wait for our new disposable Auth service. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('Isolated Auth did not start');
}
function stop() { if (running) { docker(['rm', '-f', container]); running = false; } }
function passed(name) { checks.push(name); console.log('PASS password authorization: ' + name); }
async function invitationToken(recipient) {
  mailboxes.add(recipient);
  for (let i = 0; i < 40; i++) {
    const response = await fetch(new URL('/api/v1/search?query=' + encodeURIComponent('to:' + recipient), mailBase), { signal: AbortSignal.timeout(3000) });
    assert(response.ok, 'Local synthetic mailbox API required');
    const messages = (await response.json()).messages;
    if (messages.length) {
      for (const message of messages) ownedMessageIds.add(message.ID);
      const detail = await (await fetch(new URL('/api/v1/message/' + messages.at(-1).ID, mailBase))).json();
      const content = (detail.HTML || detail.Text || '').replace(/&amp;/g, '&');
      const urls = content.match(/https?:\/\/[^\s"'<>]+/g) || [];
      const link = urls.map(value => new URL(value)).find(url => url.searchParams.get('type') === 'invite');
      assert(link?.searchParams.get('token'), 'Original emailed invitation token required');
      return link.searchParams.get('token');
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('Synthetic invitation was not received by the local mailbox');
}
async function login(password) {
  const result = await request('/token?grant_type=password', { email, password });
  assert.equal(result.status, 200, 'Synthetic login must succeed');
  assert(result.body.access_token);
  return result.body;
}
try {
  sql('postgres', `create database ${database} template nello_qa_wave02_template owner supabase_admin;`);
  databaseCreated = true;
  for (const migration of candidateMigrations()) sql(database, migration.content);
  assert.equal(sql(database, 'select (select count(*) from auth.users)+(select count(*) from public.user_profiles);').trim(), '0');
  await start(false);
  const created = await request('/admin/users', { email, password: originalPassword, email_confirm: true, user_metadata: legal }, status.SERVICE_ROLE_KEY);
  assert.equal(created.status, 200); const id = created.body.id; assert.match(id, /^[a-f0-9-]{36}$/);
  let session = await login(originalPassword);
  const baseline = await request('/user', { password: nextPassword }, session.access_token, 'PUT');
  assert.equal(baseline.status, 200); passed('baseline confirms mutation without current password');
  const oldInviteEmail = `sec02-old-invite-${randomUUID()}@example.invalid`;
  const oldInvite = await request('/invite', { email: oldInviteEmail, data: legal }, status.SERVICE_ROLE_KEY);
  assert.equal(oldInvite.status, 200);
  const oldInviteToken = await invitationToken(oldInviteEmail);
  assert.equal((await request('/admin/users/' + oldInvite.body.id, { password: originalPassword }, status.SERVICE_ROLE_KEY, 'PUT')).status, 200);
  assert.equal((await request('/verify', { type: 'invite', token_hash: oldInviteToken })).status, 403);
  passed('baseline confirms original emailed invitation revoked by later password assignment');
  assert.equal((await request('/admin/users/' + id, { password: originalPassword }, status.SERVICE_ROLE_KEY, 'PUT')).status, 200);
  stop(); await start(true); session = await login(originalPassword);
  for (const [name, body, code] of [
    ['omitted current password', { password: nextPassword }, 'current_password_required'],
    ['forged recovery flag', { password: nextPassword, recovery: true, mode: 'recovery' }, 'current_password_required'],
    ['wrong current password', { password: nextPassword, current_password: 'wrong' }, 'current_password_invalid'],
  ]) {
    const denied = await request('/user', body, session.access_token, 'PUT');
    assert.equal(denied.status, 400);
    if (code === 'current_password_invalid') assert(['current_password_invalid', 'current_password_mismatch'].includes(denied.body.error_code));
    else assert.equal(denied.body.error_code, code);
    await login(originalPassword); passed(name + ' denied; old credential preserved');
  }
  sql(database, `update auth.sessions set created_at=now()-interval '48 hours' where user_id='${id}';`);
  const oldSession = await request('/user', { password: nextPassword }, session.access_token, 'PUT');
  assert.equal(oldSession.body.error_code, 'current_password_required'); passed('old session cannot mutate without current password');
  const changed = await request('/user', { password: nextPassword, current_password: originalPassword }, session.access_token, 'PUT');
  assert.equal(changed.status, 200); await login(nextPassword); passed('exact DDMMAA authorizes voluntary change');
  const oldLogin = await request('/token?grant_type=password', { email, password: originalPassword });
  assert.equal(oldLogin.status, 400); passed('old credential rejected after authorized change');
  const aal1 = await login(nextPassword);
  const factor = await request('/factors', { factor_type: 'totp', friendly_name: 'Synthetic SEC02' }, aal1.access_token);
  assert.equal(factor.status, 200); assert(factor.body.id); assert(factor.body.totp.secret);
  const challenge = await request('/factors/' + factor.body.id + '/challenge', {}, aal1.access_token);
  assert.equal(challenge.status, 200);
  const verified = await request('/factors/' + factor.body.id + '/verify', { challenge_id: challenge.body.id, code: totp(factor.body.totp.secret) }, aal1.access_token);
  assert.equal(verified.status, 200); assert(verified.body.access_token);
  // The enrollment session has already been promoted by legitimate TOTP.
  // Create a distinct session that has never completed the second factor.
  const freshAal1 = await login(nextPassword);
  const noMfa = await request('/user', { password: 'Mfa1!' + randomBytes(24).toString('hex'), current_password: nextPassword }, freshAal1.access_token, 'PUT');
  assert.equal(noMfa.status, 401); assert.equal(noMfa.body.error_code, 'insufficient_aal'); passed('correct current password cannot bypass enrolled MFA');
  const withMfa = await request('/user', { password: 'Mfa1!' + randomBytes(24).toString('hex'), current_password: nextPassword }, verified.body.access_token, 'PUT');
  assert.equal(withMfa.status, 200); passed('legitimate TOTP AAL2 and current password authorize change');
  assert.equal((await request('/factors/' + factor.body.id, undefined, verified.body.access_token, 'DELETE')).status, 200);
  const link = await request('/admin/generate_link', { type: 'recovery', email }, status.SERVICE_ROLE_KEY);
  assert.equal(link.status, 200); assert(link.body.hashed_token);
  const recovered = await request('/verify', { type: 'recovery', token_hash: link.body.hashed_token });
  assert.equal(recovered.status, 200); assert(recovered.body.access_token);
  const recoveryChange = await request('/user', { password: 'Recovery1!' + randomBytes(24).toString('hex') }, recovered.body.access_token, 'PUT');
  assert.equal(recoveryChange.status, 200); passed('server-verified recovery accepts forgotten current password');
  const replay = await request('/verify', { type: 'recovery', token_hash: link.body.hashed_token });
  assert.equal(replay.status, 403); passed('consumed recovery link cannot be reused');
  const inviteEmail = `sec02-invite-${randomUUID()}@example.invalid`;
  const authAdmin = {
    createUser: async input => { const result = await request('/admin/users', input, status.SERVICE_ROLE_KEY); return result.status === 200 ? { data: { user: result.body } } : { error: { status: result.status } }; },
    inviteUserByEmail: async recipient => { const result = await request('/invite', { email: recipient }, status.SERVICE_ROLE_KEY); return result.status === 200 ? { data: { user: result.body } } : { error: { status: result.status } }; },
  };
  const invite = await provisionPatientInvitation(authAdmin, { email: inviteEmail, password: originalPassword, metadata: legal, redirectTo: 'http://127.0.0.1:4173/update-password?mode=invite' });
  assert.equal(invite.invitationSent, true);
  const inviteToken = await invitationToken(inviteEmail);
  const invited = await request('/verify', { type: 'invite', token_hash: inviteToken });
  assert.equal(invited.status, 200);
  const invitedChange = await request('/user', { password: 'Invite1!' + randomBytes(24).toString('hex') }, invited.body.access_token, 'PUT');
  assert.equal(invitedChange.status, 200); passed('server-verified invitation preserves optional initial password change');
  assert.equal((await request('/verify', { type: 'invite', token_hash: inviteToken })).status, 403); passed('original emailed invitation is one use, without generating a replacement test link');
  const noSession = await request('/user', { password: nextPassword, current_password: originalPassword }, status.ANON_KEY, 'PUT');
  assert([401, 403].includes(noSession.status), 'Anonymous mutation must be rejected by Auth');
  assert(!noSession.body.id && !noSession.body.access_token, 'Anonymous request must not return a user/session');
  passed('anonymous direct mutation denied');
} finally {
  stop();
  try {
    for (const recipient of mailboxes) {
      const listing = await fetch(new URL('/api/v1/search?query=' + encodeURIComponent('to:' + recipient), mailBase));
      assert(listing.ok);
      for (const message of (await listing.json()).messages) ownedMessageIds.add(message.ID);
    }
    if (ownedMessageIds.size) {
      const removed = await fetch(new URL('/api/v1/messages', mailBase), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...ownedMessageIds] }) });
      assert([200, 204].includes(removed.status), 'Owned synthetic message cleanup must succeed');
    }
  } finally {
    if (databaseCreated) sql('postgres', `select pg_terminate_backend(pid) from pg_stat_activity where datname='${database}' and pid<>pg_backend_pid(); drop database ${database};`);
    try { unlinkSync(envFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
writeFileSync(output + '/result.json', JSON.stringify({ capturedAt: new Date().toISOString(), passed: true, productionData: false, realAuth: true, authImage, syntheticDatabaseDropped: true, temporaryAccountsRemovedWithDatabase: true, checks }, null, 2));

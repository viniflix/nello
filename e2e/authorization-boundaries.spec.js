import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertIsolatedRuntime } from '../scripts/qa/isolated-runtime.mjs';
assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
const client = () => createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function actor(key) {
  const connection = client();
  const result = await connection.auth.signInWithPassword({ email: fixture.personas[key].email, password: fixture.password });
  expect(result.error).toBeNull();
  await connection.realtime.setAuth(result.data.session.access_token);
  return connection;
}

test('REST protects administrative profile columns and preserves legitimate personal edits', async () => {
  const patient = await actor('patient-a');
  const id = fixture.personas['patient-a'].id;
  for (const update of [{ is_admin: true }, { is_active: false }, { nutritionist_id: fixture.personas['nutritionist-b'].id }, { is_simulation: true }]) {
    const result = await patient.from('user_profiles').update(update).eq('id', id);
    expect(result.error?.code).toBe('42501');
  }
  const edit = await patient.from('user_profiles').update({ phone: 'QA temporary' }).eq('id', id).select('phone').single();
  expect(edit.error).toBeNull();
  expect(edit.data.phone).toBe('QA temporary');
  const reset = await patient.from('user_profiles').update({ phone: null }).eq('id', id);
  expect(reset.error).toBeNull();
});

test('HTTP RPCs bind recipient, feed and adherence queries to the authenticated caller', async () => {
  const owner = await actor('nutritionist-a');
  const other = fixture.personas['nutritionist-b'].id;
  for (const name of ['get_nutritionist_conversations','get_patients_for_new_chat','get_daily_adherence','get_patients_pending_data_optimized','get_patients_low_adherence_optimized','get_comprehensive_activity_feed_optimized']) {
    const denied = await owner.rpc(name, { p_nutritionist_id: other });
    expect(denied.error?.code, name).toBe('42501');
  }
  const allowed = await owner.rpc('get_patients_for_new_chat', { p_nutritionist_id: fixture.personas['nutritionist-a'].id });
  expect(allowed.error).toBeNull();
  expect(allowed.data.some(row => row.id === fixture.personas['patient-a'].id)).toBe(true);
  const anon = client();
  const denied = await anon.rpc('get_daily_adherence', { p_nutritionist_id: other });
  expect(denied.error?.code).toBe('42501');
});

test('Realtime delivers an actual chat only to its participant and denies forged sender via REST', async () => {
  const owner = await actor('nutritionist-a');
  const outsider = await actor('nutritionist-b');
  const patient = await actor('patient-a');
  const ownerId = fixture.personas['nutritionist-a'].id;
  const patientId = fixture.personas['patient-a'].id;
  const marker = 'QA chat ' + randomUUID();
  const outsiderEvents = [];
  let receive;
  const received = new Promise(resolve => { receive = resolve; });
  const channels = [];
  const subscribe = async (connection, onEvent) => {
    const channel = connection.channel('wave05-' + randomUUID()).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, onEvent);
    channels.push([connection, channel]);
    await new Promise((resolve, reject) => {
      let joined = false; let postgresReady = false;
      const timer = setTimeout(() => reject(new Error('Realtime PostgreSQL subscription timeout')), 20000);
      const ready = () => { if (joined && postgresReady) { clearTimeout(timer); resolve(); } };
      channel.on('system', {}, payload => {
        if (payload.status === 'ok' && payload.extension === 'postgres_changes') { postgresReady = true; ready(); }
        else if (payload.status === 'error') { clearTimeout(timer); reject(new Error('Realtime PostgreSQL subscription error')); }
      });
      channel.subscribe(status => { if (status === 'SUBSCRIBED') { joined = true; ready(); } else if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error('Realtime channel error')); } });
    });
  };
  try {
    await subscribe(owner, event => { if (event.new.message === marker) receive(event.new); });
    await subscribe(outsider, event => { if (event.new.message === marker) outsiderEvents.push(event.new); });
    const forged = await patient.from('chats').insert({ from_id: ownerId, to_id: patientId, message: marker });
    expect(forged.error?.code).toBe('42501');
    const legitimate = await patient.from('chats').insert({ from_id: patientId, to_id: ownerId, message: marker });
    expect(legitimate.error).toBeNull();
    let timer;
    const payload = await Promise.race([received, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Authorized Realtime delivery missing')), 12000); })]).finally(() => clearTimeout(timer));
    expect(payload.from_id).toBe(patientId);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(outsiderEvents).toEqual([]);
  } finally {
    for (const [connection, channel] of channels) await connection.removeChannel(channel);
    execFileSync('docker', ['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'], { input: `delete from public.notifications where type='new_message' and content->>'message'='${marker}';delete from public.chats where message='${marker}';`, stdio: ['pipe','ignore','pipe'] });
  }
});

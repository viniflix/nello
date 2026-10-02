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

test('private Realtime signals participants and denies forged sender and unrelated recipients', async () => {
  const owner = await actor('nutritionist-a'), outsider = await actor('nutritionist-b'), patient = await actor('patient-a');
  const ownerId = fixture.personas['nutritionist-a'].id, patientId = fixture.personas['patient-a'].id;
  const marker = 'QA chat ' + randomUUID();
  const outsiderEvents = [], ownerEvents = [], channels = [];
  const subscribe = async (connection, id, events) => {
    const inbox = await connection.rpc('get_realtime_inbox', { p_actor: id }); expect(inbox.error).toBeNull();
    const channel = connection.channel(inbox.data, { config: { private: true, presence: { enabled: false } } }).on('broadcast', { event: 'changed' }, ({ payload }) => events.push(payload));
    channels.push([connection, channel]);
    await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(Error('Private inbox timeout')),15000); channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('Private inbox denied'));}}); });
  };
  try {
    await subscribe(owner, ownerId, ownerEvents);
    await subscribe(outsider, fixture.personas['nutritionist-b'].id, outsiderEvents);
    expect((await patient.from('chats').insert({ from_id: ownerId, to_id: patientId, message: marker })).error?.code).toBe('42501');
    const legitimate = await patient.rpc('send_chat_message', { p_actor: patientId, p_recipient: ownerId, p_message: marker, p_client_id: randomUUID() });
    expect(legitimate.error).toBeNull(); expect(legitimate.data.from_id).toBe(patientId);
    await expect.poll(()=>ownerEvents.some(event=>event.kind==='chat')).toBe(true);
    const history=await owner.rpc('list_chat_messages',{p_actor:ownerId,p_recipient:patientId});expect(history.data.messages.some(row=>row.message===marker)).toBe(true);
    expect(outsiderEvents).toEqual([]);expect(ownerEvents.every(event=>!('message' in event)&&!('from_id' in event))).toBe(true);
  } finally {
    for(const[connection,channel]of channels)await connection.removeChannel(channel);
    execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`delete from public.notifications where type='new_message' and content->>'message'='${marker}';delete from public.chats where message='${marker}';`,stdio:['pipe','ignore','pipe']});
  }
});

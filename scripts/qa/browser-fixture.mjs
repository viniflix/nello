import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from './isolated-runtime.mjs';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { candidateMigrations } from '../backend/candidate-migrations.mjs';
import { applyFixtureCandidates } from './fixture-candidates.mjs';
import { inspectHealth } from '../../operations/availability/health.mjs';
assertIsolatedRuntime();
const status = JSON.parse(execFileSync(supabaseCommand,supabaseArgs(['status','--workdir','.backend-ci','--output','json']), { encoding: 'utf8' }));
const api = new URL(status.API_URL);
const project = readFileSync('.backend-ci/supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const qaPort = { 'nello-reconstruction': '54321', 'nello-wave03-qa': '55321' }[project];
if (api.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(api.hostname) || !qaPort || api.port !== qaPort) throw Error('Registered loopback disposable Supabase required.');
const sql = input => execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', `supabase_db_${project}`, 'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', timeout: 30000 });
if (sql('select (select count(*) from auth.users)+(select count(*) from public.user_profiles);').trim() !== '0') throw Error('Browser fixture requires empty reconstructed accounts.');
applyFixtureCandidates(sql, candidateMigrations());
const url = `http://localhost:${qaPort}`;
// A CLI reset can finish while Auth/Storage are still reconnecting. Wait on
// read-only contracts before creating accounts; never retry account mutations.
let ready = 0;
for (let attempt = 0; attempt < 30 && ready < 3; attempt++) {
  const health = await inspectHealth({ env: { NELLO_LOCAL_QA: 'isolated', SUPABASE_URL: url, SUPABASE_ANON_KEY: status.ANON_KEY } });
  ready = health.status === 'operational' ? ready + 1 : 0;
  if (ready < 3) await new Promise(resolve => setTimeout(resolve, 1000));
}
if (ready < 3) throw Error('Disposable services did not become ready after reconstruction.');
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const password = 'Qa1!' + randomBytes(24).toString('hex');
const personas = {};
for (const persona of JSON.parse(readFileSync('operations/synthetic-personas.json')).personas.filter(p=>p.key!=='anonymous')) {
  const type = persona.role === 'operator' ? 'admin' : persona.role;
  // GoTrue applies app_metadata after its INSERT trigger. Provision minimal
  // legal accounts, then let the isolated SQL operator assign fixture roles.
  const { data, error } = await admin.auth.admin.createUser({ email:persona.email, password, email_confirm:true,
    user_metadata:{ user_type:'nutritionist', name:'QA ' + persona.key, legal_version:'2026-10-01.2',terms_accepted:true,analytics_allowed:false }, ...(persona.status==='disabled'?{ban_duration:'100h'}:{}) });
  if (error) throw error;
  if (!/^[a-f0-9-]{36}$/.test(data.user.id)) throw Error('Invalid synthetic user identifier');
  if(type!=='nutritionist') sql(`delete from public.professional_verifications where user_id='${data.user.id}';update public.user_profiles set user_type='patient' where id='${data.user.id}';`);
  personas[persona.key] = { ...persona, id:data.user.id };
}
const id = key=>personas[key].id;
sql(`update public.professional_verifications set status='approved',professional_role='nutritionist',crn_region='CRN-3',crn_number='QA-'||user_id::text,normalized_crn='QA'||user_id::text,verification_method='approved_by_migration',valid_until=now()+interval '1 year' where user_id in ('${id('nutritionist-a')}','${id('nutritionist-b')}');
update public.professional_verifications set status='not_submitted',valid_until=null where user_id='${id('nutritionist-pending')}';
update public.user_profiles set is_active=false where id='${id('disabled')}';
insert into private.admin_operators(user_id,grant_reason) values
('${id('admin-aal1')}','synthetic QA'),('${id('admin-aal2')}','synthetic QA');`);
for (const [pro, patient] of [['nutritionist-a','patient-a'],['nutritionist-b','patient-b']]) {
  sql(`update public.user_profiles set nutritionist_id='${id(pro)}',name='QA ${patient}',birth_date='1990-01-01',weight=60,height=165 where id='${id(patient)}';
insert into public.growth_records(patient_id,weight,height,record_date) values('${id(patient)}',60,165,current_date);
insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values('${id(pro)}','${id(patient)}','active');`);
}
mkdirSync('.backend-ci/browser-runtime',{recursive:true});
writeFileSync('.backend-ci/browser-runtime/fixture.json',JSON.stringify({url,anonKey:status.ANON_KEY,password,personas}),{mode:0o600});
writeFileSync('.env.production.local', `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${status.ANON_KEY}\nVITE_PUBLIC_POSTHOG_KEY=phc_nello_synthetic_telemetry\nVITE_PUBLIC_POSTHOG_HOST=http://localhost:4173\nVITE_SENTRY_DSN=\nVITE_TURNSTILE_SITE_KEY=\n` ,{mode:0o600});
console.log('Nine synthetic Auth personas created on loopback only; production credentials unavailable.');

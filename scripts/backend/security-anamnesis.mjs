import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { candidateMigrations } from './candidate-migrations.mjs';
import { assertForwardRestoration } from './forward-restoration.mjs';
import { assertIsolatedRuntime } from '../qa/isolated-runtime.mjs';

assertIsolatedRuntime();
const restoration = JSON.parse(readFileSync('.backend-ci/restore-results/result.json', 'utf8'));
assertForwardRestoration(restoration);
const output = '.backend-ci/security-anamnesis-results';
mkdirSync(output, { recursive: true });
const container = 'supabase_db_nello-reconstruction';
const args = database => ['exec', '-i', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database];
const sql = (database, input) => execFileSync('docker', args(database), { input, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
const run = (database, input) => {
  const child = spawn('docker', args(database));
  let log = '';
  child.stdout.on('data', data => { log += data; });
  child.stderr.on('data', data => { log += data; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(log) : reject(Error(log)));
  });
  // Attach a rejection handler before waiting for the other connection's lock.
  done.catch(() => {});
  child.stdin.end(input);
  return { child, done };
};
const source = readFileSync('supabase/tests/security_anamnesis_lifecycle.sql', 'utf8');
const seed = source.slice(0, source.indexOf('create function pg_temp.sec01_attempt'));
const record = '80000000-0000-0000-0000-000000000901';
const token = '90000000-0000-0000-0000-000000000901';
const patient = '20000000-0000-0000-0000-000000000901';
const professional = '10000000-0000-0000-0000-000000000901';
const write = `set local role anon; select set_config('request.jwt.claim.sub','',true); select public.submit_anamnesis_by_token('${token}','{"symptom":"race"}','draft',false,null,null);`;
const end = `set local role authenticated; select set_config('request.jwt.claim.sub','${professional}',true); select public.end_care_episode('${patient}','synthetic race');`;
async function waitFor(database, name, condition) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (sql(database, `select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='${name}' and ${condition});`).trim() === 't') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Connection ${name} did not reach the expected database lock state`);
}
async function race(database, firstWrite) {
  sql(database, seed + 'commit;');
  const first = run(database, `begin; set application_name='sec01-first'; ${firstWrite ? write : end} select pg_sleep(3); commit;`);
  let second;
  try {
    await waitFor(database, 'sec01-first', "wait_event='PgSleep'");
    const rejectedWrite = `set local role anon; select set_config('request.jwt.claim.sub','',true); do $race$ begin begin perform public.submit_anamnesis_by_token('${token}','{"symptom":"race"}','draft',false,null,null); raise exception 'write_after_revocation_allowed'; exception when insufficient_privilege then if sqlerrm<>'anamnesis_relationship_inactive' then raise;end if;end;end $race$;`;
    second = run(database, `begin; set application_name='sec01-second'; ${firstWrite ? end : rejectedWrite} commit;`);
    await waitFor(database, 'sec01-second', "wait_event_type='Lock'");
    const logs = await Promise.all([first.done, second.done]);
    const expected = firstWrite ? '{"symptom": "race"}' : '{}';
    if (sql(database, `select content::text from public.anamnesis_records where id='${record}';`).trim() !== expected) throw Error('Race changed the record outside its active episode');
    if (sql(database, `select status from public.care_episodes where patient_id='${patient}';`).trim() !== 'ended') throw Error('Revocation did not commit');
    return logs.join('\n');
  } finally {
    // A failed check must not leave either disposable transaction running.
    sql(database, "select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name in ('sec01-first','sec01-second') and pid<>pg_backend_pid();");
    await Promise.allSettled([first.done, ...(second ? [second.done] : [])]);
  }
}
const results = [];
for (const [index, mode] of ['baseline', 'candidate', 'write-first', 'end-first'].entries()) {
  const database = `nello_qa_wave02_${930 + index}`;
  let created = false;
  try {
    sql('postgres', `create database ${database} template ${restoration.database} owner supabase_admin;`);
    created = true;
    for (const migration of candidateMigrations()) {
      if (mode === 'baseline' && migration.file.includes('security_anamnesis_revocation')) continue;
      sql(database, migration.content);
    }
    const log = index < 2
      ? sql(database, `select set_config('qa.sec01_baseline','${index === 0 ? 1 : 0}',false);\n${source}`)
      : await race(database, index === 2);
    writeFileSync(`${output}/${mode}.log`, log);
    results.push({ mode, passed: true, databaseDropped: true });
    console.log(`PASS security anamnesis ${mode}`);
  } finally {
    if (created) sql('postgres', `drop database ${database};`);
  }
}
writeFileSync(`${output}/result.json`, JSON.stringify({ capturedAt: new Date().toISOString(), productionData: false, results }, null, 2));

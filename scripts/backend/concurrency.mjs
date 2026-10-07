import {assertIsolatedRuntime} from '../qa/isolated-runtime.mjs';
import { spawn } from 'node:child_process';

const actor = '10000000-0000-0000-0000-000000000061';
const target = suffix => `70000000-0000-0000-0000-0000000000${suffix}`;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function assertRemoteDatabase(database, environment = process.env) {
  assertIsolatedRuntime(environment);
  if (!/^nello_qa_wave02_\d+$/.test(database)) throw Error('Concurrency requires a synthetic matrix database.');
}

export function startSession(database, script) {
  assertRemoteDatabase(database);
  const child = spawn('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres',
    'supabase_db_nello-reconstruction', 'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin',
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', database], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const done = new Promise(resolve => {
    child.once('error', error => resolve({ code: -1, output: `${output}\n${error.message}` }));
    child.once('close', code => resolve({ code, output }));
  });
  // Both the server and the client have limits, including the barrier holder.
  const timeout = setTimeout(() => child.kill(), 30000);
  done.then(() => clearTimeout(timeout));
  child.stdin.on('error', error => { output += `\n${error.message}`; });
  child.stdin.end(`set statement_timeout = '20s';\n${script}`);
  return { done, stop: () => child.kill() };
}

export function assertAtomicPair(label, results) {
  const winners = results.filter(result => result.code === 0);
  const losers = results.filter(result => result.code !== 0);
  if (results.length !== 2 || winners.length !== 1 || losers.length !== 1
    || !/PT409/.test(losers[0].output) || !/amendment_chain_conflict/.test(losers[0].output)) {
    throw Error(`${label}: expected one winner and one PT409 amendment_chain_conflict.\n${JSON.stringify(results)}`);
  }
}

export async function runRace({ database, label, key, scripts, query, session = startSession,
  sleep = delay, attempts = 100, environment = process.env, assertPair = assertAtomicPair }) {
  assertRemoteDatabase(database, environment);
  if (!Number.isSafeInteger(key) || key <= 0 || scripts.length !== 2
    || scripts.some(script => !script.includes('__BARRIER__'))) throw Error('Invalid concurrency scenario.');
  const sessions = [];
  const release = `update public.c4_concurrency_barrier_control set release=true where barrier_key=${key}`;
  try {
    sessions.push(session(database, `select pg_advisory_lock(${key});
insert into public.c4_concurrency_barrier_control(barrier_key,release) values (${key},false);
do $$ begin loop exit when (select release from public.c4_concurrency_barrier_control where barrier_key=${key});
perform pg_sleep(0.05); end loop; end $$; select pg_advisory_unlock(${key});`));
    let ready = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      ready = query(database, `select count(*) from public.c4_concurrency_barrier_control where barrier_key=${key} and not release`).trim() === '1';
      if (ready) break;
      await sleep(50);
    }
    if (!ready) throw Error(`${label}: barrier did not acquire its lock.`);
    sessions.push(...scripts.map(script => session(database,
      script.replace('__BARRIER__', `perform pg_advisory_xact_lock_shared(${key});`))));
    let overlap = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const waiting = Number(query(database, `select count(*) from pg_locks where locktype='advisory' and objid=${key} and not granted`).trim());
      overlap = waiting === 2;
      if (overlap) break;
      await sleep(50);
    }
    if (!overlap) throw Error(`${label}: both sessions did not overlap.`);
    query(database, release);
    const results = await Promise.all(sessions.map(session => session.done));
    if (results[0].code !== 0) throw Error(`${label}: barrier failed: ${results[0].output}`);
    assertPair(label, results.slice(1));
    return { label, overlappingSessions: 2, results: results.slice(1) };
  } finally {
    try { query(database, release); } finally {
      for (const session of sessions) session.stop();
      await Promise.allSettled(sessions.map(session => session.done));
    }
  }
}

function transaction(body, claims = '') {
  return `begin; set role authenticated; select set_config('request.jwt.claim.sub','${actor}',true);
${claims} do $$ declare v_impact jsonb; begin ${body} end $$; commit;`;
}
const signClaims = `select set_config('request.jwt.claims',jsonb_build_object('sub','${actor}','aal','aal1')::text,true);`;
function sign(replacement) {
  if (!uuid.test(replacement)) throw Error('Missing synthetic correction replacement.');
  return transaction(`__BARRIER__ perform public.sign_clinical_record('${replacement}');`, signClaims);
}
function invalidate(suffix) {
  return transaction(`v_impact:=public.get_clinical_record_amendment_impact('${target(suffix)}');
__BARRIER__ perform public.invalidate_clinical_record('${target(suffix)}',
'Invalidacao concorrente com justificativa clinica suficiente.',
jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true));`,
`select set_config('request.jwt.claims',jsonb_build_object('sub','${actor}',
'auth_time',extract(epoch from now())::bigint,'aal','aal1','session_id','race-${suffix}',
'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);`);
}

export async function runAmendmentConcurrency({ database, query, ...dependencies }) {
  assertRemoteDatabase(database, dependencies.environment);
  const correction = transaction(`v_impact:=public.get_clinical_record_amendment_impact('${target('71')}');
__BARRIER__ perform public.start_clinical_record_correction('${target('71')}',
'Correcao concorrente valida com justificativa clinica suficiente.',
jsonb_build_object('impact_hash',v_impact->>'impact_hash','confirmed',true));`);
  const replacement = suffix => query(database, `select replacement_record_id from public.clinical_record_amendments
where target_record_id='${target(suffix)}' and status='draft'`).trim();
  const scenarios = [
    ['double correction', correction, correction],
    ['correction signing versus invalidation', sign(replacement('75')), invalidate('75')],
    ['double invalidation', invalidate('73'), invalidate('73')],
    ['double signing', sign(replacement('74')), sign(replacement('74'))],
  ];
  const evidence = [];
  for (const [index, [label, first, second]] of scenarios.entries()) {
    evidence.push(await runRace({ database, query, label, key: 91041 + index,
      scripts: [first, second], ...dependencies }));
  }
  query(database, `do $$ begin
if (select count(*) from public.clinical_record_amendments where root_record_id='${target('71')}' and status='draft')<>1
${['73', '74', '75'].map(suffix => `or (select count(*) from public.clinical_record_amendments where root_record_id='${target(suffix)}' and status='effective')<>1`).join('\n')}
then raise exception 'c4_concurrency_postcondition_failed'; end if; end $$;`);
  return evidence;
}

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertIsolatedRuntime } from './isolated-runtime.mjs';
import { assertRollbackEndpoint, assertRollbackTemplate, exerciseFunctionRollback } from './rollback-contract.mjs';

assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json', 'utf8'));
assertRollbackEndpoint(fixture.url);
const restoration = JSON.parse(readFileSync('.backend-ci/restore-results/result.json', 'utf8'));
assertRollbackTemplate(restoration);
const source = 'supabase_db_nello-reconstruction', worker = 'supabase_edge_runtime_nello-reconstruction';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
for (const container of [source, worker]) {
  const info = JSON.parse(docker(['inspect', container]))[0];
  if (info.Config.Labels?.['com.supabase.cli.project'] !== 'nello-reconstruction') throw Error('Rollback requires the isolated CLI containers');
}
const suffix = randomBytes(6).toString('hex'), database = `nello_wave16_rollback_${suffix}`, slug = `qa-rollback-${suffix}`;
const root = path.resolve('.backend-ci/supabase/functions'), directory = path.resolve(root, slug);
if (path.dirname(directory) !== root || existsSync(directory)) throw Error('Unsafe rollback fixture directory');
const entry = path.join(directory, 'index.ts');
const sql = (db, statement) => execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', source,
  'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', db, '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
{ input: statement, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const restartWorker = () => docker(['restart', worker]);
let created = false;
mkdirSync(directory);
try {
  const functions = await exerciseFunctionRollback({
    install: async version => { writeFileSync(entry, `Deno.serve(() => Response.json({ version: ${version} }));\n`); restartWorker(); },
    read: async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const response = await fetch(`${fixture.url}/functions/v1/${slug}`, {
            headers: { authorization: `Bearer ${fixture.anonKey}`, apikey: fixture.anonKey }, signal: AbortSignal.timeout(3000),
          });
          if (response.ok) return (await response.json()).version;
        } catch { /* Bounded readiness only; a wrong version is never retried. */ }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      throw Error('Isolated versioned function unavailable');
    },
  });
  sql('postgres', `CREATE DATABASE ${database} TEMPLATE ${restoration.database} OWNER supabase_admin;`); created = true;
  // Reversible technical schema only, inside a clone. Security/clinical
  // migrations keep their forward-contract checks and are not downgraded.
  sql(database, "CREATE TABLE public.qa_rollback_contract(id integer PRIMARY KEY, content text NOT NULL); INSERT INTO public.qa_rollback_contract VALUES(1,'synthetic-preserved');");
  const digest = () => sql(database, "SELECT md5(string_agg(id::text||content,'' ORDER BY id)) FROM public.qa_rollback_contract;");
  const before = digest();
  const columnCount = () => sql(database, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='qa_rollback_contract' AND column_name='optional_hint';");
  sql(database, 'ALTER TABLE public.qa_rollback_contract ADD COLUMN optional_hint text;');
  if (columnCount() !== '1') throw Error('Compatible migration not applied');
  sql(database, 'ALTER TABLE public.qa_rollback_contract DROP COLUMN optional_hint;');
  if (columnCount() !== '0' || digest() !== before) throw Error('Compatible rollback damaged the contract or original data');
  mkdirSync('.backend-ci/rollback-results', { recursive: true });
  writeFileSync('.backend-ci/rollback-results/result.json', JSON.stringify({ passed: true, productionData: false,
    functions: { ...functions, actualEdgeHttp: true, coldWorkerVersions: [1, 2, 1] },
    migration: { clonedDatabase: true, applied: true, reverted: true, originalRowsMatched: true },
    scope: 'Synthetic Edge worker and additive schema contract; not a production rollback or destructive migration guarantee',
    completedAt: new Date().toISOString() }, null, 2));
  console.log('PASS: real isolated Edge HTTP rollback and compatible cloned-schema rollback; original rows preserved.');
} finally {
  if (!/^nello_wave16_rollback_[a-f0-9]{12}$/.test(database)) throw Error('Unsafe rollback database cleanup');
  if (created) sql('postgres', `DROP DATABASE ${database} WITH (FORCE);`);
  if (existsSync(entry)) unlinkSync(entry);
  restartWorker();
}
